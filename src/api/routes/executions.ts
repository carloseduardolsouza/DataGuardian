import { Router } from 'express';
import { validate } from '../middlewares/validation';
import { requirePermission } from '../middlewares/auth';
import { requireCriticalApproval } from '../middlewares/critical-approval';
import { ExecutionController } from '../controllers/execution.controller';
import { executionQuerySchema } from '../../types/backup.types';
import { PERMISSIONS } from '../../core/auth/permissions';

export const executionsRouter = Router();

executionsRouter.get(
  '/',
  requirePermission(PERMISSIONS.EXECUTIONS_READ),
  validate(executionQuerySchema, 'query'),
  ExecutionController.list,
);
executionsRouter.get('/:id', requirePermission(PERMISSIONS.EXECUTIONS_READ), ExecutionController.findById);
executionsRouter.get('/:id/logs', requirePermission(PERMISSIONS.EXECUTIONS_READ), ExecutionController.logs);
executionsRouter.post('/:id/cancel', requirePermission(PERMISSIONS.EXECUTIONS_CONTROL), ExecutionController.cancel);
executionsRouter.post('/:id/retry-upload', requirePermission(PERMISSIONS.EXECUTIONS_CONTROL), ExecutionController.retryUpload);
executionsRouter.delete(
  '/:id',
  requirePermission(PERMISSIONS.EXECUTIONS_CONTROL),
  requireCriticalApproval({
    action: 'execution.delete',
    actionLabel: 'Excluir execucao',
    resourceType: 'execution',
    resolveResourceId: (req) => String(req.params.id),
  }),
  ExecutionController.remove,
);
