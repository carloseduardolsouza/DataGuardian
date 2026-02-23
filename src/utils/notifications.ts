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

const SEVERITY_EMOJI: Record<NotificationSeverity, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  critical: '🚨',
};

const TYPE_EMOJI: Record<NotificationType, string> = {
  backup_success: '✅',
  backup_failed: '❌',
  connection_lost: '🔌',
  connection_restored: '🟢',
  storage_full: '🧱',
  storage_unreachable: '📦',
  health_degraded: '🩺',
  cleanup_completed: '🧹',
};

const ERROR_NOTIFICATION_TYPES = new Set<NotificationType>([
  'backup_failed',
  'connection_lost',
  'storage_unreachable',
  'health_degraded',
]);

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

function isErrorNotification(input: CreateNotificationInput) {
  if (input.severity === 'critical') return true;
  if (ERROR_NOTIFICATION_TYPES.has(input.type)) return true;

  const text = `${input.title} ${input.message}`.toLowerCase();
  return /(erro|error|falha|failed|failure)/.test(text);
}

function humanizeType(type: NotificationType) {
  return type
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildWhatsappText(
  input: CreateNotificationInput,
  rendered: { title: string; message: string },
) {
  const severityEmoji = SEVERITY_EMOJI[input.severity] ?? '🔔';
  const typeEmoji = TYPE_EMOJI[input.type] ?? '📣';
  const title = rendered.title.trim() || input.title;
  const message = rendered.message.trim() || input.message;
  const typeLabel = humanizeType(input.type);
  const when = new Date().toLocaleString('pt-BR', { hour12: false });

  return [
    `${severityEmoji} *DataGuardian | Alerta* ${typeEmoji}`,
    '',
    `*${title}*`,
    message,
    '',
    `• Tipo: ${typeLabel}`,
    `• Severidade: ${input.severity.toUpperCase()}`,
    `• Entidade: ${input.entityType} (${input.entityId})`,
    `• Horário: ${when}`,
  ].join('\n');
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
  if (!cfg.whatsappEnabled) {
    logger.info(
      { type: input.type, entityId: input.entityId },
      '[WHATSAPP] Envio ignorado: notifications.whatsapp_enabled=false',
    );
    return;
  }

  const apiUrl = asString(cfg.whatsapp.api_url);
  const apiKey = asString(cfg.whatsapp.api_key);
  const instance = asString(cfg.whatsapp.instance);
  const recipients = asStringArray(cfg.whatsapp.to);
  const importantOnly = asBoolean(cfg.whatsapp.important_only, true);

  if (!apiUrl || !apiKey || !instance || recipients.length === 0) {
    logger.warn(
      {
        type: input.type,
        entityId: input.entityId,
        has_api_url: Boolean(apiUrl),
        has_api_key: Boolean(apiKey),
        has_instance: Boolean(instance),
        recipients_count: recipients.length,
      },
      '[WHATSAPP] Envio ignorado: configuracao incompleta',
    );
    return;
  }
  if (importantOnly && !isImportantNotification(input) && !isErrorNotification(input)) {
    logger.info(
      {
        type: input.type,
        severity: input.severity,
        entityId: input.entityId,
      },
      '[WHATSAPP] Envio ignorado: filtro important_only',
    );
    return;
  }

  const rendered = await resolveRenderedTemplate('whatsapp', input);
  logger.info(
    {
      type: input.type,
      severity: input.severity,
      entityId: input.entityId,
      instance,
      recipients_count: recipients.length,
    },
    '[WHATSAPP] Iniciando envio de notificacao',
  );

  await Promise.all(
    recipients.map(async (to) => {
      const startedAt = Date.now();
      try {
        const text = buildWhatsappText(input, rendered);
        await sendEvolutionText({
          apiUrl,
          apiKey,
          instance,
          to,
          text,
        });
        logger.info(
          {
            type: input.type,
            entityId: input.entityId,
            to,
            duration_ms: Date.now() - startedAt,
          },
          '[WHATSAPP] Mensagem enviada com sucesso',
        );
      } catch (error) {
        logger.error(
          {
            err: error,
            error_message: error instanceof Error ? error.message : String(error),
            type: input.type,
            entityId: input.entityId,
            to,
            duration_ms: Date.now() - startedAt,
          },
          '[WHATSAPP] Falha ao enviar mensagem',
        );
        throw error;
      }
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
        logger.error(
          {
            err: error,
            error_message: error instanceof Error ? error.message : String(error),
            channel,
            type: input.type,
          },
          'Falha no dispatch externo de notificacao',
        );
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
    logger.error(
      {
        err: error,
        error_message: error instanceof Error ? error.message : String(error),
        input,
      },
      'Erro ao criar notificacao',
    );
  }
}
