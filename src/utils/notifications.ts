import {
  Prisma,
  NotificationType,
  NotificationSeverity,
  NotificationEntityType,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from './logger';
import { sendEvolutionText } from '../integrations/evolution-api/client';

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

async function readSystemSetting(key: string) {
  const setting = await prisma.systemSetting.findUnique({
    where: { key },
    select: { value: true },
  });
  return setting?.value;
}

async function readWhatsappConfig(): Promise<{ enabled: boolean; config: WhatsappEvolutionConfig }> {
  const [enabledRaw, configRaw] = await Promise.all([
    readSystemSetting('notifications.whatsapp_enabled'),
    readSystemSetting('notifications.whatsapp_evolution_config'),
  ]);

  return {
    enabled: Boolean(enabledRaw),
    config: asObject(configRaw) as WhatsappEvolutionConfig,
  };
}

function isImportantNotification(input: CreateNotificationInput) {
  return input.severity === 'critical' || input.severity === 'warning';
}

async function dispatchWhatsappNotification(input: CreateNotificationInput) {
  const { enabled, config } = await readWhatsappConfig();
  if (!enabled) return;

  const apiUrl = asString(config.api_url);
  const apiKey = asString(config.api_key);
  const instance = asString(config.instance);
  const recipients = asStringArray(config.to);
  const importantOnly = config.important_only !== false;

  if (!apiUrl || !apiKey || !instance || recipients.length === 0) return;
  if (importantOnly && !isImportantNotification(input)) return;

  const text = [
    `DataGuardian [${input.severity.toUpperCase()}]`,
    input.title,
    input.message,
  ].join('\n');

  await Promise.all(
    recipients.map(async (to) => {
      try {
        await sendEvolutionText({
          apiUrl,
          apiKey,
          instance,
          to,
          text,
        });
      } catch (error) {
        logger.error({ error, to, type: input.type }, 'Falha ao enviar notificacao WhatsApp via Evolution API');
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

    // TODO: Implementar envio de e-mail via SMTP quando
    // notifications.email_enabled estiver ativo em system_settings.

    // TODO: Implementar envio de webhook quando
    // notifications.webhook_url estiver configurado em system_settings.

    await dispatchWhatsappNotification(input);

    logger.info(
      { type: input.type, severity: input.severity, entityId: input.entityId },
      `Notificacao criada: ${input.title}`,
    );
  } catch (error) {
    logger.error({ error, input }, 'Erro ao criar notificacao');
  }
}
