type EvolutionSendParams = {
  apiUrl: string;
  apiKey: string;
  instance: string;
  to: string;
  text: string;
};

function normalizePhone(value: string) {
  return value.replace(/\D+/g, '');
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

export async function sendEvolutionText(params: EvolutionSendParams): Promise<void> {
  const base = params.apiUrl.replace(/\/+$/, '');
  const number = normalizePhone(params.to);
  if (!number) {
    throw new Error('Numero de destino invalido para WhatsApp');
  }

  const endpoint = `${base}/message/sendText/${encodeURIComponent(params.instance)}`;
  const payload = {
    number,
    text: params.text,
  };

  const response = await postWithTimeout(
    endpoint,
    payload,
    { apikey: params.apiKey },
  );

  if (!response.ok) {
    const raw = await response.text().catch(() => '');
    throw new Error(`Evolution API retornou ${response.status}${raw ? `: ${raw}` : ''}`);
  }
}
