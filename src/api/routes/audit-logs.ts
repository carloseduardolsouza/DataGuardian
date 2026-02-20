import { Router } from 'express';
import { validate } from '../middlewares/validation';
import { AuditLogController } from '../controllers/audit-log.controller';
import { auditLogsQuerySchema } from '../../types/audit.types';
import { requirePermission } from '../middlewares/auth';
import { PERMISSIONS } from '../../core/auth/permissions';

export const auditLogsRouter = Router();

auditLogsRouter.get('/', requirePermission(PERMISSIONS.AUDIT_READ), validate(auditLogsQuerySchema, 'query'), AuditLogController.list);
