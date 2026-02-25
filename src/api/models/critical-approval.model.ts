import { CriticalApprovalStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../middlewares/error-handler';
import { createNotification } from '../../utils/notifications';

export interface CriticalApprovalContext {
  action: string;
  action_label?: string | null;
  resource_type?: string | null;
  resource_id?: string | null;
}

function toIso(value: Date | null) {
  return value ? value.toISOString() : null;
}

function mapApprovalRequest(item: {
  id: string;
  action: string;
  actionLabel: string | null;
  resourceType: string | null;
  resourceId: string | null;
  requestReason: string | null;
  payload: Prisma.JsonValue | null;
  status: CriticalApprovalStatus;
  requesterUserId: string;
  decidedByUserId: string | null;
  decisionReason: string | null;
  expiresAt: Date | null;
  consumedAt: Date | null;
  createdAt: Date;
  decidedAt: Date | null;
  requesterUser?: { id: string; username: string; fullName: string | null } | null;
  decidedByUser?: { id: string; username: string; fullName: string | null } | null;
}) {
  return {
    id: item.id,
    action: item.action,
    action_label: item.actionLabel,
    resource_type: item.resourceType,
    resource_id: item.resourceId,
    request_reason: item.requestReason,
    payload: item.payload,
    status: item.status,
    requester_user_id: item.requesterUserId,
    requester_user: item.requesterUser
      ? {
          id: item.requesterUser.id,
          username: item.requesterUser.username,
          full_name: item.requesterUser.fullName,
        }
      : null,
    decided_by_user_id: item.decidedByUserId,
    decided_by_user: item.decidedByUser
      ? {
          id: item.decidedByUser.id,
          username: item.decidedByUser.username,
          full_name: item.decidedByUser.fullName,
        }
      : null,
    decision_reason: item.decisionReason,
    expires_at: toIso(item.expiresAt),
    consumed_at: toIso(item.consumedAt),
    created_at: item.createdAt.toISOString(),
    decided_at: toIso(item.decidedAt),
  };
}

function cleanText(value: string | null | undefined, maxLen: number) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

export async function createCriticalApprovalRequest(params: {
  requester_user_id: string;
  action: string;
  action_label?: string | null;
  resource_type?: string | null;
  resource_id?: string | null;
  request_reason?: string | null;
  payload?: Record<string, unknown> | null;
}) {
  const created = await prisma.criticalApprovalRequest.create({
    data: {
      requesterUserId: params.requester_user_id,
      action: params.action,
      actionLabel: cleanText(params.action_label, 180),
      resourceType: cleanText(params.resource_type, 80),
      resourceId: cleanText(params.resource_id, 160),
      requestReason: cleanText(params.request_reason, 500),
      payload: (params.payload ?? {}) as Prisma.InputJsonValue,
      status: 'pending',
    },
    include: {
      requesterUser: {
        select: { id: true, username: true, fullName: true },
      },
    },
  });

  await createNotification({
    type: 'approval_requested',
    severity: 'warning',
    entityType: 'system',
    entityId: created.id,
    title: `Aprovacao pendente: ${created.actionLabel ?? created.action}`,
    message: `Usuario '${created.requesterUser.username}' solicitou aprovacao para uma operacao critica.`,
    metadata: {
      approval_request_id: created.id,
      action: created.action,
      action_label: created.actionLabel,
      resource_type: created.resourceType,
      resource_id: created.resourceId,
      requester_user_id: created.requesterUserId,
      requester_username: created.requesterUser.username,
      request_reason: created.requestReason,
    },
  });

  return mapApprovalRequest(created);
}

export async function listCriticalApprovalRequests(params: {
  skip: number;
  limit: number;
  status?: CriticalApprovalStatus;
  requester_user_id?: string;
  action?: string;
}) {
  const where: Prisma.CriticalApprovalRequestWhereInput = {
    ...(params.status && { status: params.status }),
    ...(params.requester_user_id && { requesterUserId: params.requester_user_id }),
    ...(params.action && { action: params.action }),
  };

  const [items, total] = await Promise.all([
    prisma.criticalApprovalRequest.findMany({
      where,
      skip: params.skip,
      take: params.limit,
      orderBy: { createdAt: 'desc' },
      include: {
        requesterUser: { select: { id: true, username: true, fullName: true } },
        decidedByUser: { select: { id: true, username: true, fullName: true } },
      },
    }),
    prisma.criticalApprovalRequest.count({ where }),
  ]);

  return { items: items.map(mapApprovalRequest), total };
}

export async function listMyCriticalApprovalRequests(params: {
  requester_user_id: string;
  skip: number;
  limit: number;
  status?: CriticalApprovalStatus;
}) {
  return listCriticalApprovalRequests({
    skip: params.skip,
    limit: params.limit,
    status: params.status,
    requester_user_id: params.requester_user_id,
  });
}

export async function approveCriticalApprovalRequest(params: {
  approval_request_id: string;
  decided_by_user_id: string;
  decision_reason?: string | null;
  expires_minutes?: number;
}) {
  const request = await prisma.criticalApprovalRequest.findUnique({
    where: { id: params.approval_request_id },
    include: { requesterUser: { select: { id: true, username: true, fullName: true } } },
  });
  if (!request) {
    throw new AppError('NOT_FOUND', 404, 'Solicitacao de aprovacao nao encontrada');
  }
  if (request.status !== 'pending') {
    throw new AppError('APPROVAL_REQUEST_INVALID_STATE', 409, 'A solicitacao nao esta pendente');
  }

  const expiresMinutes = params.expires_minutes ?? 30;
  const approved = await prisma.criticalApprovalRequest.update({
    where: { id: request.id },
    data: {
      status: 'approved',
      decidedByUserId: params.decided_by_user_id,
      decisionReason: cleanText(params.decision_reason, 500),
      decidedAt: new Date(),
      expiresAt: new Date(Date.now() + expiresMinutes * 60 * 1000),
    },
    include: {
      requesterUser: { select: { id: true, username: true, fullName: true } },
      decidedByUser: { select: { id: true, username: true, fullName: true } },
    },
  });

  await createNotification({
    type: 'approval_decided',
    severity: 'info',
    entityType: 'system',
    entityId: approved.id,
    title: `Solicitacao aprovada: ${approved.actionLabel ?? approved.action}`,
    message: `A solicitacao de '${approved.requesterUser.username}' foi aprovada.`,
    metadata: {
      approval_request_id: approved.id,
      status: approved.status,
      action: approved.action,
      action_label: approved.actionLabel,
      resource_type: approved.resourceType,
      resource_id: approved.resourceId,
      requester_user_id: approved.requesterUserId,
      requester_username: approved.requesterUser.username,
      decided_by_user_id: approved.decidedByUserId,
      decision_reason: approved.decisionReason,
      expires_at: approved.expiresAt?.toISOString() ?? null,
    },
  });

  return mapApprovalRequest(approved);
}

export async function rejectCriticalApprovalRequest(params: {
  approval_request_id: string;
  decided_by_user_id: string;
  decision_reason?: string | null;
}) {
  const request = await prisma.criticalApprovalRequest.findUnique({
    where: { id: params.approval_request_id },
    include: { requesterUser: { select: { id: true, username: true, fullName: true } } },
  });
  if (!request) {
    throw new AppError('NOT_FOUND', 404, 'Solicitacao de aprovacao nao encontrada');
  }
  if (request.status !== 'pending') {
    throw new AppError('APPROVAL_REQUEST_INVALID_STATE', 409, 'A solicitacao nao esta pendente');
  }

  const rejected = await prisma.criticalApprovalRequest.update({
    where: { id: request.id },
    data: {
      status: 'rejected',
      decidedByUserId: params.decided_by_user_id,
      decisionReason: cleanText(params.decision_reason, 500),
      decidedAt: new Date(),
      expiresAt: null,
      consumedAt: null,
    },
    include: {
      requesterUser: { select: { id: true, username: true, fullName: true } },
      decidedByUser: { select: { id: true, username: true, fullName: true } },
    },
  });

  await createNotification({
    type: 'approval_decided',
    severity: 'warning',
    entityType: 'system',
    entityId: rejected.id,
    title: `Solicitacao reprovada: ${rejected.actionLabel ?? rejected.action}`,
    message: `A solicitacao de '${rejected.requesterUser.username}' foi reprovada.`,
    metadata: {
      approval_request_id: rejected.id,
      status: rejected.status,
      action: rejected.action,
      action_label: rejected.actionLabel,
      requester_user_id: rejected.requesterUserId,
      requester_username: rejected.requesterUser.username,
      decided_by_user_id: rejected.decidedByUserId,
      decision_reason: rejected.decisionReason,
    },
  });

  return mapApprovalRequest(rejected);
}

export async function consumeCriticalApprovalGrant(params: {
  approval_request_id: string;
  requester_user_id: string;
  action: string;
  resource_type?: string | null;
  resource_id?: string | null;
}) {
  const request = await prisma.criticalApprovalRequest.findUnique({
    where: { id: params.approval_request_id },
  });

  if (!request) {
    throw new AppError('APPROVAL_REQUEST_NOT_FOUND', 404, 'Solicitacao de aprovacao nao encontrada');
  }

  if (request.requesterUserId !== params.requester_user_id) {
    throw new AppError('APPROVAL_REQUEST_FORBIDDEN', 403, 'Aprovacao nao pertence a este usuario');
  }

  if (request.status !== 'approved') {
    throw new AppError('APPROVAL_REQUEST_NOT_APPROVED', 409, 'Solicitacao ainda nao foi aprovada');
  }

  if (request.consumedAt) {
    throw new AppError('APPROVAL_REQUEST_ALREADY_USED', 409, 'Aprovacao ja foi consumida');
  }

  if (request.expiresAt && request.expiresAt.getTime() < Date.now()) {
    await prisma.criticalApprovalRequest.update({
      where: { id: request.id },
      data: {
        status: 'canceled',
      },
    });
    throw new AppError('APPROVAL_REQUEST_EXPIRED', 409, 'Aprovacao expirada');
  }

  if (request.action !== params.action) {
    throw new AppError('APPROVAL_REQUEST_ACTION_MISMATCH', 409, 'Aprovacao nao corresponde a esta acao');
  }

  const normalizedResourceType = params.resource_type ?? null;
  const normalizedResourceId = params.resource_id ?? null;
  if ((request.resourceType ?? null) !== normalizedResourceType || (request.resourceId ?? null) !== normalizedResourceId) {
    throw new AppError('APPROVAL_REQUEST_RESOURCE_MISMATCH', 409, 'Aprovacao nao corresponde ao recurso desta acao');
  }

  await prisma.criticalApprovalRequest.update({
    where: { id: request.id },
    data: { consumedAt: new Date() },
  });

  return mapApprovalRequest(request);
}

