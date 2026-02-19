import { Router } from "express";
import { z } from "zod";
import { validate } from "../middlewares/validation";
import { StorageLocationController } from "../controllers/storage-location.controller";
import {
  createStorageLocationSchema,
  updateStorageLocationSchema,
} from "../../types/storage.types";

export const storageLocationsRouter = Router();

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum(["local", "s3", "ssh", "minio", "backblaze"]).optional(),
  status: z.enum(["healthy", "full", "unreachable"]).optional(),
});

const testConfigSchema = z.object({
  type: z.enum(["local", "s3", "ssh", "minio", "backblaze"]),
  config: z.record(z.unknown()),
});

storageLocationsRouter.get(
  "/",
  validate(listQuerySchema, "query"),
  StorageLocationController.list,
);
storageLocationsRouter.post(
  "/",
  validate(createStorageLocationSchema),
  StorageLocationController.create,
);
storageLocationsRouter.post(
  "/test",
  validate(testConfigSchema),
  StorageLocationController.testConfig,
);
storageLocationsRouter.get("/:id", StorageLocationController.findById);
storageLocationsRouter.put(
  "/:id",
  validate(updateStorageLocationSchema),
  StorageLocationController.update,
);
storageLocationsRouter.delete("/:id", StorageLocationController.remove);
storageLocationsRouter.post(
  "/:id/test",
  StorageLocationController.testConnection,
);
