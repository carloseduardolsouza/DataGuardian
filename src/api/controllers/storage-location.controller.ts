import { Request, Response, NextFunction } from 'express';
import {
  listStorageLocations,
  createStorageLocation,
  findStorageLocationById,
  updateStorageLocation,
  deleteStorageLocation,
  testStorageConnection,
  testStorageConfig,
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
};
