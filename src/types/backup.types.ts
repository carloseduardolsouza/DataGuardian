import { z } from 'zod';

// ──────────────────────────────────────────
// Retention Policy
// ──────────────────────────────────────────

export const retentionPolicySchema = z.object({
  keep_daily:   z.number().int().min(0),
  keep_weekly:  z.number().int().min(0),
  keep_monthly: z.number().int().min(0),
  auto_delete:  z.boolean(),
});

export type RetentionPolicy = z.infer<typeof retentionPolicySchema>;

// ──────────────────────────────────────────
// Backup Options
// ──────────────────────────────────────────

export const compressionValues = ['gzip', 'zstd', 'lz4', 'none'] as const;
export type CompressionType = (typeof compressionValues)[number];

export const backupOptionsSchema = z.object({
  compression:       z.enum(compressionValues),
  compression_level: z.number().int().min(1).max(9).optional(),
  parallel_jobs:     z.number().int().min(1).max(16).optional(),
  exclude_tables:    z.array(z.string()).optional(),
  include_tables:    z.array(z.string()).optional(),
  max_file_size_mb:  z.number().int().positive().optional(),
});

export type BackupOptions = z.infer<typeof backupOptionsSchema>;

// ──────────────────────────────────────────
// Schemas de Backup Job
// ──────────────────────────────────────────

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

// ──────────────────────────────────────────
// Query filters
// ──────────────────────────────────────────

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
