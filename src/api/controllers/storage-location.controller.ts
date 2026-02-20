import { Request, Response, NextFunction } from 'express';
import {
  listStorageLocations,
  createStorageLocation,
  findStorageLocationById,
  updateStorageLocation,
  deleteStorageLocation,
  testStorageConnection,
  testStorageConfig,
  browseStorageFiles,
  deleteStorageFilePath,
  copyStoragePath,
} from '../models/storage-location.model';
import { getPaginationParams, buildPaginatedResponse } from '../../utils/config';

export const StorageLocationController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit, skip } = getPaginationParams(req.query);
      const { type, status } = req.query as Record<string, string | undefined>;
      const { items, total } = await listStorageLocations({ type, status }, skip, limit);
      res.json(buildPaginatedResponse(items, total, page, limit));
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const storageLocation = await createStorageLocation(req.body);
      res.status(201).json(storageLocation);
    } catch (err) {
      next(err);
    }
  },

  async findById(req: Request, res: Response, next: NextFunction) {
    try {
      const storageLocation = await findStorageLocationById(String(req.params.id));
      res.json(storageLocation);
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const storageLocation = await updateStorageLocation(String(req.params.id), req.body);
      res.json(storageLocation);
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      await deleteStorageLocation(String(req.params.id));
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  async testConnection(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await testStorageConnection(String(req.params.id));
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async testConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const type = String(req.body.type) as Parameters<typeof testStorageConfig>[0];
      const config = (req.body.config ?? {}) as Parameters<typeof testStorageConfig>[1];
      const result = await testStorageConfig(type, config);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async browseFiles(req: Request, res: Response, next: NextFunction) {
    try {
      const path = typeof req.query.path === 'string' ? req.query.path : '';
      const result = await browseStorageFiles(String(req.params.id), path);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async deleteFile(req: Request, res: Response, next: NextFunction) {
    try {
      const targetPath = typeof req.query.path === 'string' ? req.query.path : '';
      const result = await deleteStorageFilePath(String(req.params.id), targetPath);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async copyFile(req: Request, res: Response, next: NextFunction) {
    try {
      const sourcePath = String(req.body.source_path ?? '');
      const destinationPath = String(req.body.destination_path ?? '');
      const result = await copyStoragePath(String(req.params.id), {
        source_path: sourcePath,
        destination_path: destinationPath,
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
};
