import { Request, Response, NextFunction } from 'express';
import {
  listBackupJobs,
  createBackupJob,
  findBackupJobById,
  updateBackupJob,
  deleteBackupJob,
  runBackupJob,
} from '../models/backup-job.model';
import { getPaginationParams, buildPaginatedResponse } from '../../utils/config';
import { getScopedFilter } from '../middlewares/auth';
import { PERMISSIONS } from '../../core/auth/permissions';

export const BackupJobController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit, skip } = getPaginationParams(req.query);
      const { enabled, datasource_id, storage_location_id } = req.query as Record<string, string | undefined>;
      const scopedIds = getScopedFilter(res, PERMISSIONS.BACKUP_JOBS_READ, 'backup_job');
      const { items, total } = await listBackupJobs({ enabled, datasource_id, storage_location_id }, skip, limit, scopedIds);
      res.json(buildPaginatedResponse(items, total, page, limit));
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const job = await createBackupJob(req.body);
      res.status(201).json(job);
    } catch (err) {
      next(err);
    }
  },

  async findById(req: Request, res: Response, next: NextFunction) {
    try {
      const job = await findBackupJobById(String(req.params.id));
      res.json(job);
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const job = await updateBackupJob(String(req.params.id), req.body);
      res.json(job);
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      await deleteBackupJob(String(req.params.id));
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  async run(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await runBackupJob(String(req.params.id));
      res.status(202).json(result);
    } catch (err) {
      next(err);
    }
  },
};
