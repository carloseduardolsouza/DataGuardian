import { Router } from "express";
import { z } from "zod";
import { validate } from "../middlewares/validation";
import { SystemController } from "../controllers/system.controller";

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

systemRouter.get("/settings", SystemController.getSettings);
systemRouter.post(
  "/settings",
  validate(createSettingSchema),
  SystemController.createSetting,
);
systemRouter.put(
  "/settings",
  validate(updateSettingsSchema),
  SystemController.updateSettings,
);
systemRouter.post("/settings/test-smtp", SystemController.testSmtp);
systemRouter.post(
  "/settings/whatsapp/qr",
  validate(whatsappQrSchema),
  SystemController.getWhatsappQrCode,
);
systemRouter.get(
  "/settings/:key",
  validate(settingKeySchema, "params"),
  SystemController.getSettingByKey,
);
systemRouter.put(
  "/settings/:key",
  validate(settingKeySchema, "params"),
  validate(updateSettingSchema),
  SystemController.updateSettingByKey,
);
systemRouter.delete(
  "/settings/:key",
  validate(settingKeySchema, "params"),
  SystemController.deleteSettingByKey,
);
