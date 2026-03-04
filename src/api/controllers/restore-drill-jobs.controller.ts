import { Request, Response, NextFunction } from 'express';
import { buildPaginatedResponse, getPaginationParams } from '../../utils/config';
import { getScopedFilter } from '../middlewares/auth';
import { PERMISSIONS } from '../../core/auth/permissions';
import {
  createRestoreDrillJob,
  deleteRestoreDrillJob,
  findRestoreDrillJobById,
  listRestoreDrillExecutions,
  listRestoreDrillJobs,
  runRestoreDrillJobNow,
  updateRestoreDrillJob,
} from '../models/restore-drill-job.model';

export const RestoreDrillJobsController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit, skip } = getPaginationParams(req.query);
      const scopedIds = getScopedFilter(res, PERMISSIONS.RESTORE_DRILL_JOBS_READ, 'restore_drill_job');
      const { items, total } = await listRestoreDrillJobs(skip, limit, scopedIds);
      res.json(buildPaginatedResponse(items, total, page, limit));
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const created = await createRestoreDrillJob(req.body);
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  },

  async findById(req: Request, res: Response, next: NextFunction) {
    try {
      const job = await findRestoreDrillJobById(String(req.params.id));
      res.json(job);
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const updated = await updateRestoreDrillJob(String(req.params.id), req.body);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      await deleteRestoreDrillJob(String(req.params.id));
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  async runNow(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await runRestoreDrillJobNow(String(req.params.id));
      res.status(202).json(result);
    } catch (err) {
      next(err);
    }
  },

  async executions(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await listRestoreDrillExecutions(String(req.params.id), 30);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  },
};
