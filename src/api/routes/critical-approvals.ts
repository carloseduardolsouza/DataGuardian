import { Router } from 'express';
import { validate } from '../middlewares/validation';
import { requirePermission } from '../middlewares/auth';
import { CriticalApprovalController } from '../controllers/critical-approval.controller';
import { PERMISSIONS } from '../../core/auth/permissions';
import {
  createCriticalApprovalRequestSchema,
  criticalApprovalListQuerySchema,
  updateCriticalApprovalDecisionSchema,
} from '../../types/critical-approval.types';

export const criticalApprovalsRouter = Router();

criticalApprovalsRouter.post(
  '/requests',
  validate(createCriticalApprovalRequestSchema),
  CriticalApprovalController.request,
);

criticalApprovalsRouter.get(
  '/requests/mine',
  validate(criticalApprovalListQuerySchema, 'query'),
  CriticalApprovalController.listMine,
);

criticalApprovalsRouter.get(
  '/requests',
  requirePermission(PERMISSIONS.ACCESS_MANAGE),
  validate(criticalApprovalListQuerySchema, 'query'),
  CriticalApprovalController.list,
);

criticalApprovalsRouter.post(
  '/requests/:id/approve',
  requirePermission(PERMISSIONS.ACCESS_MANAGE),
  validate(updateCriticalApprovalDecisionSchema),
  CriticalApprovalController.approve,
);

criticalApprovalsRouter.post(
  '/requests/:id/reject',
  requirePermission(PERMISSIONS.ACCESS_MANAGE),
  validate(updateCriticalApprovalDecisionSchema),
  CriticalApprovalController.reject,
);
