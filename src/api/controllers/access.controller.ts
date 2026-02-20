import { Request, Response, NextFunction } from 'express';
import {
  createAccessRole,
  createAccessUser,
  deleteAccessRole,
  deleteAccessUser,
  listAccessPermissions,
  listAccessRoles,
  listAccessUsers,
  updateAccessRole,
  updateAccessUser,
  updateAccessUserPassword,
} from '../models/access.model';

export const AccessController = {
  async permissions(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await listAccessPermissions();
      res.json({ data });
    } catch (err) {
      next(err);
    }
  },

  async roles(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await listAccessRoles();
      res.json({ data });
    } catch (err) {
      next(err);
    }
  },

  async createRole(req: Request, res: Response, next: NextFunction) {
    try {
      const created = await createAccessRole(req.body);
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  },

  async updateRole(req: Request, res: Response, next: NextFunction) {
    try {
      const updated = await updateAccessRole(String(req.params.id), req.body);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },

  async deleteRole(req: Request, res: Response, next: NextFunction) {
    try {
      await deleteAccessRole(String(req.params.id));
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  async users(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await listAccessUsers();
      res.json({ data });
    } catch (err) {
      next(err);
    }
  },

  async createUser(req: Request, res: Response, next: NextFunction) {
    try {
      const created = await createAccessUser(req.body);
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  },

  async updateUser(req: Request, res: Response, next: NextFunction) {
    try {
      const updated = await updateAccessUser(String(req.params.id), req.body);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },

  async updateUserPassword(req: Request, res: Response, next: NextFunction) {
    try {
      await updateAccessUserPassword(String(req.params.id), String(req.body.password));
      res.json({ message: 'Senha atualizada com sucesso' });
    } catch (err) {
      next(err);
    }
  },

  async deleteUser(req: Request, res: Response, next: NextFunction) {
    try {
      const actorId = String(res.locals.authUser?.id ?? '');
      await deleteAccessUser(String(req.params.id), actorId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
};
