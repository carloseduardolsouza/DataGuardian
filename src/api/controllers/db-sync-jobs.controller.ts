import { Request, Response, NextFunction } from 'express';
import { buildPaginatedResponse, getPaginationParams } from '../../utils/config';
import {
  createDbSyncJob,
  deleteDbSyncJob,
  findDbSyncJobById,
  listDbSyncExecutions,
  listDbSyncJobs,
  runDbSyncJobNow,
  updateDbSyncJob,
} from '../models/db-sync-job.model';

export const DbSyncJobsController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit, skip } = getPaginationParams(req.query);
      const { items, total } = await listDbSyncJobs(skip, limit);
      res.json(buildPaginatedResponse(items, total, page, limit));
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const created = await createDbSyncJob(req.body);
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  },

  async findById(req: Request, res: Response, next: NextFunction) {
    try {
      const job = await findDbSyncJobById(String(req.params.id));
      res.json(job);
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const updated = await updateDbSyncJob(String(req.params.id), req.body);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      await deleteDbSyncJob(String(req.params.id));
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  async runNow(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await runDbSyncJobNow(String(req.params.id));
      res.status(202).json(result);
    } catch (err) {
      next(err);
    }
  },

  async executions(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await listDbSyncExecutions(String(req.params.id), 30);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  },
};
