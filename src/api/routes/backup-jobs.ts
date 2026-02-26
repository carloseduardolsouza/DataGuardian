import { Router } from "express";
import { z } from "zod";
import { validate } from "../middlewares/validation";
import { requirePermission } from "../middlewares/auth";
import { requireCriticalApproval } from '../middlewares/critical-approval';
import { BackupJobController } from "../controllers/backup-job.controller";
import { PERMISSIONS } from "../../core/auth/permissions";
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
  requirePermission(PERMISSIONS.BACKUP_JOBS_READ),
  validate(listQuerySchema, "query"),
  BackupJobController.list,
);
backupJobsRouter.post(
  "/",
  requirePermission(PERMISSIONS.BACKUP_JOBS_WRITE),
  validate(createBackupJobSchema),
  BackupJobController.create,
);
backupJobsRouter.get("/:id", requirePermission(PERMISSIONS.BACKUP_JOBS_READ), BackupJobController.findById);
backupJobsRouter.put(
  "/:id",
  requirePermission(PERMISSIONS.BACKUP_JOBS_WRITE),
  validate(updateBackupJobSchema),
  BackupJobController.update,
);
backupJobsRouter.delete(
  "/:id",
  requirePermission(PERMISSIONS.BACKUP_JOBS_WRITE),
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
  requirePermission(PERMISSIONS.BACKUP_JOBS_RUN),
  BackupJobController.run,
);
