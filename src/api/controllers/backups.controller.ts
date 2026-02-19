import { NextFunction, Request, Response } from 'express';
import {
  listBackupDatasources,
  listBackupsByDatasource,
  restoreBackupExecution,
} from '../models/backups.model';

export const BackupsController = {
  async datasources(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await listBackupDatasources();
      res.json({ data });
    } catch (err) {
      next(err);
    }
  },

  async byDatasource(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await listBackupsByDatasource(String(req.params.datasourceId));
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  async restore(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await restoreBackupExecution({
        executionId: String(req.params.executionId),
        storageLocationId: req.body?.storage_location_id,
        dropExisting: req.body?.drop_existing,
      });
      res.status(202).json(result);
    } catch (err) {
      next(err);
    }
  },
};
