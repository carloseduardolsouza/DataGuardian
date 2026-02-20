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
import { createAuditLog, extractAuditContextFromRequest } from '../models/audit-log.model';

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
      const before = await getSystemSettings();
      const settings = await updateSystemSettings(req.body);
      await createAuditLog({
        ...extractAuditContextFromRequest(req, res.locals.authUser),
        action: 'system.settings.update_many',
        resource_type: 'system_setting',
        changes: {
          keys: Object.keys(req.body ?? {}),
          before,
          after: settings,
        },
      });
      res.json(settings);
    } catch (err) {
      next(err);
    }
  },

  async createSetting(req: Request, res: Response, next: NextFunction) {
    try {
      const created = await createSystemSetting(req.body);
      await createAuditLog({
        ...extractAuditContextFromRequest(req, res.locals.authUser),
        action: 'system.settings.create',
        resource_type: 'system_setting',
        resource_id: String(req.body?.key ?? ''),
        changes: { created },
      });
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
      const before = await getSystemSettingByKey(String(req.params.key));
      const updated = await updateSystemSettingByKey(String(req.params.key), req.body);
      await createAuditLog({
        ...extractAuditContextFromRequest(req, res.locals.authUser),
        action: 'system.settings.update',
        resource_type: 'system_setting',
        resource_id: String(req.params.key),
        changes: { before, after: updated },
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },

  async deleteSettingByKey(req: Request, res: Response, next: NextFunction) {
    try {
      const before = await getSystemSettingByKey(String(req.params.key));
      await deleteSystemSettingByKey(String(req.params.key));
      await createAuditLog({
        ...extractAuditContextFromRequest(req, res.locals.authUser),
        action: 'system.settings.delete',
        resource_type: 'system_setting',
        resource_id: String(req.params.key),
        changes: { deleted: before },
      });
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
