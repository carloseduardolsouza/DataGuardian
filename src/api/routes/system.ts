import { Router } from "express";
import { z } from "zod";
import { validate } from "../middlewares/validation";
import { requirePermission } from "../middlewares/auth";
import { SystemController } from "../controllers/system.controller";
import { PERMISSIONS } from "../../core/auth/permissions";

export const systemRouter = Router();

const updateSettingsSchema = z.record(z.unknown());
const settingKeySchema = z.object({
  key: z.string().min(1).max(100),
});
const createSettingSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.unknown(),
  description: z.string().max(500).nullable().optional(),
});
const updateSettingSchema = z.object({
  value: z.unknown().optional(),
  description: z.string().max(500).nullable().optional(),
}).refine((v) => v.value !== undefined || v.description !== undefined, {
  message: 'Informe ao menos "value" ou "description".',
});
const whatsappQrSchema = z.object({
  instance: z.string().min(1).optional(),
});
const whatsappStatusQuerySchema = z.object({
  instance: z.string().min(1).optional(),
});
const notificationTemplateQuerySchema = z.object({
  channel: z.enum(['whatsapp']).optional(),
  type: z.enum([
    'backup_success',
    'backup_failed',
    'connection_lost',
    'connection_restored',
    'storage_full',
    'storage_unreachable',
    'health_degraded',
    'cleanup_completed',
  ]).optional(),
});
const createNotificationTemplateSchema = z.object({
  channel: z.enum(['whatsapp']),
  type: z.enum([
    'backup_success',
    'backup_failed',
    'connection_lost',
    'connection_restored',
    'storage_full',
    'storage_unreachable',
    'health_degraded',
    'cleanup_completed',
  ]),
  version: z.number().int().positive().optional(),
  enabled: z.boolean().optional(),
  title_tpl: z.string().nullable().optional(),
  message_tpl: z.string().min(1),
});
const updateNotificationTemplateSchema = z.object({
  enabled: z.boolean().optional(),
  title_tpl: z.string().nullable().optional(),
  message_tpl: z.string().min(1).optional(),
}).refine((v) => v.enabled !== undefined || v.title_tpl !== undefined || v.message_tpl !== undefined, {
  message: 'Informe ao menos um campo para atualizar.',
});
const templateIdParamsSchema = z.object({
  id: z.string().uuid(),
});

systemRouter.get("/settings", requirePermission(PERMISSIONS.SYSTEM_READ), SystemController.getSettings);
systemRouter.post(
  "/settings",
  requirePermission(PERMISSIONS.SYSTEM_WRITE),
  validate(createSettingSchema),
  SystemController.createSetting,
);
systemRouter.put(
  "/settings",
  requirePermission(PERMISSIONS.SYSTEM_WRITE),
  validate(updateSettingsSchema),
  SystemController.updateSettings,
);
systemRouter.post(
  "/settings/whatsapp/qr",
  requirePermission(PERMISSIONS.SYSTEM_WRITE),
  validate(whatsappQrSchema),
  SystemController.getWhatsappQrCode,
);
systemRouter.get(
  "/settings/whatsapp/status",
  requirePermission(PERMISSIONS.SYSTEM_READ),
  validate(whatsappStatusQuerySchema, "query"),
  SystemController.getWhatsappStatus,
);
systemRouter.get(
  "/settings/:key",
  requirePermission(PERMISSIONS.SYSTEM_READ),
  validate(settingKeySchema, "params"),
  SystemController.getSettingByKey,
);
systemRouter.put(
  "/settings/:key",
  requirePermission(PERMISSIONS.SYSTEM_WRITE),
  validate(settingKeySchema, "params"),
  validate(updateSettingSchema),
  SystemController.updateSettingByKey,
);
systemRouter.delete(
  "/settings/:key",
  requirePermission(PERMISSIONS.SYSTEM_WRITE),
  validate(settingKeySchema, "params"),
  SystemController.deleteSettingByKey,
);

systemRouter.get(
  '/notification-templates',
  requirePermission(PERMISSIONS.SYSTEM_READ),
  validate(notificationTemplateQuerySchema, 'query'),
  SystemController.listNotificationTemplates,
);
systemRouter.post(
  '/notification-templates',
  requirePermission(PERMISSIONS.SYSTEM_WRITE),
  validate(createNotificationTemplateSchema),
  SystemController.createNotificationTemplate,
);
systemRouter.put(
  '/notification-templates/:id',
  requirePermission(PERMISSIONS.SYSTEM_WRITE),
  validate(templateIdParamsSchema, 'params'),
  validate(updateNotificationTemplateSchema),
  SystemController.updateNotificationTemplate,
);
systemRouter.post(
  '/notification-templates/:id/new-version',
  requirePermission(PERMISSIONS.SYSTEM_WRITE),
  validate(templateIdParamsSchema, 'params'),
  validate(updateNotificationTemplateSchema),
  SystemController.createNotificationTemplateVersion,
);
