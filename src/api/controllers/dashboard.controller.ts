import { Request, Response, NextFunction } from 'express';
import { getDashboardOverview } from '../models/dashboard.model';

export const DashboardController = {
  async overview(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getDashboardOverview();
      res.json(data);
    } catch (err) {
      next(err);
    }
  },
};
