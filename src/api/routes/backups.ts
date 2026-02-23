import { Router } from 'express';
import express from 'express';
import { z } from 'zod';
import { BackupsController } from '../controllers/backups.controller';
import { validate } from '../middlewares/validation';
import { requirePermission } from '../middlewares/auth';
import { PERMISSIONS } from '../../core/auth/permissions';

export const backupsRouter = Router();

const restoreBodySchema = z.object({
  storage_location_id: z.string().uuid().optional(),
  target_datasource_id: z.string().uuid().optional(),
  drop_existing: z.boolean().optional(),
  verification_mode: z.boolean().optional(),
  keep_verification_database: z.boolean().optional(),
  confirmation_phrase: z.string().trim().max(120).optional(),
});

const backupDownloadQuerySchema = z.object({
  storage_location_id: z.string().uuid().optional(),
});

const importRestoreQuerySchema = z.object({
  target_datasource_id: z.string().uuid(),
  drop_existing: z.coerce.boolean().optional(),
  verification_mode: z.coerce.boolean().optional(),
  keep_verification_database: z.coerce.boolean().optional(),
  confirmation_phrase: z.string().trim().max(120),
});

backupsRouter.get('/datasources', requirePermission(PERMISSIONS.BACKUPS_READ), BackupsController.datasources);
backupsRouter.get('/datasources/:datasourceId', requirePermission(PERMISSIONS.BACKUPS_READ), BackupsController.byDatasource);
backupsRouter.get('/restore-targets', requirePermission(PERMISSIONS.BACKUPS_RESTORE), BackupsController.restoreTargets);
backupsRouter.get(
  '/:executionId/download',
  requirePermission(PERMISSIONS.BACKUPS_READ),
  validate(backupDownloadQuerySchema, 'query'),
  BackupsController.download,
);
backupsRouter.post(
  '/import-restore',
  requirePermission(PERMISSIONS.BACKUPS_RESTORE),
  express.raw({ type: 'application/octet-stream', limit: '5gb' }),
  validate(importRestoreQuerySchema, 'query'),
  BackupsController.importRestore,
);
backupsRouter.post(
  '/:executionId/restore',
  requirePermission(PERMISSIONS.BACKUPS_RESTORE),
  validate(restoreBodySchema),
  BackupsController.restore,
);
