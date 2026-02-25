import { Request, Response, NextFunction } from 'express';
import {
  getSystemHealth,
  getDatasourceHealthHistory,
  getStorageHealthHistory,
} from '../models/health.model';

export const HealthController = {
  async getSystemStatus(_req: Request, res: Response, next: NextFunction) {
    try {
      const health = await getSystemHealth();
      // The UI consumes this endpoint even when dependencies are degraded.
      // Keep HTTP 200 and expose readiness via payload.status.
      res.status(200).json(health);
    } catch (err) {
      next(err);
    }
  },

  async getDatasourceHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const { datasource_id, from, to } = req.query as Record<string, string | undefined>;
      const page  = Math.max(1, parseInt(String(req.query.page  ?? '1'),  10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
      const skip  = (page - 1) * limit;

      const result = await getDatasourceHealthHistory({ datasource_id, from, to }, skip, limit);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  async getStorageHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const { storage_location_id, from, to } = req.query as Record<string, string | undefined>;
      const page  = Math.max(1, parseInt(String(req.query.page  ?? '1'),  10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
      const skip  = (page - 1) * limit;

      const result = await getStorageHealthHistory({ storage_location_id, from, to }, skip, limit);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
};
