import { NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../middlewares/error-handler';

type AlertChannel = 'smtp' | 'webhook' | 'whatsapp';
const prismaAny = prisma as any;

const ALL_NOTIFICATION_TYPES: NotificationType[] = [
  'backup_success',
  'backup_failed',
  'connection_lost',
  'connection_restored',
  'storage_full',
  'storage_unreachable',
  'health_degraded',
  'cleanup_completed',
];

const ALL_ALERT_CHANNELS: AlertChannel[] = ['smtp', 'webhook', 'whatsapp'];

function getDefaultTemplate(channel: AlertChannel, _type: NotificationType) {
  const header = `DataGuardian {{severity_upper}}`;
  const title = '{{title}}';
  const message = '{{message}}';
  const details = 'Tipo: {{type}}\nEntidade: {{entity_type}}/{{entity_id}}\nHorario: {{created_at}}';

  if (channel === 'webhook') {
    return {
      title_tpl: null,
      message_tpl: JSON.stringify(
        {
          version: 1,
          source: 'DataGuardian',
          type: '{{type}}',
          severity: '{{severity}}',
          title: '{{title}}',
          message: '{{message}}',
          entity_type: '{{entity_type}}',
          entity_id: '{{entity_id}}',
          created_at: '{{created_at}}',
          metadata: '{{metadata_json}}',
        },
        null,
        2,
      ),
    };
  }

  return {
    title_tpl: `${header} - ${title}`,
    message_tpl: `${message}\n\n${details}`,
  };
}

function mapTemplate(item: {
  id: string;
  channel: AlertChannel;
  type: NotificationType;
  version: number;
  enabled: boolean;
  isDefault: boolean;
  titleTpl: string | null;
  messageTpl: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: item.id,
    channel: item.channel,
    type: item.type,
    version: item.version,
    enabled: item.enabled,
    is_default: item.isDefault,
    title_tpl: item.titleTpl,
    message_tpl: item.messageTpl,
    created_at: item.createdAt.toISOString(),
    updated_at: item.updatedAt.toISOString(),
  };
}

export async function seedDefaultNotificationTemplates() {
  for (const channel of ALL_ALERT_CHANNELS) {
    for (const type of ALL_NOTIFICATION_TYPES) {
      const defaults = getDefaultTemplate(channel, type);
      await prismaAny.notificationTemplate.upsert({
        where: {
          channel_type_version: {
            channel,
            type,
            version: 1,
          },
        },
        create: {
          channel,
          type,
          version: 1,
          enabled: true,
          isDefault: true,
          titleTpl: defaults.title_tpl,
          messageTpl: defaults.message_tpl,
        },
        update: {},
      });
    }
  }
}

export async function listNotificationTemplates(filters?: {
  channel?: AlertChannel;
  type?: NotificationType;
}) {
  const rows = await prismaAny.notificationTemplate.findMany({
    where: {
      ...(filters?.channel && { channel: filters.channel }),
      ...(filters?.type && { type: filters.type }),
    },
    orderBy: [{ channel: 'asc' }, { type: 'asc' }, { version: 'desc' }],
  });
  return rows.map(mapTemplate);
}

export async function createNotificationTemplate(input: {
  channel: AlertChannel;
  type: NotificationType;
  version?: number;
  enabled?: boolean;
  title_tpl?: string | null;
  message_tpl: string;
}) {
  const version = input.version ?? 1;
  const created = await prismaAny.notificationTemplate.create({
    data: {
      channel: input.channel,
      type: input.type,
      version,
      enabled: input.enabled ?? true,
      isDefault: false,
      titleTpl: input.title_tpl ?? null,
      messageTpl: input.message_tpl,
    },
  });
  return mapTemplate(created);
}

export async function updateNotificationTemplateById(
  id: string,
  patch: {
    enabled?: boolean;
    title_tpl?: string | null;
    message_tpl?: string;
  },
) {
  const existing = await prismaAny.notificationTemplate.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('NOT_FOUND', 404, 'Template nao encontrado');
  }

  const updated = await prismaAny.notificationTemplate.update({
    where: { id },
    data: {
      ...(patch.enabled !== undefined && { enabled: patch.enabled }),
      ...(patch.title_tpl !== undefined && { titleTpl: patch.title_tpl }),
      ...(patch.message_tpl !== undefined && { messageTpl: patch.message_tpl }),
    },
  });

  return mapTemplate(updated);
}

export async function createNotificationTemplateVersion(id: string, input?: {
  title_tpl?: string | null;
  message_tpl?: string;
  enabled?: boolean;
}) {
  const base = await prismaAny.notificationTemplate.findUnique({ where: { id } });
  if (!base) {
    throw new AppError('NOT_FOUND', 404, 'Template base nao encontrado');
  }

  const latest = await prismaAny.notificationTemplate.findFirst({
    where: { channel: base.channel, type: base.type },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const nextVersion = (latest?.version ?? base.version) + 1;

  const created = await prismaAny.notificationTemplate.create({
    data: {
      channel: base.channel,
      type: base.type,
      version: nextVersion,
      enabled: input?.enabled ?? true,
      isDefault: false,
      titleTpl: input?.title_tpl !== undefined ? input.title_tpl : base.titleTpl,
      messageTpl: input?.message_tpl !== undefined ? input.message_tpl : base.messageTpl,
    },
  });

  return mapTemplate(created);
}

export async function getActiveTemplate(channel: AlertChannel, type: NotificationType) {
  return prismaAny.notificationTemplate.findFirst({
    where: { channel, type, enabled: true },
    orderBy: { version: 'desc' },
  });
}

export function renderTemplate(template: string | null, context: Record<string, unknown>) {
  if (!template) return '';
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_full, key: string) => {
    const value = context[key];
    if (value === undefined || value === null) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  });
}

export function buildTemplateContext(input: {
  type: NotificationType;
  severity: string;
  entityType: string;
  entityId: string;
  title: string;
  message: string;
  metadata?: Prisma.JsonValue;
}) {
  return {
    type: input.type,
    severity: input.severity,
    severity_upper: input.severity.toUpperCase(),
    entity_type: input.entityType,
    entity_id: input.entityId,
    title: input.title,
    message: input.message,
    metadata: input.metadata ?? {},
    metadata_json: JSON.stringify(input.metadata ?? {}),
    created_at: new Date().toISOString(),
  };
}
