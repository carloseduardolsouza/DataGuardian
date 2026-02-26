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

function humanizeType(type: NotificationType) {
  return type
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeInline(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function truncateText(value: string, max = 180) {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 3)).trim()}...`;
}

function firstNonEmptyLine(value: string) {
  const lines = value
    .split(/\r?\n/)
    .map((line) => normalizeInline(line))
    .filter(Boolean);
  return lines[0] ?? '';
}

function severityLabel(severity: NotificationSeverity) {
  if (severity === 'critical') return 'CRITICO';
  if (severity === 'warning') return 'ATENCAO';
  return 'INFO';
}

function severityEmoji(severity: NotificationSeverity) {
  if (severity === 'critical') return '🚨';
  if (severity === 'warning') return '⚠️';
  return 'ℹ️';
}

function typeEmoji(type: NotificationType) {
  if (type === 'backup_success') return '✅';
  if (type === 'backup_failed') return '❌';
  if (type === 'connection_lost') return '🔌';
  if (type === 'connection_restored') return '🔄';
  if (type === 'storage_full') return '💽';
  if (type === 'storage_unreachable') return '📡';
  if (type === 'health_degraded') return '🩺';
  if (type === 'cleanup_completed') return '🧹';
  if (type === 'approval_requested') return '📝';
  if (type === 'approval_decided') return '✅';
  return '📣';
}

function entityLabel(entityType: NotificationEntityType) {
  if (entityType === 'backup_job') return 'Job de backup';
  if (entityType === 'storage_location') return 'Storage';
  if (entityType === 'datasource') return 'Datasource';
  return 'Sistema';
}

function buildWhatsappText(
  input: CreateNotificationInput,
  rendered: { title: string; message: string },
) {
  const when = new Date().toLocaleString('pt-BR', { hour12: false });
  const metadata = asObject(input.metadata);
  const title = truncateText(normalizeInline(rendered.title || input.title), 90);

  const renderedMessage = normalizeInline(firstNonEmptyLine(rendered.message));
  const fallbackMessage = normalizeInline(firstNonEmptyLine(input.message));
  const summary = truncateText(renderedMessage || fallbackMessage || 'Sem detalhes.', 140);
  const sevLabel = severityLabel(input.severity);
  const sevEmoji = severityEmoji(input.severity);
  const evtEmoji = typeEmoji(input.type);

  if (input.type === 'approval_requested') {
    const action = asString(metadata.action_label) || asString(metadata.action) || 'Acao critica';
    const requester = asString(metadata.requester_username) || 'Usuario nao identificado';
    const reason = asString(metadata.request_reason);
    const resourceType = asString(metadata.resource_type);
    const resourceId = asString(metadata.resource_id);
    const resource = resourceType || resourceId ? `${resourceType || '-'} / ${resourceId || '-'}` : null;

    return [
      '📝 Aprovacao solicitada',
      `👤 Solicitante: ${requester}`,
      `⚙️ Acao: ${truncateText(action, 90)}`,
      ...(resource ? [`🧩 Recurso: ${truncateText(resource, 90)}`] : []),
      ...(reason ? [`💬 Motivo: ${truncateText(normalizeInline(reason), 100)}`] : []),
      `🕒 ${when}`,
    ].join('\n');
  }

  if (input.type === 'approval_decided') {
    const action = asString(metadata.action_label) || asString(metadata.action) || 'Acao critica';
    const requester = asString(metadata.requester_username) || 'Usuario nao identificado';
    const decisionReason = asString(metadata.decision_reason);
    const statusRaw = asString(metadata.status).toLowerCase();
    const statusLabel = statusRaw === 'approved'
      ? '✅ Aprovada'
      : statusRaw === 'rejected'
        ? '❌ Reprovada'
        : statusRaw === 'canceled'
          ? '🚫 Cancelada'
          : 'ℹ️ Atualizada';

    return [
      `📋 ${statusLabel}`,
      `👤 Solicitante: ${requester}`,
      `⚙️ Acao: ${truncateText(action, 90)}`,
      ...(decisionReason ? [`💬 Decisao: ${truncateText(normalizeInline(decisionReason), 100)}`] : []),
      `🕒 ${when}`,
    ].join('\n');
  }

  return [
    `${sevEmoji} ${evtEmoji} ${title}`,
    `📌 ${humanizeType(input.type)} | ${sevLabel}`,
    `📝 ${summary}`,
    `🧭 ${entityLabel(input.entityType)}: ${input.entityId}`,
    `🕒 ${when}`,
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
