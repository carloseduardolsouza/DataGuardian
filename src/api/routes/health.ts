import { Router } from "express";
import { z } from "zod";
import { validate } from "../middlewares/validation";
import { HealthController } from "../controllers/health.controller";

export const healthRouter = Router();

const healthQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  datasource_id: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const storageHealthQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  storage_location_id: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

healthRouter.get("/", HealthController.getSystemStatus);
healthRouter.get(
  "/datasources",
  validate(healthQuerySchema, "query"),
  HealthController.getDatasourceHistory,
);
healthRouter.get(
  "/storage",
  validate(storageHealthQuerySchema, "query"),
  HealthController.getStorageHistory,
);
