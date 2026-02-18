import { Prisma, NotificationType, NotificationSeverity } from '@prisma/client';
import { prisma } from '../../lib/prisma';

// ──────────────────────────────────────────
// Formatter
// ──────────────────────────────────────────

export function formatNotification(n: {
  id: string;
  type: NotificationType;
  severity: NotificationSeverity;
  entityType: string;
  entityId: string;
  title: string;
  message: string;
  metadata: unknown;
  readAt: Date | null;
  createdAt: Date;
}) {
  return {
    id:          n.id,
    type:        n.type,
    severity:    n.severity,
    entity_type: n.entityType,
    entity_id:   n.entityId,
    title:       n.title,
    message:     n.message,
    metadata:    n.metadata,
    read_at:     n.readAt?.toISOString() ?? null,
    created_at:  n.createdAt.toISOString(),
  };
}

// ──────────────────────────────────────────
// Query types
// ──────────────────────────────────────────

export interface ListNotificationsFilters {
  read?:     string;
  severity?: string;
  type?:     string;
}

// ──────────────────────────────────────────
// Model functions
// ──────────────────────────────────────────

export async function listNotifications(
  filters: ListNotificationsFilters,
  skip: number,
  limit: number,
) {
  const where: Prisma.NotificationWhereInput = {};
  if (filters.severity) where.severity = filters.severity as NotificationSeverity;
  if (filters.type)     where.type     = filters.type as NotificationType;
  if (filters.read === 'true')  where.readAt = { not: null };
  if (filters.read === 'false') where.readAt = null;

  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { readAt: null } }),
  ]);

  return { items: items.map(formatNotification), total, unreadCount };
}

export async function markNotificationAsRead(id: string) {
  const notification = await prisma.notification.findUniqueOrThrow({ where: { id } });

  if (notification.readAt) {
    return { id: notification.id, read_at: notification.readAt.toISOString() };
  }

  const updated = await prisma.notification.update({
    where: { id },
    data:  { readAt: new Date() },
  });

  return { id: updated.id, read_at: updated.readAt!.toISOString() };
}

export async function markAllNotificationsAsRead() {
  const result = await prisma.notification.updateMany({
    where: { readAt: null },
    data:  { readAt: new Date() },
  });

  return { updated_count: result.count };
}

export async function deleteNotification(id: string) {
  await prisma.notification.findUniqueOrThrow({ where: { id } });
  await prisma.notification.delete({ where: { id } });
}
