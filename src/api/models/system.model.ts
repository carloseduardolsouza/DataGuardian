import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../middlewares/error-handler';
import { getDefaultTempDirectory } from '../../utils/runtime';
import {
  ensureEvolutionInstanceAndFetchQr,
  EvolutionApiError,
  fetchEvolutionQrCode,
  resetEvolutionInstanceAndFetchQr,
} from '../../integrations/evolution-api/client';
import nodemailer from 'nodemailer';

export function getDefaultSettings(): Record<string, { value: unknown; description: string }> {
  return {
    'notifications.email_enabled': {
      value: false,
      description: 'Habilitar envio de alertas por e-mail',
    },
    'notifications.email_smtp_config': {
      value: {
        host: '',
        port: 587,
        user: '',
        password: '',
        from: '',
        to: [],
      },
      description: 'Configuracao do servidor SMTP para envio de e-mails',
    },
    'notifications.webhook_url': {
      value: null,
      description: 'URL de webhook para notificacoes (Slack, Discord, etc.)',
    },
    'notifications.webhook_headers': {
      value: {},
      description: 'Headers adicionais para envio de webhook de notificacoes',
    },
    'notifications.webhook_timeout_ms': {
      value: 10000,
      description: 'Timeout em milissegundos para chamadas de webhook',
    },
    'notifications.whatsapp_enabled': {
      value: false,
      description: 'Habilitar envio de notificacoes importantes via WhatsApp',
    },
    'notifications.whatsapp_evolution_config': {
      value: {
        api_url: 'http://localhost:8080',
        api_key: '',
        instance: '',
        to: [],
        important_only: true,
      },
      description: 'Configuracao da Evolution API para notificacoes WhatsApp',
    },
    'system.max_concurrent_backups': {
      value: 3,
      description: 'Numero maximo de backups executando em paralelo',
    },
    'system.temp_directory': {
      value: getDefaultTempDirectory(),
      description: 'Diretorio temporario para staging durante o backup',
    },
    'system.health_check_interval_ms': {
      value: 300000,
      description: 'Intervalo em milissegundos entre health checks (padrao: 5 min)',
    },
    'system.scheduler_interval_ms': {
      value: 60000,
      description: 'Intervalo em milissegundos do scheduler (padrao: 1 min)',
    },
  };
}

export async function seedDefaultSettings(): Promise<void> {
  const upserts = Object.entries(getDefaultSettings()).map(([key, { value, description }]) =>
    prisma.systemSetting.upsert({
      where: { key },
      update: {},
      create: { key, value: value as Prisma.InputJsonValue, description },
    }),
  );
  await Promise.all(upserts);
}

type SettingsMap = Record<string, { value: unknown; description: string | null; updated_at: string }>;

export interface SystemSettingItem {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
}

function maskSensitiveSettings(settings: SettingsMap): SettingsMap {
  const result = { ...settings };

  const smtpKey = 'notifications.email_smtp_config';
  if (result[smtpKey]) {
    const value = { ...(result[smtpKey].value as Record<string, unknown>) };
    if (value.password) value.password = '**********';
    result[smtpKey] = { ...result[smtpKey], value };
  }

  const waKey = 'notifications.whatsapp_evolution_config';
  if (result[waKey]) {
    const value = { ...(result[waKey].value as Record<string, unknown>) };
    if (value.api_key) value.api_key = '**********';
    result[waKey] = { ...result[waKey], value };
  }

  return result;
}

function maskSensitiveSettingItem(item: SystemSettingItem): SystemSettingItem {
  if (item.key === 'notifications.email_smtp_config') {
    const value = { ...(item.value as Record<string, unknown>) };
    if (value.password) value.password = '**********';
    return { ...item, value };
  }

  if (item.key === 'notifications.whatsapp_evolution_config') {
    const value = { ...(item.value as Record<string, unknown>) };
    if (value.api_key) value.api_key = '**********';
    return { ...item, value };
  }

  return item;
}

