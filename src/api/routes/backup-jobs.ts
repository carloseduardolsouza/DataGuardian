import { Router } from "express";
import { z } from "zod";
import { validate } from "../middlewares/validation";
import { requirePermission, requireScopedPermission } from "../middlewares/auth";
import { requireCriticalApproval } from '../middlewares/critical-approval';
import { BackupJobController } from "../controllers/backup-job.controller";
import { PERMISSIONS } from "../../core/auth/permissions";
import { prisma } from '../../lib/prisma';
import {
  createBackupJobSchema,
  updateBackupJobSchema,
} from "../../types/backup.types";

export const backupJobsRouter = Router();

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  enabled: z.enum(["true", "false"]).optional(),
  datasource_id: z.string().uuid().optional(),
  storage_location_id: z.string().uuid().optional(),
});

backupJobsRouter.get(
  "/",
  requireScopedPermission(PERMISSIONS.BACKUP_JOBS_READ, { resource_type: 'backup_job' }),
  validate(listQuerySchema, "query"),
  BackupJobController.list,
);
backupJobsRouter.post(
  "/",
  requirePermission(PERMISSIONS.BACKUP_JOBS_WRITE),
  validate(createBackupJobSchema),
  BackupJobController.create,
);
backupJobsRouter.get(
  "/:id",
  requireScopedPermission(PERMISSIONS.BACKUP_JOBS_READ, (req) => ({ resource_type: 'backup_job', resource_id: String(req.params.id) })),
  BackupJobController.findById,
);
backupJobsRouter.put(
  "/:id",
  requireScopedPermission(PERMISSIONS.BACKUP_JOBS_WRITE, (req) => ({ resource_type: 'backup_job', resource_id: String(req.params.id) })),
  validate(updateBackupJobSchema),
  BackupJobController.update,
);
backupJobsRouter.delete(
  "/:id",
  requireScopedPermission(PERMISSIONS.BACKUP_JOBS_WRITE, (req) => ({ resource_type: 'backup_job', resource_id: String(req.params.id) })),
  requireCriticalApproval({
    action: 'backup_job.delete',
    actionLabel: 'Excluir job de backup',
    resourceType: 'backup_job',
    resolveResourceId: (req) => String(req.params.id),
  }),
  BackupJobController.remove,
);
backupJobsRouter.post(
  "/:id/run",
  requireScopedPermission(PERMISSIONS.BACKUP_JOBS_RUN, async (req) => {
    const jobId = String(req.params.id);
    let job: { datasourceId: string; storageLocationId: string } | null = null;
    try {
      job = await prisma.backupJob.findUnique({
        where: { id: jobId },
        select: { datasourceId: true, storageLocationId: true },
      });
    } catch {
      return [{ resource_type: 'backup_job', resource_id: jobId }];
    }
    if (!job) return [{ resource_type: 'backup_job', resource_id: jobId }];
    return [
      { resource_type: 'backup_job', resource_id: jobId },
      { resource_type: 'datasource', resource_id: job.datasourceId },
      { resource_type: 'storage_location', resource_id: job.storageLocationId },
    ];
  }),
  BackupJobController.run,
);
