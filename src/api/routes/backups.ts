import { Router } from 'express';
import express from 'express';
import { z } from 'zod';
import { BackupsController } from '../controllers/backups.controller';
import { validate } from '../middlewares/validation';
import { requirePermission } from '../middlewares/auth';
import { requireCriticalApproval } from '../middlewares/critical-approval';
import { PERMISSIONS } from '../../core/auth/permissions';
import { prisma } from '../../lib/prisma';
import { isProductionDatasource } from '../../core/datasource/classification';

export const backupsRouter = Router();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveRestoreTargetDatasourceId(req: express.Request) {
  const explicitTargetId = typeof req.body?.target_datasource_id === 'string'
    ? req.body.target_datasource_id.trim()
    : '';

  if (explicitTargetId && UUID_REGEX.test(explicitTargetId)) {
    return explicitTargetId;
  }

  const executionId = String(req.params.executionId ?? '').trim();
  if (!UUID_REGEX.test(executionId)) return null;

  const execution = await prisma.backupExecution.findUnique({
    where: { id: executionId },
    select: { datasourceId: true },
  });
  return execution?.datasourceId ?? null;
}

async function shouldEnforceAdminApprovalForRestore(req: express.Request) {
  const targetDatasourceId = await resolveRestoreTargetDatasourceId(req);
  if (!targetDatasourceId) return false;

  const target = await prisma.datasource.findUnique({
    where: { id: targetDatasourceId },
    select: { tags: true },
  });
  if (!target) return false;
  return isProductionDatasource(target.tags ?? []);
}

async function shouldEnforceAdminApprovalForImportRestore(req: express.Request) {
  const targetDatasourceId = typeof req.query?.target_datasource_id === 'string'
    ? req.query.target_datasource_id.trim()
    : '';
  if (!UUID_REGEX.test(targetDatasourceId)) return false;

  const target = await prisma.datasource.findUnique({
    where: { id: targetDatasourceId },
    select: { tags: true },
  });
  if (!target) return false;
  return isProductionDatasource(target.tags ?? []);
}

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
  requireCriticalApproval({
    action: 'backup.import_restore',
    actionLabel: 'Importar e restaurar backup',
    resourceType: 'backup_import_restore',
    enforceForAdmins: shouldEnforceAdminApprovalForImportRestore,
  }),
  express.raw({ type: 'application/octet-stream', limit: '5gb' }),
  validate(importRestoreQuerySchema, 'query'),
  BackupsController.importRestore,
);
backupsRouter.post(
  '/:executionId/restore',
  requirePermission(PERMISSIONS.BACKUPS_RESTORE),
  requireCriticalApproval({
    action: 'backup.restore',
    actionLabel: 'Restaurar backup',
    resourceType: 'backup_execution',
    resolveResourceId: (req) => String(req.params.executionId),
    enforceForAdmins: shouldEnforceAdminApprovalForRestore,
  }),
  validate(restoreBodySchema),
  BackupsController.restore,
);
