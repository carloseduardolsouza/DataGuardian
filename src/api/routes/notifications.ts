import { Router, Request, Response, NextFunction } from 'express';
import { Prisma, NotificationType, NotificationSeverity } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { validate } from '../middlewares/validation';
import { getPaginationParams, buildPaginatedResponse } from '../../utils/config';

export const notificationsRouter = Router();

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────

function formatNotification(n: {
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
// Query schema
// ──────────────────────────────────────────

const listQuerySchema = z.object({
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(100).default(20),
  read:     z.enum(['true', 'false']).optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  type: z
    .enum([
      'backup_success', 'backup_failed', 'connection_lost', 'connection_restored',
      'storage_full', 'storage_unreachable', 'health_degraded', 'cleanup_completed',
    ])
    .optional(),
});

// ──────────────────────────────────────────
// GET /api/notifications
// ──────────────────────────────────────────

notificationsRouter.get(
  '/',
  validate(listQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit, read, severity, type } = req.query as z.infer<typeof listQuerySchema>;
      const { skip } = getPaginationParams({ page, limit });

      const where: Prisma.NotificationWhereInput = {};
      if (severity) where.severity = severity as NotificationSeverity;
      if (type)     where.type     = type as NotificationType;
      if (read === 'true')  where.readAt = { not: null };
      if (read === 'false') where.readAt = null;

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

      res.json({
        ...buildPaginatedResponse(items.map(formatNotification), total, page, limit),
        unread_count: unreadCount,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ──────────────────────────────────────────
// PUT /api/notifications/read-all
// Deve ser registrada ANTES de /:id/read para não capturar "read-all"
// ──────────────────────────────────────────

notificationsRouter.put(
  '/read-all',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await prisma.notification.updateMany({
        where: { readAt: null },
        data:  { readAt: new Date() },
      });

      res.json({ updated_count: result.count });
    } catch (err) {
      next(err);
    }
  },
);

// ──────────────────────────────────────────
// PUT /api/notifications/:id/read
// ──────────────────────────────────────────

notificationsRouter.put(
  '/:id/read',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const notification = await prisma.notification.findUniqueOrThrow({
        where: { id: req.params.id },
      });

      // Idempotente: se já foi lida, retorna o estado atual
      if (notification.readAt) {
        return res.json({
          id:      notification.id,
          read_at: notification.readAt.toISOString(),
        });
      }

      const updated = await prisma.notification.update({
        where: { id: req.params.id },
        data:  { readAt: new Date() },
      });

      res.json({ id: updated.id, read_at: updated.readAt!.toISOString() });
    } catch (err) {
      next(err);
    }
  },
);

// ──────────────────────────────────────────
// DELETE /api/notifications/:id
// ──────────────────────────────────────────

notificationsRouter.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await prisma.notification.findUniqueOrThrow({ where: { id: req.params.id } });
      await prisma.notification.delete({ where: { id: req.params.id } });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);
