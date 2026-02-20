import { Router } from "express";
import { z } from "zod";
import { validate } from "../middlewares/validation";
import { requirePermission } from "../middlewares/auth";
import { NotificationController } from "../controllers/notification.controller";
import { PERMISSIONS } from "../../core/auth/permissions";

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
  requirePermission(PERMISSIONS.NOTIFICATIONS_READ),
  validate(listQuerySchema, "query"),
  NotificationController.list,
);
notificationsRouter.put("/read-all", requirePermission(PERMISSIONS.NOTIFICATIONS_MANAGE), NotificationController.markAllAsRead);
notificationsRouter.put("/:id/read", requirePermission(PERMISSIONS.NOTIFICATIONS_MANAGE), NotificationController.markAsRead);
notificationsRouter.delete("/:id", requirePermission(PERMISSIONS.NOTIFICATIONS_MANAGE), NotificationController.remove);