async function normalizeSmtpConfigValueForPersist(value: unknown): Promise<Prisma.InputJsonValue> {
  const key = 'notifications.email_smtp_config';
  const incoming = (value ?? {}) as Record<string, unknown>;
  const current = await prisma.systemSetting.findUnique({ where: { key } });
  const currentValue = (current?.value ?? {}) as Record<string, unknown>;

  const merged = { ...incoming };
  const incomingPassword = merged.password;
  if (incomingPassword === '**********' || incomingPassword === '' || incomingPassword === undefined) {
    if (currentValue.password) merged.password = currentValue.password;
    else delete merged.password;
  }

  return merged as Prisma.InputJsonValue;
}

async function normalizeWhatsappConfigValueForPersist(value: unknown): Promise<Prisma.InputJsonValue> {
  const key = 'notifications.whatsapp_evolution_config';
  const incoming = (value ?? {}) as Record<string, unknown>;
  const current = await prisma.systemSetting.findUnique({ where: { key } });
  const currentValue = (current?.value ?? {}) as Record<string, unknown>;

  const merged = { ...incoming };
  const incomingApiKey = merged.api_key;
  if (incomingApiKey === '**********' || incomingApiKey === '' || incomingApiKey === undefined) {
    if (currentValue.api_key) merged.api_key = currentValue.api_key;
    else delete merged.api_key;
  }

  return merged as Prisma.InputJsonValue;
}

async function normalizeSettingValueForPersist(key: string, value: unknown): Promise<Prisma.InputJsonValue> {
  if (key === 'notifications.email_smtp_config') {
    return normalizeSmtpConfigValueForPersist(value);
  }
  if (key === 'notifications.whatsapp_evolution_config') {
    return normalizeWhatsappConfigValueForPersist(value);
  }
  return value as Prisma.InputJsonValue;
}

export async function getSystemSettings(): Promise<SettingsMap> {
  const settings = await prisma.systemSetting.findMany({ orderBy: { key: 'asc' } });
  const result: SettingsMap = {};

  for (const setting of settings) {
    result[setting.key] = {
      value: setting.value,
      description: setting.description,
      updated_at: setting.updatedAt.toISOString(),
    };
  }

  return maskSensitiveSettings(result);
}

export async function getSystemSettingByKey(key: string): Promise<SystemSettingItem> {
  const setting = await prisma.systemSetting.findUnique({ where: { key } });
  if (!setting) {
    throw new AppError('NOT_FOUND', 404, `Configuracao '${key}' nao encontrada.`);
  }

  return maskSensitiveSettingItem({
    key: setting.key,
    value: setting.value,
    description: setting.description,
    updated_at: setting.updatedAt.toISOString(),
  });
}

export async function createSystemSetting(data: {
  key: string;
  value: unknown;
  description?: string | null;
}): Promise<SystemSettingItem> {
  const existing = await prisma.systemSetting.findUnique({ where: { key: data.key } });
  if (existing) {
    throw new AppError('CONFLICT', 409, `Configuracao '${data.key}' ja existe.`);
  }

  const created = await prisma.systemSetting.create({
    data: {
      key: data.key,
      value: await normalizeSettingValueForPersist(data.key, data.value),
      description: data.description ?? null,
    },
  });

  return maskSensitiveSettingItem({
    key: created.key,
    value: created.value,
    description: created.description,
    updated_at: created.updatedAt.toISOString(),
  });
}

export async function updateSystemSettings(updates: Record<string, unknown>): Promise<SettingsMap> {
  const defaults = getDefaultSettings();

  const upserts = await Promise.all(
    Object.entries(updates).map(async ([key, value]) =>
      prisma.systemSetting.upsert({
        where: { key },
        create: {
          key,
          value: await normalizeSettingValueForPersist(key, value),
          description: defaults[key]?.description ?? null,
        },
        update: {
          value: await normalizeSettingValueForPersist(key, value),
        },
      }),
    ),
  );

  const result: SettingsMap = {};
  for (const setting of upserts) {
    result[setting.key] = {
      value: setting.value,
      description: setting.description,
      updated_at: setting.updatedAt.toISOString(),
    };
  }

  return maskSensitiveSettings(result);
}

