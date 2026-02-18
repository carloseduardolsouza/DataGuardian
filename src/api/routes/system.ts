import { Router } from "express";
import { z } from "zod";
import { validate } from "../middlewares/validation";
import { SystemController } from "../controllers/system.controller";

export const systemRouter = Router();

const updateSettingsSchema = z.record(z.unknown());

systemRouter.get("/settings", SystemController.getSettings);
systemRouter.put(
  "/settings",
  validate(updateSettingsSchema),
  SystemController.updateSettings,
);
systemRouter.post("/settings/test-smtp", SystemController.testSmtp);
