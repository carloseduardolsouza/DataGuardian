import { Request, Response, NextFunction } from 'express';
import {
  listExecutions,
  findExecutionById,
  cancelExecution,
} from '../models/execution.model';
import { getPaginationParams, buildPaginatedResponse } from '../../utils/config';

export const ExecutionController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit, skip } = getPaginationParams(req.query);
      const { job_id, datasource_id, storage_location_id, status, from, to } =
        req.query as Record<string, string | undefined>;
      const { items, total } = await listExecutions(
        { job_id, datasource_id, storage_location_id, status, from, to },
        skip,
        limit,
      );
      res.json(buildPaginatedResponse(items, total, page, limit));
    } catch (err) {
      next(err);
    }
  },

  async findById(req: Request, res: Response, next: NextFunction) {
    try {
      const execution = await findExecutionById(req.params.id);
      res.json(execution);
    } catch (err) {
      next(err);
    }
  },

  async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await cancelExecution(req.params.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
};
