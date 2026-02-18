import { Router } from "express";
import { z } from "zod";
import { validate } from "../middlewares/validation";
import { BackupJobController } from "../controllers/backup-job.controller";
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
  validate(listQuerySchema, "query"),
  BackupJobController.list,
);
backupJobsRouter.post(
  "/",
  validate(createBackupJobSchema),
  BackupJobController.create,
);
backupJobsRouter.get("/:id", BackupJobController.findById);
backupJobsRouter.put(
  "/:id",
  validate(updateBackupJobSchema),
  BackupJobController.update,
);
backupJobsRouter.delete("/:id", BackupJobController.remove);
backupJobsRouter.post("/:id/run", BackupJobController.run);
