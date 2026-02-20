import { Router } from 'express';
import { z } from 'zod';
import { BackupsController } from '../controllers/backups.controller';
import { validate } from '../middlewares/validation';
import { requirePermission } from '../middlewares/auth';
import { PERMISSIONS } from '../../core/auth/permissions';

export const backupsRouter = Router();

const restoreBodySchema = z.object({
  storage_location_id: z.string().uuid().optional(),
  drop_existing: z.boolean().optional(),
});

backupsRouter.get('/datasources', requirePermission(PERMISSIONS.BACKUPS_READ), BackupsController.datasources);
backupsRouter.get('/datasources/:datasourceId', requirePermission(PERMISSIONS.BACKUPS_READ), BackupsController.byDatasource);
backupsRouter.post(
  '/:executionId/restore',
  requirePermission(PERMISSIONS.BACKUPS_RESTORE),
  validate(restoreBodySchema),
  BackupsController.restore,
);
