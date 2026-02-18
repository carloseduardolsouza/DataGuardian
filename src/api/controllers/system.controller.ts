import { Request, Response, NextFunction } from 'express';
import {
  getSystemSettings,
  updateSystemSettings,
  testSmtpConnection,
} from '../models/system.model';

export const SystemController = {
  async getSettings(_req: Request, res: Response, next: NextFunction) {
    try {
      const settings = await getSystemSettings();
      res.json(settings);
    } catch (err) {
      next(err);
    }
  },

  async updateSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const settings = await updateSystemSettings(req.body);
      res.json(settings);
    } catch (err) {
      next(err);
    }
  },

  async testSmtp(_req: Request, res: Response, next: NextFunction) {
    try {
      const result = await testSmtpConnection();
      res.status(result.status).json(result.body);
    } catch (err) {
      next(err);
    }
  },
};
