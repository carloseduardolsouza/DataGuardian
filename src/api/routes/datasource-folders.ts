import { Router } from 'express';
import { z } from 'zod';
import { DatasourceFolderController } from '../controllers/datasource-folder.controller';
import { requirePermission } from '../middlewares/auth';
import { validate } from '../middlewares/validation';
import { PERMISSIONS } from '../../core/auth/permissions';

export const datasourceFoldersRouter = Router();

const createDatasourceFolderSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

const idParamSchema = z.object({
  id: z.string().uuid(),
});

const reorderDatasourceFoldersSchema = z.object({
  ordered_ids: z.array(z.string().uuid()).min(1),
});

datasourceFoldersRouter.get(
  '/',
  requirePermission(PERMISSIONS.DATASOURCES_READ),
  DatasourceFolderController.list,
);

datasourceFoldersRouter.post(
  '/',
  requirePermission(PERMISSIONS.DATASOURCES_WRITE),
  validate(createDatasourceFolderSchema),
  DatasourceFolderController.create,
);

datasourceFoldersRouter.put(
  '/reorder',
  requirePermission(PERMISSIONS.DATASOURCES_WRITE),
  validate(reorderDatasourceFoldersSchema),
  DatasourceFolderController.reorder,
);

datasourceFoldersRouter.put(
  '/:id',
  requirePermission(PERMISSIONS.DATASOURCES_WRITE),
  validate(idParamSchema, 'params'),
  validate(createDatasourceFolderSchema),
  DatasourceFolderController.update,
);

datasourceFoldersRouter.delete(
  '/:id',
  requirePermission(PERMISSIONS.DATASOURCES_WRITE),
  validate(idParamSchema, 'params'),
  DatasourceFolderController.remove,
);
