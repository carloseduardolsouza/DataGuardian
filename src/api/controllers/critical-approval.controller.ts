import { NextFunction, Request, Response } from 'express';
import { getPaginationParams, buildPaginatedResponse } from '../../utils/config';
import type { CriticalApprovalStatus } from '@prisma/client';
import {
  approveCriticalApprovalRequest,
  createCriticalApprovalRequest,
  listCriticalApprovalRequests,
  listMyCriticalApprovalRequests,
  rejectCriticalApprovalRequest,
} from '../models/critical-approval.model';
import { createAuditLog, extractAuditContextFromRequest } from '../models/audit-log.model';

export const CriticalApprovalController = {
  async request(req: Request, res: Response, next: NextFunction) {
    try {
      const actorUser = res.locals.authUser as { id?: string } | undefined;
      const requesterUserId = String(actorUser?.id ?? '').trim();
      const created = await createCriticalApprovalRequest({
        requester_user_id: requesterUserId,
        action: req.body.action,
        action_label: req.body.action_label,
        resource_type: req.body.resource_type,
        resource_id: req.body.resource_id,
        request_reason: req.body.request_reason,
        payload: req.body.payload,
      });

      await createAuditLog({
        ...extractAuditContextFromRequest(req, res.locals.authUser),
        action: 'critical_approval.request.create',
        resource_type: 'critical_approval_request',
        resource_id: created.id,
        changes: { created },
      });

      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  },

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit, skip } = getPaginationParams(req.query);
      const statusRaw = typeof req.query.status === 'string' ? req.query.status : undefined;
      const status: CriticalApprovalStatus | undefined =
        statusRaw === 'pending' || statusRaw === 'approved' || statusRaw === 'rejected' || statusRaw === 'canceled'
          ? statusRaw
          : undefined;
      const requesterUserId = typeof req.query.requester_user_id === 'string' ? req.query.requester_user_id : undefined;
      const action = typeof req.query.action === 'string' ? req.query.action : undefined;
      const { items, total } = await listCriticalApprovalRequests({
        skip,
        limit,
        status,
        requester_user_id: requesterUserId,
        action,
      });
      res.json(buildPaginatedResponse(items, total, page, limit));
    } catch (err) {
      next(err);
    }
  },

  async listMine(req: Request, res: Response, next: NextFunction) {
    try {
      const actorUser = res.locals.authUser as { id?: string } | undefined;
      const requesterUserId = String(actorUser?.id ?? '').trim();
      const { page, limit, skip } = getPaginationParams(req.query);
      const statusRaw = typeof req.query.status === 'string' ? req.query.status : undefined;
      const status: CriticalApprovalStatus | undefined =
        statusRaw === 'pending' || statusRaw === 'approved' || statusRaw === 'rejected' || statusRaw === 'canceled'
          ? statusRaw
          : undefined;
      const { items, total } = await listMyCriticalApprovalRequests({
        requester_user_id: requesterUserId,
        skip,
        limit,
        status,
      });
      res.json(buildPaginatedResponse(items, total, page, limit));
    } catch (err) {
      next(err);
    }
  },

  async approve(req: Request, res: Response, next: NextFunction) {
    try {
      const actorUser = res.locals.authUser as { id?: string } | undefined;
      const decidedByUserId = String(actorUser?.id ?? '').trim();
      const approved = await approveCriticalApprovalRequest({
        approval_request_id: String(req.params.id),
        decided_by_user_id: decidedByUserId,
        decision_reason: req.body?.decision_reason,
        expires_minutes: req.body?.expires_minutes,
      });

      await createAuditLog({
        ...extractAuditContextFromRequest(req, res.locals.authUser),
        action: 'critical_approval.request.approve',
        resource_type: 'critical_approval_request',
        resource_id: approved.id,
        changes: { approved },
      });

      res.json(approved);
    } catch (err) {
      next(err);
    }
  },

  async reject(req: Request, res: Response, next: NextFunction) {
    try {
      const actorUser = res.locals.authUser as { id?: string } | undefined;
      const decidedByUserId = String(actorUser?.id ?? '').trim();
      const rejected = await rejectCriticalApprovalRequest({
        approval_request_id: String(req.params.id),
        decided_by_user_id: decidedByUserId,
        decision_reason: req.body?.decision_reason,
      });

      await createAuditLog({
        ...extractAuditContextFromRequest(req, res.locals.authUser),
        action: 'critical_approval.request.reject',
        resource_type: 'critical_approval_request',
        resource_id: rejected.id,
        changes: { rejected },
      });

      res.json(rejected);
    } catch (err) {
      next(err);
    }
  },
};
