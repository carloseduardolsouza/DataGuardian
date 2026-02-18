import { Request, Response, NextFunction } from 'express';
import {
  listNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
} from '../models/notification.model';
import { getPaginationParams, buildPaginatedResponse } from '../../utils/config';

export const NotificationController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit, skip } = getPaginationParams(req.query);
      const { read, severity, type } = req.query as Record<string, string | undefined>;
      const { items, total, unreadCount } = await listNotifications({ read, severity, type }, skip, limit);
      res.json({
        ...buildPaginatedResponse(items, total, page, limit),
        unread_count: unreadCount,
      });
    } catch (err) {
      next(err);
    }
  },

  async markAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await markNotificationAsRead(req.params.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  async markAllAsRead(_req: Request, res: Response, next: NextFunction) {
    try {
      const result = await markAllNotificationsAsRead();
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      await deleteNotification(req.params.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
};
