import {
  NotificationEntityType,
  NotificationSeverity,
  NotificationType,
  Prisma,
} from '@prisma/client';
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
  const [whatsappEnabledRaw, whatsappRaw] = await Promise.all([
    readSystemSetting('notifications.whatsapp_enabled'),
    readSystemSetting('notifications.whatsapp_evolution_config'),
  ]);

  return {
    whatsappEnabled: Boolean(whatsappEnabledRaw),
    whatsapp: asObject(whatsappRaw) as WhatsappEvolutionConfig,
  };
}

function isImportantNotification(input: CreateNotificationInput) {
  return input.severity === 'critical' || input.severity === 'warning';
}

async function resolveRenderedTemplate(
  channel: 'whatsapp',
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
  const channels: Array<{ channel: 'whatsapp'; run: () => Promise<void> }> = [
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
