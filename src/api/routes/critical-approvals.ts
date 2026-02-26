import { Router } from 'express';
import { validate } from '../middlewares/validation';
import { requireRole } from '../middlewares/auth';
import { CriticalApprovalController } from '../controllers/critical-approval.controller';
import { DEFAULT_ROLE_NAMES } from '../../core/auth/permissions';
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
  requireRole(DEFAULT_ROLE_NAMES.ADMIN),
  validate(criticalApprovalListQuerySchema, 'query'),
  CriticalApprovalController.list,
);

criticalApprovalsRouter.post(
  '/requests/:id/approve',
  requireRole(DEFAULT_ROLE_NAMES.ADMIN),
  validate(updateCriticalApprovalDecisionSchema),
  CriticalApprovalController.approve,
);

criticalApprovalsRouter.post(
  '/requests/:id/reject',
  requireRole(DEFAULT_ROLE_NAMES.ADMIN),
  validate(updateCriticalApprovalDecisionSchema),
  CriticalApprovalController.reject,
);
