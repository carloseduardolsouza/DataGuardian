import { randomUUID } from 'node:crypto';

type EvolutionSendParams = {
  apiUrl: string;
  apiKey: string;
  instance: string;
  to: string;
  text: string;
};

type EvolutionQrParams = {
  apiUrl: string;
  apiKey: string;
  instance: string;
};

export type EvolutionConnectionStatus = 'connected' | 'disconnected' | 'not_found' | 'unknown';

export class EvolutionApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errorCode:
      | 'INSTANCE_NOT_FOUND'
      | 'INSTANCE_ALREADY_EXISTS'
      | 'QR_NOT_AVAILABLE'
      | 'REQUEST_FAILED',
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'EvolutionApiError';
    Object.setPrototypeOf(this, EvolutionApiError.prototype);
  }
}

function stringifyPayload(value: unknown) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function normalizePhone(value: string) {
  return value.replace(/\D+/g, '');
}

function buildPhoneCandidates(value: string) {
  const normalized = normalizePhone(value);
  if (!normalized) return [];
  const candidates = [normalized];

  const seemsLocalBr = (normalized.length === 10 || normalized.length === 11) && !normalized.startsWith('55');
  if (seemsLocalBr) candidates.push(`55${normalized}`);

  return Array.from(new Set(candidates));
}

async function postWithTimeout(url: string, payload: unknown, headers: Record<string, string>, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestWithTimeout(
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  payload: unknown,
  headers: Record<string, string>,
  timeoutMs = 10_000,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      ...((method === 'POST' || method === 'DELETE') ? { body: JSON.stringify(payload) } : {}),
      signal: controller.signal,
    });

    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function tryEvolutionAction(params: {
  apiUrl: string;
  apiKey: string;
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  body?: unknown;
}) {
  const base = params.apiUrl.replace(/\/+$/, '');
  const url = `${base}${params.path}`;
  const headers = { apikey: params.apiKey };

  try {
    const response = await requestWithTimeout(
      params.method,
      url,
      params.body ?? {},
      headers,
    );
    const rawText = await response.text().catch(() => '');
    const payload = parseJsonSafe(rawText);
    return { ok: response.ok, status: response.status, payload };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      payload: err instanceof Error ? err.message : String(err),
    };
  }
}

function looksLikeBase64Image(value: string) {
  if (!value) return false;
  if (value.startsWith('data:image/')) return true;
  return /^[A-Za-z0-9+/=\r\n]+$/.test(value) && value.length > 200;
}

function toDataUrl(value: string) {
  if (value.startsWith('data:image/')) return value;
  return `data:image/png;base64,${value.replace(/\s+/g, '')}`;
}

function extractQrCandidate(value: unknown): string | null {
  if (typeof value === 'string') {
    return looksLikeBase64Image(value) ? toDataUrl(value) : null;
  }

  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = extractQrCandidate(item);
      if (candidate) return candidate;
    }
    return null;
  }

  const obj = value as Record<string, unknown>;
  const priorityKeys = [
    'qrcode',
    'qr',
    'base64',
    'qrCode',
    'qr_code',
    'code',
  ];

  for (const key of priorityKeys) {
    const candidate = extractQrCandidate(obj[key]);
    if (candidate) return candidate;
  }

  for (const val of Object.values(obj)) {
    const candidate = extractQrCandidate(val);
    if (candidate) return candidate;
  }

  return null;
}

function parseJsonSafe(raw: string): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function payloadMentionsNameAlreadyInUse(payload: unknown) {
  const text = stringifyPayload(payload);
  return /already in use|ja esta em uso|name.+in use/i.test(text);
}

function payloadMentionsConnected(payload: unknown) {
  const text = stringifyPayload(payload);
  return /open|connected|conectado|online/i.test(text);
}

function payloadMentionsInstanceDoesNotExist(payload: unknown) {
  const text = stringifyPayload(payload);
  return /does not exist|nao existe|not exist/i.test(text);
}

function payloadMentionsDisconnected(payload: unknown) {
  const text = stringifyPayload(payload);
  return /close|closed|disconnected|desconectado|offline|connecting|pairing|qrcode|qr/i.test(text);
}

