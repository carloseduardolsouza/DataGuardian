import { Router } from 'express';
import { validate } from '../middlewares/validation';
import { requirePermission, requireScopedPermission } from '../middlewares/auth';
import { requireCriticalApproval } from '../middlewares/critical-approval';
import { PERMISSIONS } from '../../core/auth/permissions';
import { RestoreDrillJobsController } from '../controllers/restore-drill-jobs.controller';
import {
  createRestoreDrillJobSchema,
  listRestoreDrillJobsQuerySchema,
  updateRestoreDrillJobSchema,
} from '../../types/restore-drill.types';

export const restoreDrillJobsRouter = Router();

restoreDrillJobsRouter.get(
  '/',
  requireScopedPermission(PERMISSIONS.RESTORE_DRILL_JOBS_READ, { resource_type: 'restore_drill_job' }),
  validate(listRestoreDrillJobsQuerySchema, 'query'),
  RestoreDrillJobsController.list,
);

restoreDrillJobsRouter.post(
  '/',
  requirePermission(PERMISSIONS.RESTORE_DRILL_JOBS_WRITE),
  validate(createRestoreDrillJobSchema),
  RestoreDrillJobsController.create,
);

restoreDrillJobsRouter.get(
  '/:id',
  requireScopedPermission(
    PERMISSIONS.RESTORE_DRILL_JOBS_READ,
    (req) => ({ resource_type: 'restore_drill_job', resource_id: String(req.params.id) }),
  ),
  RestoreDrillJobsController.findById,
);

restoreDrillJobsRouter.put(
  '/:id',
  requireScopedPermission(
    PERMISSIONS.RESTORE_DRILL_JOBS_WRITE,
    (req) => ({ resource_type: 'restore_drill_job', resource_id: String(req.params.id) }),
  ),
  validate(updateRestoreDrillJobSchema),
  RestoreDrillJobsController.update,
);

restoreDrillJobsRouter.delete(
  '/:id',
  requireScopedPermission(
    PERMISSIONS.RESTORE_DRILL_JOBS_WRITE,
    (req) => ({ resource_type: 'restore_drill_job', resource_id: String(req.params.id) }),
  ),
  RestoreDrillJobsController.remove,
);

restoreDrillJobsRouter.post(
  '/:id/run',
  requireScopedPermission(
    PERMISSIONS.RESTORE_DRILL_JOBS_RUN,
    (req) => ({ resource_type: 'restore_drill_job', resource_id: String(req.params.id) }),
  ),
  requireCriticalApproval({
    action: 'restore_drill_job.run',
    actionLabel: 'Executar restore drill',
    resourceType: 'restore_drill_job',
    resolveResourceId: (req) => String(req.params.id),
  }),
  RestoreDrillJobsController.runNow,
);

restoreDrillJobsRouter.get(
  '/:id/executions',
  requireScopedPermission(
    PERMISSIONS.RESTORE_DRILL_JOBS_READ,
    (req) => ({ resource_type: 'restore_drill_job', resource_id: String(req.params.id) }),
  ),
  RestoreDrillJobsController.executions,
);
