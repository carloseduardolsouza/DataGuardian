import { Request, Response, NextFunction } from 'express';
import {
  listDatasources,
  createDatasource,
  findDatasourceById,
  updateDatasource,
  deleteDatasource,
  testDatasourceConnection,
  getDatasourceSchema,
  executeDatasourceQuery,
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
      const datasource = await findDatasourceById(String(req.params.id));
      res.json(datasource);
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const datasource = await updateDatasource(String(req.params.id), req.body);
      res.json(datasource);
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      await deleteDatasource(String(req.params.id));
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  async testConnection(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await testDatasourceConnection(String(req.params.id));
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  async getSchema(req: Request, res: Response, next: NextFunction) {
    try {
      const schemas = await getDatasourceSchema(String(req.params.id));
      res.json(schemas);
    } catch (err) {
      next(err);
    }
  },

  async executeQuery(req: Request, res: Response, next: NextFunction) {
    try {
      const { sql } = req.body as { sql: string };
      if (!sql || !String(sql).trim()) {
        res.status(400).json({ message: 'O campo "sql" é obrigatório.' });
        return;
      }
      const result = await executeDatasourceQuery(String(req.params.id), String(sql));
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
};