export async function getEvolutionConnectionStatus(params: EvolutionQrParams): Promise<{
  instance: string;
  status: EvolutionConnectionStatus;
  connected: boolean;
  raw: unknown;
}> {
  const instance = encodeURIComponent(params.instance);
  const attempts: Array<{ method: 'GET'; path: string }> = [
    { method: 'GET', path: `/instance/connectionState/${instance}` },
    { method: 'GET', path: `/instance/connect/${instance}` },
  ];

  let lastPayload: unknown = null;
  for (const attempt of attempts) {
    const response = await tryEvolutionAction({
      apiUrl: params.apiUrl,
      apiKey: params.apiKey,
      method: attempt.method,
      path: attempt.path,
    });
    lastPayload = response.payload;

    if (!response.ok) {
      if (payloadMentionsInstanceDoesNotExist(response.payload)) {
        return { instance: params.instance, status: 'not_found', connected: false, raw: response.payload };
      }
      continue;
    }

    if (payloadMentionsConnected(response.payload)) {
      return { instance: params.instance, status: 'connected', connected: true, raw: response.payload };
    }
    if (payloadMentionsDisconnected(response.payload)) {
      return { instance: params.instance, status: 'disconnected', connected: false, raw: response.payload };
    }
  }

  if (payloadMentionsInstanceDoesNotExist(lastPayload)) {
    return { instance: params.instance, status: 'not_found', connected: false, raw: lastPayload };
  }

  return { instance: params.instance, status: 'unknown', connected: false, raw: lastPayload };
}

export async function sendEvolutionText(params: EvolutionSendParams): Promise<void> {
  const base = params.apiUrl.replace(/\/+$/, '');
  const numbers = buildPhoneCandidates(params.to);
  if (numbers.length === 0) {
    throw new Error('Numero de destino invalido para WhatsApp');
  }

  const endpoint = `${base}/message/sendText/${encodeURIComponent(params.instance)}`;
  let lastStatus = 0;
  let lastRaw = '';
  let lastError: unknown = null;

  for (const number of numbers) {
    const payload = {
      number,
      text: params.text,
    };

    try {
      const response = await postWithTimeout(
        endpoint,
        payload,
        { apikey: params.apiKey },
      );

      if (response.ok) return;

      lastStatus = response.status;
      lastRaw = await response.text().catch(() => '');
    } catch (error) {
      lastError = error;
      lastRaw = error instanceof Error ? error.message : String(error);
    }
  }

  if (lastError && !lastStatus) {
    throw new Error(`Falha ao chamar Evolution API: ${lastRaw}`);
  }

  throw new Error(`Evolution API retornou ${lastStatus}${lastRaw ? `: ${lastRaw}` : ''}`);
}