export async function updateSystemSettingByKey(
  key: string,
  patch: { value?: unknown; description?: string | null },
): Promise<SystemSettingItem> {
  const current = await prisma.systemSetting.findUnique({ where: { key } });
  if (!current) {
    throw new AppError('NOT_FOUND', 404, `Configuracao '${key}' nao encontrada.`);
  }

  const updated = await prisma.systemSetting.update({
    where: { key },
    data: {
      ...(patch.value !== undefined && {
        value: await normalizeSettingValueForPersist(key, patch.value),
      }),
      ...(patch.description !== undefined && { description: patch.description }),
    },
  });

  return maskSensitiveSettingItem({
    key: updated.key,
    value: updated.value,
    description: updated.description,
    updated_at: updated.updatedAt.toISOString(),
  });
}

export async function deleteSystemSettingByKey(key: string): Promise<void> {
  const existing = await prisma.systemSetting.findUnique({ where: { key } });
  if (!existing) {
    throw new AppError('NOT_FOUND', 404, `Configuracao '${key}' nao encontrada.`);
  }

  await prisma.systemSetting.delete({ where: { key } });
}

export async function testSmtpConnection() {
  const [emailEnabled, smtpSetting] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { key: 'notifications.email_enabled' } }),
    prisma.systemSetting.findUnique({ where: { key: 'notifications.email_smtp_config' } }),
  ]);

  if (!Boolean(emailEnabled?.value)) {
    return {
      status: 400,
      body: {
        error: 'EMAIL_NOT_CONFIGURED',
        message: 'E-mail nao esta habilitado. Configure notifications.email_enabled = true e o SMTP antes de testar.',
      },
    };
  }

  const smtp = asObject(smtpSetting?.value);
  const host = asString(smtp.host);
  const user = asString(smtp.user);
  const password = asString(smtp.password);
  const port = Number(smtp.port) > 0 ? Number(smtp.port) : 587;

  if (!host || !user || !password) {
    return {
      status: 422,
      body: {
        error: 'SMTP_CONFIG_INVALID',
        message: 'Configuracao SMTP incompleta: informe host, user e password.',
      },
    };
  }

  try {
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass: password },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    await transport.verify();
  } catch (err) {
    return {
      status: 502,
      body: {
        error: 'SMTP_CONNECTION_FAILED',
        message: err instanceof Error ? err.message : 'Falha ao conectar no SMTP',
      },
    };
  }

  return {
    status: 200,
    body: {
      status: 'ok',
      message: 'Conexao SMTP validada com sucesso.',
    },
  };
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function getWhatsappEvolutionQrCode(instanceOverride?: string) {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: 'notifications.whatsapp_evolution_config' },
    select: { value: true },
  });

  const cfg = asObject(setting?.value);
  const apiUrl = asString(cfg.api_url);
  const apiKey = asString(cfg.api_key);
  const instance = asString(instanceOverride) || asString(cfg.instance);

  if (!apiUrl || !apiKey || !instance) {
    throw new AppError(
      'WHATSAPP_NOT_CONFIGURED',
      422,
      'Configure Evolution API (URL, API key e instancia) antes de gerar QR Code.',
    );
  }

  let qr_code: string;
  try {
    qr_code = await fetchEvolutionQrCode({
      apiUrl,
      apiKey,
      instance,
    });
  } catch (err) {
    if (err instanceof EvolutionApiError) {
      if (err.errorCode === 'INSTANCE_NOT_FOUND') {
        try {
          qr_code = await ensureEvolutionInstanceAndFetchQr({
            apiUrl,
            apiKey,
            instance,
          });
        } catch (createErr) {
          if (createErr instanceof EvolutionApiError) {
            throw new AppError(
              createErr.errorCode,
              createErr.statusCode,
              createErr.message,
              createErr.details,
            );
          }
          throw createErr;
        }
      } else if (err.errorCode === 'INSTANCE_ALREADY_EXISTS' || err.errorCode === 'QR_NOT_AVAILABLE') {
        try {
          qr_code = await resetEvolutionInstanceAndFetchQr({
            apiUrl,
            apiKey,
            instance,
          });
        } catch (resetErr) {
          if (resetErr instanceof EvolutionApiError) {
            throw new AppError(
              resetErr.errorCode,
              resetErr.statusCode,
              resetErr.message,
              resetErr.details,
            );
          }
          throw resetErr;
        }
      } else {
        throw new AppError(
          err.errorCode,
          err.statusCode,
          err.message,
          err.details,
        );
      }
    } else {
      throw err;
    }
  }

  return {
    instance,
    qr_code,
  };
}
