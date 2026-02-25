import { Router } from 'express';
import { validate } from '../middlewares/validation';
import { requirePermission } from '../middlewares/auth';
import { requireCriticalApproval } from '../middlewares/critical-approval';
import { PERMISSIONS } from '../../core/auth/permissions';
import { DbSyncJobsController } from '../controllers/db-sync-jobs.controller';
import {
  createDbSyncJobSchema,
  listDbSyncJobsQuerySchema,
  updateDbSyncJobSchema,
} from '../../types/db-sync.types';

export const dbSyncJobsRouter = Router();

dbSyncJobsRouter.get(
  '/',
  requirePermission(PERMISSIONS.DB_SYNC_JOBS_READ),
  validate(listDbSyncJobsQuerySchema, 'query'),
  DbSyncJobsController.list,
);

dbSyncJobsRouter.post(
  '/',
  requirePermission(PERMISSIONS.DB_SYNC_JOBS_WRITE),
  validate(createDbSyncJobSchema),
  DbSyncJobsController.create,
);

dbSyncJobsRouter.get('/:id', requirePermission(PERMISSIONS.DB_SYNC_JOBS_READ), DbSyncJobsController.findById);
dbSyncJobsRouter.put(
  '/:id',
  requirePermission(PERMISSIONS.DB_SYNC_JOBS_WRITE),
  validate(updateDbSyncJobSchema),
  DbSyncJobsController.update,
);
dbSyncJobsRouter.delete(
  '/:id',
  requirePermission(PERMISSIONS.DB_SYNC_JOBS_WRITE),
  requireCriticalApproval({
    action: 'db_sync_job.delete',
    actionLabel: 'Excluir job de sincronizacao',
    resourceType: 'db_sync_job',
    resolveResourceId: (req) => String(req.params.id),
  }),
  DbSyncJobsController.remove,
);
dbSyncJobsRouter.post(
  '/:id/run',
  requirePermission(PERMISSIONS.DB_SYNC_JOBS_RUN),
  requireCriticalApproval({
    action: 'db_sync_job.run',
    actionLabel: 'Executar sincronizacao',
    resourceType: 'db_sync_job',
    resolveResourceId: (req) => String(req.params.id),
  }),
  DbSyncJobsController.runNow,
);
dbSyncJobsRouter.get('/:id/executions', requirePermission(PERMISSIONS.DB_SYNC_JOBS_READ), DbSyncJobsController.executions);
