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
systemRouter.post("/settings/test-smtp", requirePermission(PERMISSIONS.SYSTEM_WRITE), SystemController.testSmtp);
systemRouter.post(
  "/settings/whatsapp/qr",
  requirePermission(PERMISSIONS.SYSTEM_WRITE),
  validate(whatsappQrSchema),
  SystemController.getWhatsappQrCode,
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
