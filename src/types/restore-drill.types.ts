import { z } from 'zod';

export const createRestoreDrillJobSchema = z.object({
  name: z.string().trim().min(1).max(255),
  datasource_id: z.string().uuid(),
  storage_location_id: z.string().uuid().nullable().optional(),
  schedule_cron: z.string().min(1),
  schedule_timezone: z.string().default('UTC'),
  max_backup_age_hours: z.coerce.number().int().min(1).max(24 * 365).default(168),
  run_on_manual: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export const updateRestoreDrillJobSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  datasource_id: z.string().uuid().optional(),
  storage_location_id: z.string().uuid().nullable().optional(),
  schedule_cron: z.string().min(1).optional(),
  schedule_timezone: z.string().optional(),
  max_backup_age_hours: z.coerce.number().int().min(1).max(24 * 365).optional(),
  run_on_manual: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export const listRestoreDrillJobsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
