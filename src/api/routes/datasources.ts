import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validation';
import { DatasourceController } from '../controllers/datasource.controller';
import { createDatasourceSchema, updateDatasourceSchema } from '../../types/datasource.types';

export const datasourcesRouter = Router();

export const listDatasourceQuerySchema = z.object({
  page:    z.coerce.number().int().min(1).default(1),
  limit:   z.coerce.number().int().min(1).max(100).default(20),
  type:    z.enum(['postgres', 'mysql', 'mariadb', 'mongodb', 'sqlserver', 'sqlite', 'files']).optional(),
  status:  z.enum(['healthy', 'warning', 'critical', 'unknown']).optional(),
  enabled: z.enum(['true', 'false']).optional(),
  tag:     z.string().optional(),
});

datasourcesRouter.get('/',          validate(listDatasourceQuerySchema, 'query'), DatasourceController.list);
datasourcesRouter.post('/',         validate(createDatasourceSchema),             DatasourceController.create);
datasourcesRouter.get('/:id',                                                     DatasourceController.findById);
datasourcesRouter.put('/:id',       validate(updateDatasourceSchema),             DatasourceController.update);
datasourcesRouter.delete('/:id',                                                  DatasourceController.remove);
datasourcesRouter.post('/:id/test',                                               DatasourceController.testConnection);
datasourcesRouter.get('/:id/schema',                                              DatasourceController.getSchema);
datasourcesRouter.post('/:id/query',                                              DatasourceController.executeQuery);
