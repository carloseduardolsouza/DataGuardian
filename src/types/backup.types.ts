import { z } from 'zod';

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Retention Policy
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const retentionPolicySchema = z.object({
  keep_daily:   z.number().int().min(0),
  keep_weekly:  z.number().int().min(0),
  keep_monthly: z.number().int().min(0),
  auto_delete:  z.boolean(),
});

export type RetentionPolicy = z.infer<typeof retentionPolicySchema>;

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Backup Options
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const compressionValues = ['gzip', 'zstd', 'lz4', 'none'] as const;
export type CompressionType = (typeof compressionValues)[number];

export const backupOptionsSchema = z.object({
  compression:       z.enum(compressionValues),
  compression_level: z.number().int().min(1).max(9).optional(),
  parallel_jobs:     z.number().int().min(1).max(16).optional(),
  exclude_tables:    z.array(z.string()).optional(),
  include_tables:    z.array(z.string()).optional(),
  max_file_size_mb:  z.number().int().positive().optional(),
  storage_strategy:  z.enum(['replicate', 'fallback']).optional(),
  storage_targets:   z.array(
    z.object({
      storage_location_id: z.string().uuid(),
      order: z.number().int().min(1),
    }),
  ).optional(),
});

export type BackupOptions = z.infer<typeof backupOptionsSchema>;

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Schemas de Backup Job
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const createBackupJobSchema = z.object({
  name:                 z.string().min(1).max(255),
  datasource_id:        z.string().uuid(),
  storage_location_id:  z.string().uuid(),
  schedule_cron:        z.string().min(1),
  schedule_timezone:    z.string().default('UTC'),
  enabled:              z.boolean().default(true),
  retention_policy:     retentionPolicySchema,
  backup_options:       backupOptionsSchema,
});

export const updateBackupJobSchema = z.object({
  name:                z.string().min(1).max(255).optional(),
  datasource_id:       z.string().uuid().optional(),
  storage_location_id: z.string().uuid().optional(),
  schedule_cron:       z.string().min(1).optional(),
  schedule_timezone:   z.string().optional(),
  enabled:             z.boolean().optional(),
  retention_policy:    retentionPolicySchema.optional(),
  backup_options:      backupOptionsSchema.optional(),
});

export type CreateBackupJobInput = z.infer<typeof createBackupJobSchema>;
export type UpdateBackupJobInput = z.infer<typeof updateBackupJobSchema>;

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Query filters
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const executionQuerySchema = z.object({
  page:                z.coerce.number().int().min(1).default(1),
  limit:               z.coerce.number().int().min(1).max(100).default(20),
  job_id:              z.string().uuid().optional(),
  datasource_id:       z.string().uuid().optional(),
  storage_location_id: z.string().uuid().optional(),
  status:              z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']).optional(),
  from:                z.string().datetime().optional(),
  to:                  z.string().datetime().optional(),
});

export type ExecutionQuery = z.infer<typeof executionQuerySchema>;
