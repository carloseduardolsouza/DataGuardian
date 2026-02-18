import { Request, Response, NextFunction } from 'express';
import {
  listDatasources,
  createDatasource,
  findDatasourceById,
  updateDatasource,
  deleteDatasource,
  testDatasourceConnection,
} from '../models/datasource.model';
import { getPaginationParams, buildPaginatedResponse } from '../../utils/config';

export const DatasourceController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit, skip } = getPaginationParams(req.query);
      const { type, status, enabled, tag } = req.query as Record<string, string | undefined>;
      const { items, total } = await listDatasources({ type, status, enabled, tag }, skip, limit);
      res.json(buildPaginatedResponse(items, total, page, limit));
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const datasource = await createDatasource(req.body);
      res.status(201).json(datasource);
    } catch (err) {
      next(err);
    }
  },

  async findById(req: Request, res: Response, next: NextFunction) {
    try {
      const datasource = await findDatasourceById(req.params.id);
      res.json(datasource);
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const datasource = await updateDatasource(req.params.id, req.body);
      res.json(datasource);
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      await deleteDatasource(req.params.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  async testConnection(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await testDatasourceConnection(req.params.id);
      res.status(501).json(result);
    } catch (err) {
      next(err);
    }
  },
};
