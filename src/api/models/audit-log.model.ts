import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export interface AuditActorContext {
  actor_user_id?: string | null;
  actor_username?: string | null;
  ip?: string | null;
  user_agent?: string | null;
}

export interface CreateAuditLogInput extends AuditActorContext {
  action: string;
  resource_type?: string | null;
  resource_id?: string | null;
  changes?: unknown;
  metadata?: unknown;
}

function cleanString(value: string | null | undefined, maxLength: number) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

export function extractAuditContextFromRequest(req: { ip?: string | null; get?: (name: string) => string | undefined }, authUser?: {
  id?: string;
  username?: string;
}) {
  return {
    actor_user_id: cleanString(authUser?.id ?? null, 80),
    actor_username: cleanString(authUser?.username ?? null, 64),
    ip: cleanString(req.ip ?? null, 80),
    user_agent: cleanString(req.get?.('user-agent') ?? null, 255),
  } satisfies AuditActorContext;
}

export async function createAuditLog(input: CreateAuditLogInput) {
  await prisma.auditLog.create({
    data: {
      actorUserId: input.actor_user_id ?? null,
      actorUsername: cleanString(input.actor_username ?? null, 64),
      action: cleanString(input.action, 160) ?? 'unknown.action',
      resourceType: cleanString(input.resource_type ?? null, 80),
      resourceId: input.resource_id ?? null,
      ip: cleanString(input.ip ?? null, 80),
      userAgent: cleanString(input.user_agent ?? null, 255),
      ...(input.changes !== undefined && { changes: input.changes as Prisma.InputJsonValue }),
      ...(input.metadata !== undefined && { metadata: input.metadata as Prisma.InputJsonValue }),
    },
  });
}

function toIso(value: Date | null) {
  return value ? value.toISOString() : null;
}

function mapAuditLog(log: {
  id: string;
  actorUserId: string | null;
  actorUsername: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  ip: string | null;
  userAgent: string | null;
  changes: Prisma.JsonValue | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  actorUser: {
    id: string;
    username: string;
    fullName: string | null;
  } | null;
}) {
  return {
    id: log.id,
    actor_user_id: log.actorUserId,
    actor_username: log.actorUser?.username ?? log.actorUsername,
    actor_full_name: log.actorUser?.fullName ?? null,
    action: log.action,
    resource_type: log.resourceType,
    resource_id: log.resourceId,
    ip: log.ip,
    user_agent: log.userAgent,
    changes: log.changes,
    metadata: log.metadata,
    created_at: toIso(log.createdAt),
  };
}

export async function listAuditLogs(filters: {
  page: number;
  limit: number;
  action?: string;
  actor?: string;
  resource_type?: string;
  from?: string;
  to?: string;
}) {
  const where: Prisma.AuditLogWhereInput = {
    ...(filters.action && { action: { contains: filters.action, mode: 'insensitive' } }),
    ...(filters.resource_type && { resourceType: filters.resource_type }),
    ...(filters.actor && {
      OR: [
        { actorUsername: { contains: filters.actor, mode: 'insensitive' } },
        {
          actorUser: {
            is: {
              username: { contains: filters.actor, mode: 'insensitive' },
            },
          },
        },
      ],
    }),
  };

  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from && { gte: new Date(filters.from) }),
      ...(filters.to && { lte: new Date(filters.to) }),
    };
  }

  const skip = (filters.page - 1) * filters.limit;

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        actorUser: {
          select: {
            id: true,
            username: true,
            fullName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: filters.limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    data: rows.map(mapAuditLog),
    pagination: {
      total,
      page: filters.page,
      limit: filters.limit,
      totalPages: Math.ceil(total / filters.limit),
    },
  };
}

export async function deleteAuditLogsByPeriod(filters: {
  from?: string;
  to?: string;
}) {
  const where: Prisma.AuditLogWhereInput = {};

  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from && { gte: new Date(filters.from) }),
      ...(filters.to && { lte: new Date(filters.to) }),
    };
  }

  const result = await prisma.auditLog.deleteMany({ where });
  return {
    deleted_count: result.count,
  };
}
