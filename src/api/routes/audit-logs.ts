import { Router } from 'express';
import { validate } from '../middlewares/validation';
import { AuditLogController } from '../controllers/audit-log.controller';
import { auditLogsCleanupBodySchema, auditLogsDeleteQuerySchema, auditLogsQuerySchema } from '../../types/audit.types';
import { requirePermission } from '../middlewares/auth';
import { requireCriticalApproval } from '../middlewares/critical-approval';
import { PERMISSIONS } from '../../core/auth/permissions';

export const auditLogsRouter = Router();

auditLogsRouter.get('/', requirePermission(PERMISSIONS.AUDIT_READ), validate(auditLogsQuerySchema, 'query'), AuditLogController.list);
auditLogsRouter.delete(
  '/',
  requirePermission(PERMISSIONS.AUDIT_READ),
  validate(auditLogsDeleteQuerySchema, 'query'),
  requireCriticalApproval({
    action: 'audit_logs.cleanup',
    actionLabel: 'Limpar historico de auditoria',
    resourceType: 'audit_logs',
  }),
  AuditLogController.removeByPeriod,
);
auditLogsRouter.post(
  '/cleanup',
  requirePermission(PERMISSIONS.AUDIT_READ),
  validate(auditLogsCleanupBodySchema, 'body'),
  requireCriticalApproval({
    action: 'audit_logs.cleanup',
    actionLabel: 'Limpar historico de auditoria',
    resourceType: 'audit_logs',
  }),
  AuditLogController.removeByPeriod,
);
