import { Request, Response, NextFunction } from 'express';
import {
  listExecutions,
  findExecutionById,
  getExecutionLogs,
  cancelExecution,
  deleteExecution,
  retryExecutionUpload,
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
      const execution = await findExecutionById(String(req.params.id));
      res.json(execution);
    } catch (err) {
      next(err);
    }
  },

  async logs(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await getExecutionLogs(String(req.params.id));
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await cancelExecution(String(req.params.id));
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      await deleteExecution(String(req.params.id));
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  async retryUpload(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await retryExecutionUpload(String(req.params.id));
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
};
