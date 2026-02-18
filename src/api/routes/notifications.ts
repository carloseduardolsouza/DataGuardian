import { Router } from "express";
import { z } from "zod";
import { validate } from "../middlewares/validation";
import { NotificationController } from "../controllers/notification.controller";

export const notificationsRouter = Router();

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  read: z.enum(["true", "false"]).optional(),
  severity: z.enum(["info", "warning", "critical"]).optional(),
  type: z
    .enum([
      "backup_success",
      "backup_failed",
      "connection_lost",
      "connection_restored",
      "storage_full",
      "storage_unreachable",
      "health_degraded",
      "cleanup_completed",
    ])
    .optional(),
});

// /read-all deve ser registrado ANTES de /:id/read para não capturar "read-all" como ID
notificationsRouter.get(
  "/",
  validate(listQuerySchema, "query"),
  NotificationController.list,
);
notificationsRouter.put("/read-all", NotificationController.markAllAsRead);
notificationsRouter.put("/:id/read", NotificationController.markAsRead);
notificationsRouter.delete("/:id", NotificationController.remove);
