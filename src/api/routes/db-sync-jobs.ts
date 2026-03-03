import { Router } from 'express';
import { validate } from '../middlewares/validation';
import { requirePermission, requireScopedPermission } from '../middlewares/auth';
import { requireCriticalApproval } from '../middlewares/critical-approval';
import { PERMISSIONS } from '../../core/auth/permissions';
import { DbSyncJobsController } from '../controllers/db-sync-jobs.controller';
import { prisma } from '../../lib/prisma';
import {
  createDbSyncJobSchema,
  listDbSyncJobsQuerySchema,
  updateDbSyncJobSchema,
} from '../../types/db-sync.types';

export const dbSyncJobsRouter = Router();

dbSyncJobsRouter.get(
  '/',
  requireScopedPermission(PERMISSIONS.DB_SYNC_JOBS_READ, { resource_type: 'db_sync_job' }),
  validate(listDbSyncJobsQuerySchema, 'query'),
  DbSyncJobsController.list,
);

dbSyncJobsRouter.post(
  '/',
  requirePermission(PERMISSIONS.DB_SYNC_JOBS_WRITE),
  validate(createDbSyncJobSchema),
  DbSyncJobsController.create,
);

dbSyncJobsRouter.get(
  '/:id',
  requireScopedPermission(PERMISSIONS.DB_SYNC_JOBS_READ, (req) => ({ resource_type: 'db_sync_job', resource_id: String(req.params.id) })),
  DbSyncJobsController.findById,
);

dbSyncJobsRouter.put(
  '/:id',
  requireScopedPermission(PERMISSIONS.DB_SYNC_JOBS_WRITE, (req) => ({ resource_type: 'db_sync_job', resource_id: String(req.params.id) })),
  validate(updateDbSyncJobSchema),
  DbSyncJobsController.update,
);

dbSyncJobsRouter.delete(
  '/:id',
  requireScopedPermission(PERMISSIONS.DB_SYNC_JOBS_WRITE, (req) => ({ resource_type: 'db_sync_job', resource_id: String(req.params.id) })),
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
  requireScopedPermission(PERMISSIONS.DB_SYNC_JOBS_RUN, async (req) => {
    const jobId = String(req.params.id);
    const job = await prisma.databaseSyncJob.findUnique({
      where: { id: jobId },
      select: {
        sourceDatasourceId: true,
        targetDatasourceId: true,
        storageLocationId: true,
      },
    });

    if (!job) return [{ resource_type: 'db_sync_job', resource_id: jobId }];

    return [
      { resource_type: 'db_sync_job', resource_id: jobId },
      { resource_type: 'datasource', resource_id: job.sourceDatasourceId },
      { resource_type: 'datasource', resource_id: job.targetDatasourceId },
      { resource_type: 'storage_location', resource_id: job.storageLocationId },
    ];
  }),
  requireCriticalApproval({
    action: 'db_sync_job.run',
    actionLabel: 'Executar sincronizacao',
    resourceType: 'db_sync_job',
    resolveResourceId: (req) => String(req.params.id),
  }),
  DbSyncJobsController.runNow,
);

dbSyncJobsRouter.get(
  '/:id/executions',
  requireScopedPermission(PERMISSIONS.DB_SYNC_JOBS_READ, (req) => ({ resource_type: 'db_sync_job', resource_id: String(req.params.id) })),
  DbSyncJobsController.executions,
);
