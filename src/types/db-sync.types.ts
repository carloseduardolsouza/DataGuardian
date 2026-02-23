import { z } from 'zod';

export const syncOverwriteDirectionValues = ['source_to_target', 'target_to_source'] as const;

export const createDbSyncJobSchema = z.object({
  name: z.string().min(1).max(255),
  source_datasource_id: z.string().uuid(),
  target_datasource_id: z.string().uuid(),
  storage_location_id: z.string().uuid(),
  schedule_cron: z.string().min(1),
  schedule_timezone: z.string().default('UTC'),
  overwrite_direction: z.enum(syncOverwriteDirectionValues).optional(),
  drop_existing: z.boolean().optional(),
  run_on_manual: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export const updateDbSyncJobSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  source_datasource_id: z.string().uuid().optional(),
  target_datasource_id: z.string().uuid().optional(),
  storage_location_id: z.string().uuid().optional(),
  schedule_cron: z.string().min(1).optional(),
  schedule_timezone: z.string().optional(),
  overwrite_direction: z.enum(syncOverwriteDirectionValues).optional(),
  drop_existing: z.boolean().optional(),
  run_on_manual: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export const listDbSyncJobsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
