import { Router } from 'express';
import { z } from 'zod';
import { BackupsController } from '../controllers/backups.controller';
import { validate } from '../middlewares/validation';

export const backupsRouter = Router();

const restoreBodySchema = z.object({
  storage_location_id: z.string().uuid().optional(),
  drop_existing: z.boolean().optional(),
});

backupsRouter.get('/datasources', BackupsController.datasources);
backupsRouter.get('/datasources/:datasourceId', BackupsController.byDatasource);
backupsRouter.post(
  '/:executionId/restore',
  validate(restoreBodySchema),
  BackupsController.restore,
);
