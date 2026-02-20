import { Request, Response, NextFunction } from 'express';
import { listAuditLogs } from '../models/audit-log.model';

export const AuditLogController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const query = req.query as {
        page?: string;
        limit?: string;
        action?: string;
        actor?: string;
        resource_type?: string;
        from?: string;
        to?: string;
      };

      const page = Number(query.page ?? 1);
      const limit = Number(query.limit ?? 50);

      const result = await listAuditLogs({
        page,
        limit,
        action: query.action,
        actor: query.actor,
        resource_type: query.resource_type,
        from: query.from,
        to: query.to,
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
};