export async function fetchEvolutionQrCode(params: EvolutionQrParams): Promise<string> {
  const base = params.apiUrl.replace(/\/+$/, '');
  const instance = encodeURIComponent(params.instance);
  const headers = { apikey: params.apiKey };

  const attempts: Array<{ method: 'GET' | 'POST'; path: string; body?: unknown }> = [
    { method: 'POST', path: `/instance/connect/${instance}`, body: {} },
    { method: 'GET', path: `/instance/connect/${instance}` },
    { method: 'GET', path: `/instance/qr/${instance}` },
    { method: 'GET', path: `/instance/connectionState/${instance}` },
  ];

  let lastError = '';
  let instanceAlreadyExists = false;
  let instanceSeemsConnected = false;
  let instanceMissing = false;
  for (const attempt of attempts) {
    try {
      const response = await requestWithTimeout(
        attempt.method,
        `${base}${attempt.path}`,
        attempt.body ?? {},
        headers,
      );
      const rawText = await response.text().catch(() => '');
      const parsedPayload = parseJsonSafe(rawText);

      if (!response.ok) {
        if (payloadMentionsInstanceDoesNotExist(parsedPayload)) {
          instanceMissing = true;
          lastError = 'Instancia nao existe na Evolution API';
          continue;
        }

        if (
          attempt.path === '/instance/create'
          && response.status === 403
          && payloadMentionsNameAlreadyInUse(parsedPayload)
        ) {
          instanceAlreadyExists = true;
          lastError = 'Instancia ja existe na Evolution API';
          continue;
        }
        lastError = `HTTP ${response.status}${rawText ? `: ${rawText}` : ''}`;
        continue;
      }

      const payload = parsedPayload;
      const qrDataUrl = extractQrCandidate(payload);
      if (qrDataUrl) return qrDataUrl;

      if (attempt.path.includes('/connectionState/') && payloadMentionsConnected(payload)) {
        instanceSeemsConnected = true;
      }
      lastError = 'Resposta sem QR code';
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  if (instanceSeemsConnected) {
    throw new EvolutionApiError(
      `A instancia '${params.instance}' ja esta conectada. Nao ha QR Code pendente para leitura.`,
      409,
      'QR_NOT_AVAILABLE',
    );
  }

  if (instanceMissing) {
    throw new EvolutionApiError(
      `A instancia '${params.instance}' ainda nao existe na Evolution API.`,
      404,
      'INSTANCE_NOT_FOUND',
      { instance: params.instance },
    );
  }

  if (instanceAlreadyExists) {
    throw new EvolutionApiError(
      `A instancia '${params.instance}' ja existe na Evolution API, mas o QR Code nao foi retornado agora. Desconecte a instancia para gerar novo QR.`,
      409,
      'INSTANCE_ALREADY_EXISTS',
      { instance: params.instance },
    );
  }

  throw new EvolutionApiError(
    `Nao foi possivel obter QR Code da Evolution API para a instancia '${params.instance}'. ${lastError || ''}`.trim(),
    502,
    'REQUEST_FAILED',
  );
}

export async function ensureEvolutionInstanceAndFetchQr(params: EvolutionQrParams): Promise<string> {
  const instance = encodeURIComponent(params.instance);
  const token = randomUUID().toUpperCase();

  const createActions: Array<{ method: 'POST'; path: string; body: unknown }> = [
    {
      method: 'POST',
      path: '/instance/create',
      body: {
        instanceName: params.instance,
        integration: 'WHATSAPP-BAILEYS',
        token,
        qrcode: true,
      },
    },
    {
      method: 'POST',
      path: '/instance/create',
      body: {
        instanceName: params.instance,
        integration: 'BAILEYS',
        token,
        qrcode: true,
      },
    },
    { method: 'POST', path: '/instance/create', body: { instanceName: params.instance, qrcode: true } },
    { method: 'POST', path: '/instance/create', body: { instanceName: params.instance, qrcode: false } },
    { method: 'POST', path: '/instance/create', body: { name: params.instance, qrcode: true } },
    { method: 'POST', path: '/instance/create', body: { instance: params.instance, qrcode: true } },
  ];

  for (const action of createActions) {
    const result = await tryEvolutionAction({
      apiUrl: params.apiUrl,
      apiKey: params.apiKey,
      method: action.method,
      path: action.path,
      body: action.body,
    });
    const qrCandidate = extractQrCandidate(result.payload);
    if (qrCandidate) return qrCandidate;
  }

  const connectActions: Array<{ method: 'POST' | 'GET'; path: string; body?: unknown }> = [
    { method: 'POST', path: `/instance/connect/${instance}`, body: {} },
    { method: 'GET', path: `/instance/connect/${instance}` },
    { method: 'GET', path: `/instance/qr/${instance}` },
  ];

  for (const action of connectActions) {
    const result = await tryEvolutionAction({
      apiUrl: params.apiUrl,
      apiKey: params.apiKey,
      method: action.method,
      path: action.path,
      body: action.body,
    });
    const qrCandidate = extractQrCandidate(result.payload);
    if (qrCandidate) return qrCandidate;
  }

  return fetchEvolutionQrCode(params);
}

export async function resetEvolutionInstanceAndFetchQr(params: EvolutionQrParams): Promise<string> {
  const instance = encodeURIComponent(params.instance);
  const resetActions: Array<{ method: 'GET' | 'POST' | 'DELETE'; path: string; body?: unknown }> = [
    { method: 'POST', path: `/instance/logout/${instance}`, body: {} },
    { method: 'DELETE', path: `/instance/delete/${instance}` },
    { method: 'POST', path: `/instance/delete/${instance}`, body: {} },
    { method: 'POST', path: `/instance/restart/${instance}`, body: {} },
  ];

  for (const action of resetActions) {
    await tryEvolutionAction({
      apiUrl: params.apiUrl,
      apiKey: params.apiKey,
      method: action.method,
      path: action.path,
      body: action.body,
    });
  }

  const createActions: Array<{ method: 'POST'; path: string; body: unknown }> = [
    { method: 'POST', path: '/instance/create', body: { instanceName: params.instance, qrcode: true } },
    { method: 'POST', path: `/instance/connect/${instance}`, body: {} },
  ];

  for (const action of createActions) {
    const result = await tryEvolutionAction({
      apiUrl: params.apiUrl,
      apiKey: params.apiKey,
      method: action.method,
      path: action.path,
      body: action.body,
    });
    const qrCandidate = extractQrCandidate(result.payload);
    if (qrCandidate) return qrCandidate;
  }

  return fetchEvolutionQrCode(params);
}
