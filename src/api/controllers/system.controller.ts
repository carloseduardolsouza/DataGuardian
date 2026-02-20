import { Request, Response, NextFunction } from 'express';
import {
  getSystemSettings,
  getSystemSettingByKey,
  createSystemSetting,
  updateSystemSettings,
  updateSystemSettingByKey,
  deleteSystemSettingByKey,
  testSmtpConnection,
  getWhatsappEvolutionQrCode,
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

  async createSetting(req: Request, res: Response, next: NextFunction) {
    try {
      const created = await createSystemSetting(req.body);
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  },

  async getSettingByKey(req: Request, res: Response, next: NextFunction) {
    try {
      const setting = await getSystemSettingByKey(String(req.params.key));
      res.json(setting);
    } catch (err) {
      next(err);
    }
  },

  async updateSettingByKey(req: Request, res: Response, next: NextFunction) {
    try {
      const updated = await updateSystemSettingByKey(String(req.params.key), req.body);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },

  async deleteSettingByKey(req: Request, res: Response, next: NextFunction) {
    try {
      await deleteSystemSettingByKey(String(req.params.key));
      res.status(204).send();
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

  async getWhatsappQrCode(req: Request, res: Response, next: NextFunction) {
    try {
      const instance = typeof req.body?.instance === 'string' ? req.body.instance : undefined;
      const result = await getWhatsappEvolutionQrCode(instance);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
};
