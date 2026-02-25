import { Router } from "express";
import { z } from "zod";
import { validate } from "../middlewares/validation";
import { requirePermission } from "../middlewares/auth";
import { requireCriticalApproval } from '../middlewares/critical-approval';
import { StorageLocationController } from "../controllers/storage-location.controller";
import { PERMISSIONS } from "../../core/auth/permissions";
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

const browseFilesQuerySchema = z.object({
  path: z.string().optional(),
});

const copyFileSchema = z.object({
  source_path: z.string().min(1),
  destination_path: z.string().min(1),
});

storageLocationsRouter.get(
  "/",
  requirePermission(PERMISSIONS.STORAGE_READ),
  validate(listQuerySchema, "query"),
  StorageLocationController.list,
);
storageLocationsRouter.post(
  "/",
  requirePermission(PERMISSIONS.STORAGE_WRITE),
  validate(createStorageLocationSchema),
  StorageLocationController.create,
);
storageLocationsRouter.post(
  "/test",
  requirePermission(PERMISSIONS.STORAGE_WRITE),
  validate(testConfigSchema),
  StorageLocationController.testConfig,
);
storageLocationsRouter.get("/:id", requirePermission(PERMISSIONS.STORAGE_READ), StorageLocationController.findById);
storageLocationsRouter.put(
  "/:id",
  requirePermission(PERMISSIONS.STORAGE_WRITE),
  validate(updateStorageLocationSchema),
  StorageLocationController.update,
);
storageLocationsRouter.delete(
  "/:id",
  requirePermission(PERMISSIONS.STORAGE_WRITE),
  requireCriticalApproval({
    action: 'storage.delete',
    actionLabel: 'Excluir storage',
    resourceType: 'storage_location',
    resolveResourceId: (req) => String(req.params.id),
  }),
  StorageLocationController.remove,
);
storageLocationsRouter.post(
  "/:id/test",
  requirePermission(PERMISSIONS.STORAGE_WRITE),
  StorageLocationController.testConnection,
);
storageLocationsRouter.get(
  "/:id/files",
  requirePermission(PERMISSIONS.STORAGE_READ),
  validate(browseFilesQuerySchema, "query"),
  StorageLocationController.browseFiles,
);
storageLocationsRouter.delete(
  "/:id/files",
  requirePermission(PERMISSIONS.STORAGE_WRITE),
  validate(browseFilesQuerySchema, "query"),
  requireCriticalApproval({
    action: 'storage.path.delete',
    actionLabel: 'Excluir caminho no storage',
    resourceType: 'storage_location_path',
    resolveResourceId: (req) => `${String(req.params.id)}:${String(req.query.path ?? '')}`,
  }),
  StorageLocationController.deleteFile,
);
storageLocationsRouter.post(
  "/:id/files/copy",
  requirePermission(PERMISSIONS.STORAGE_WRITE),
  validate(copyFileSchema),
  StorageLocationController.copyFile,
);
storageLocationsRouter.get(
  "/:id/files/download",
  requirePermission(PERMISSIONS.STORAGE_DOWNLOAD),
  validate(browseFilesQuerySchema, "query"),
  StorageLocationController.downloadFile,
);
