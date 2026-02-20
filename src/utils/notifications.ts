import {
  AlertChannel,
  NotificationEntityType,
  NotificationSeverity,
  NotificationType,
  Prisma,
} from '@prisma/client';
import nodemailer from 'nodemailer';
import { prisma } from '../lib/prisma';
import { logger } from './logger';
import { sendEvolutionText } from '../integrations/evolution-api/client';
import {
  buildTemplateContext,
  getActiveTemplate,
  renderTemplate,
} from '../api/models/notification-template.model';

interface CreateNotificationInput {
  type: NotificationType;
  severity: NotificationSeverity;
  entityType: NotificationEntityType;
  entityId: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

type SmtpConfig = {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  from?: string;
  to?: string[];
  secure?: boolean;
};

type WhatsappEvolutionConfig = {
  api_url?: string;
  api_key?: string;
  instance?: string;
  to?: string[];
  important_only?: boolean;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((v) => asString(v)).filter(Boolean)
    : [];
}

function asBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return fallback;
}

async function readSystemSetting(key: string) {
  const setting = await prisma.systemSetting.findUnique({
    where: { key },
    select: { value: true },
  });
  return setting?.value;
}

async function readDispatchConfig() {
  const [
    emailEnabledRaw,
    smtpRaw,
    webhookUrlRaw,
    webhookHeadersRaw,
    webhookTimeoutRaw,
    whatsappEnabledRaw,
    whatsappRaw,
  ] = await Promise.all([
    readSystemSetting('notifications.email_enabled'),
    readSystemSetting('notifications.email_smtp_config'),
    readSystemSetting('notifications.webhook_url'),
    readSystemSetting('notifications.webhook_headers'),
    readSystemSetting('notifications.webhook_timeout_ms'),
    readSystemSetting('notifications.whatsapp_enabled'),
    readSystemSetting('notifications.whatsapp_evolution_config'),
  ]);

  return {
    emailEnabled: Boolean(emailEnabledRaw),
    smtp: asObject(smtpRaw) as SmtpConfig,
    webhookUrl: asString(webhookUrlRaw),
    webhookHeaders: asObject(webhookHeadersRaw),
    webhookTimeoutMs: Number(webhookTimeoutRaw) > 0 ? Number(webhookTimeoutRaw) : 10_000,
    whatsappEnabled: Boolean(whatsappEnabledRaw),
    whatsapp: asObject(whatsappRaw) as WhatsappEvolutionConfig,
  };
}

function isImportantNotification(input: CreateNotificationInput) {
  return input.severity === 'critical' || input.severity === 'warning';
}

async function resolveRenderedTemplate(
  channel: AlertChannel,
  input: CreateNotificationInput,
) {
  const template = await getActiveTemplate(channel, input.type);
  const context = buildTemplateContext({
    type: input.type,
    severity: input.severity,
    entityType: input.entityType,
    entityId: input.entityId,
    title: input.title,
    message: input.message,
    metadata: (input.metadata ?? {}) as Prisma.JsonValue,
  });

  return {
    title: renderTemplate(template?.titleTpl ?? '{{title}}', context) || input.title,
    message: renderTemplate(template?.messageTpl ?? '{{message}}', context) || input.message,
    template_version: template?.version ?? 0,
  };
}

async function dispatchSmtpNotification(input: CreateNotificationInput) {
  const cfg = await readDispatchConfig();
  if (!cfg.emailEnabled) return;

  const host = asString(cfg.smtp.host);
  const user = asString(cfg.smtp.user);
  const password = asString(cfg.smtp.password);
  const from = asString(cfg.smtp.from);
  const recipients = asStringArray(cfg.smtp.to);
  const port = Number(cfg.smtp.port) > 0 ? Number(cfg.smtp.port) : 587;

  if (!host || !user || !password || !from || recipients.length === 0) {
    logger.warn('SMTP habilitado, mas configuracao incompleta. Notificacao nao enviada.');
    return;
  }

  const rendered = await resolveRenderedTemplate('smtp', input);
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: asBoolean(cfg.smtp.secure, port === 465),
    auth: { user, pass: password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

  await transport.sendMail({
    from,
    to: recipients.join(', '),
    subject: rendered.title,
    text: rendered.message,
    headers: {
      'X-DataGuardian-Notification-Type': input.type,
      'X-DataGuardian-Template-Version': String(rendered.template_version),
    },
  });
}

async function dispatchWebhookNotification(input: CreateNotificationInput) {
  const cfg = await readDispatchConfig();
  if (!cfg.webhookUrl) return;

  const rendered = await resolveRenderedTemplate('webhook', input);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.webhookTimeoutMs);

  try {
    const res = await fetch(cfg.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...Object.fromEntries(
          Object.entries(cfg.webhookHeaders).map(([k, v]) => [k, String(v)]),
        ),
      },
      body: JSON.stringify({
        source: 'DataGuardian',
        channel: 'webhook',
        type: input.type,
        severity: input.severity,
        title: rendered.title,
        message: rendered.message,
        entity_type: input.entityType,
        entity_id: input.entityId,
        metadata: input.metadata ?? {},
        template_version: rendered.template_version,
        created_at: new Date().toISOString(),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const raw = await res.text().catch(() => '');
      throw new Error(`Webhook retornou ${res.status}${raw ? `: ${raw}` : ''}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function dispatchWhatsappNotification(input: CreateNotificationInput) {
  const cfg = await readDispatchConfig();
  if (!cfg.whatsappEnabled) return;

  const apiUrl = asString(cfg.whatsapp.api_url);
  const apiKey = asString(cfg.whatsapp.api_key);
  const instance = asString(cfg.whatsapp.instance);
  const recipients = asStringArray(cfg.whatsapp.to);
  const importantOnly = cfg.whatsapp.important_only !== false;

  if (!apiUrl || !apiKey || !instance || recipients.length === 0) return;
  if (importantOnly && !isImportantNotification(input)) return;

  const rendered = await resolveRenderedTemplate('whatsapp', input);

  await Promise.all(
    recipients.map(async (to) => {
      await sendEvolutionText({
        apiUrl,
        apiKey,
        instance,
        to,
        text: `${rendered.title}\n\n${rendered.message}`,
      });
    }),
  );
}

async function dispatchExternalNotifications(input: CreateNotificationInput) {
  const channels: Array<{ channel: AlertChannel; run: () => Promise<void> }> = [
    { channel: 'smtp', run: () => dispatchSmtpNotification(input) },
    { channel: 'webhook', run: () => dispatchWebhookNotification(input) },
    { channel: 'whatsapp', run: () => dispatchWhatsappNotification(input) },
  ];

  await Promise.all(
    channels.map(async ({ channel, run }) => {
      try {
        await run();
      } catch (error) {
        logger.error({ error, channel, type: input.type }, 'Falha no dispatch externo de notificacao');
      }
    }),
  );
}

/**
 * Persiste uma notificacao no banco e, se configurado,
 * envia via canais externos.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        type: input.type,
        severity: input.severity,
        entityType: input.entityType,
        entityId: input.entityId,
        title: input.title,
        message: input.message,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    await dispatchExternalNotifications(input);

    logger.info(
      { type: input.type, severity: input.severity, entityId: input.entityId },
      `Notificacao criada: ${input.title}`,
    );
  } catch (error) {
    logger.error({ error, input }, 'Erro ao criar notificacao');
  }
}
