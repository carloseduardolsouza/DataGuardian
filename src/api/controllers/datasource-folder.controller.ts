import { Request, Response, NextFunction } from 'express';
import {
  createDatasourceFolderRecord,
  deleteDatasourceFolderRecord,
  listDatasourceFolders,
  reorderDatasourceFolders,
  updateDatasourceFolderRecord,
} from '../models/datasource-folder.model';

export const DatasourceFolderController = {
  async list(_req: Request, res: Response, next: NextFunction) {
    try {
      const folders = await listDatasourceFolders();
      res.json({ data: folders });
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const folder = await createDatasourceFolderRecord(req.body);
      res.status(201).json(folder);
    } catch (err) {
      next(err);
    }
  },

  async reorder(req: Request, res: Response, next: NextFunction) {
    try {
      const folders = await reorderDatasourceFolders(req.body);
      res.json({ data: folders });
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const folder = await updateDatasourceFolderRecord(String(req.params.id), req.body);
      res.json(folder);
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await deleteDatasourceFolderRecord(String(req.params.id));
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
};
