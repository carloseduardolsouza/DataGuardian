import { Router } from "express";
import { z } from "zod";
import { validate } from "../middlewares/validation";
import { requirePermission, requireScopedPermission } from "../middlewares/auth";
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
  requireScopedPermission(PERMISSIONS.STORAGE_READ, { resource_type: 'storage_location' }),
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
storageLocationsRouter.get(
  "/:id",
  requireScopedPermission(PERMISSIONS.STORAGE_READ, (req) => ({ resource_type: 'storage_location', resource_id: String(req.params.id) })),
  StorageLocationController.findById,
);
storageLocationsRouter.put(
  "/:id",
  requireScopedPermission(PERMISSIONS.STORAGE_WRITE, (req) => ({ resource_type: 'storage_location', resource_id: String(req.params.id) })),
  validate(updateStorageLocationSchema),
  StorageLocationController.update,
);
storageLocationsRouter.delete(
  "/:id",
  requireScopedPermission(PERMISSIONS.STORAGE_WRITE, (req) => ({ resource_type: 'storage_location', resource_id: String(req.params.id) })),
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
  requireScopedPermission(PERMISSIONS.STORAGE_WRITE, (req) => ({ resource_type: 'storage_location', resource_id: String(req.params.id) })),
  StorageLocationController.testConnection,
);
storageLocationsRouter.get(
  "/:id/files",
  requireScopedPermission(PERMISSIONS.STORAGE_READ, (req) => ({ resource_type: 'storage_location', resource_id: String(req.params.id) })),
  validate(browseFilesQuerySchema, "query"),
  StorageLocationController.browseFiles,
);
storageLocationsRouter.delete(
  "/:id/files",
  requireScopedPermission(PERMISSIONS.STORAGE_WRITE, (req) => ({ resource_type: 'storage_location', resource_id: String(req.params.id) })),
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
  requireScopedPermission(PERMISSIONS.STORAGE_WRITE, (req) => ({ resource_type: 'storage_location', resource_id: String(req.params.id) })),
  validate(copyFileSchema),
  StorageLocationController.copyFile,
);
storageLocationsRouter.get(
  "/:id/files/download",
  requireScopedPermission(PERMISSIONS.STORAGE_DOWNLOAD, (req) => ({ resource_type: 'storage_location', resource_id: String(req.params.id) })),
  validate(browseFilesQuerySchema, "query"),
  StorageLocationController.downloadFile,
);
