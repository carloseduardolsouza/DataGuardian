import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validation';
import { requirePermission } from '../middlewares/auth';
import { requireCriticalApproval } from '../middlewares/critical-approval';
import { DatasourceController } from '../controllers/datasource.controller';
import { createDatasourceSchema, updateDatasourceSchema } from '../../types/datasource.types';
import { PERMISSIONS } from '../../core/auth/permissions';

export const datasourcesRouter = Router();

export const listDatasourceQuerySchema = z.object({
  page:    z.coerce.number().int().min(1).default(1),
  limit:   z.coerce.number().int().min(1).max(100).default(20),
  type:    z.enum(['postgres', 'mysql', 'mariadb', 'mongodb', 'sqlserver', 'sqlite', 'files']).optional(),
  status:  z.enum(['healthy', 'warning', 'critical', 'unknown']).optional(),
  enabled: z.enum(['true', 'false']).optional(),
  tag:     z.string().optional(),
});

const createDatasourceTableSchema = z.object({
  table_name: z.string().min(1).max(128),
  schema_name: z.string().min(1).max(128).optional(),
  if_not_exists: z.boolean().optional(),
  columns: z.array(
    z.object({
      name: z.string().min(1).max(128),
      type: z.string().min(1).max(64),
      nullable: z.boolean().optional(),
      primary_key: z.boolean().optional(),
      unique: z.boolean().optional(),
      auto_increment: z.boolean().optional(),
    }),
  ).min(1),
});

const executeDatasourceQuerySchema = z.object({
  sql: z.string().trim().min(1),
});

datasourcesRouter.get('/', requirePermission(PERMISSIONS.DATASOURCES_READ), validate(listDatasourceQuerySchema, 'query'), DatasourceController.list);
datasourcesRouter.post('/', requirePermission(PERMISSIONS.DATASOURCES_WRITE), validate(createDatasourceSchema), DatasourceController.create);
datasourcesRouter.get('/:id', requirePermission(PERMISSIONS.DATASOURCES_READ), DatasourceController.findById);
datasourcesRouter.put('/:id', requirePermission(PERMISSIONS.DATASOURCES_WRITE), validate(updateDatasourceSchema), DatasourceController.update);
datasourcesRouter.delete(
  '/:id',
  requirePermission(PERMISSIONS.DATASOURCES_WRITE),
  requireCriticalApproval({
    action: 'datasource.delete',
    actionLabel: 'Excluir datasource',
    resourceType: 'datasource',
    resolveResourceId: (req) => String(req.params.id),
  }),
  DatasourceController.remove,
);
datasourcesRouter.post('/:id/test', requirePermission(PERMISSIONS.DATASOURCES_QUERY), DatasourceController.testConnection);
datasourcesRouter.get('/:id/schema', requirePermission(PERMISSIONS.DATASOURCES_READ), DatasourceController.getSchema);
datasourcesRouter.post('/:id/query', requirePermission(PERMISSIONS.DATASOURCES_QUERY), validate(executeDatasourceQuerySchema), DatasourceController.executeQuery);
datasourcesRouter.post('/:id/tables', requirePermission(PERMISSIONS.DATASOURCES_QUERY), validate(createDatasourceTableSchema), DatasourceController.createTable);
