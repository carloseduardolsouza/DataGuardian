import { z } from 'zod';

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Retention Policy
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const retentionPolicySchema = z.object({
  max_backups:  z.number().int().min(1).optional(),
  keep_daily:   z.number().int().min(0).optional(),
  keep_weekly:  z.number().int().min(0).optional(),
  keep_monthly: z.number().int().min(0).optional(),
  auto_delete:  z.boolean(),
}).superRefine((value, ctx) => {
  const hasMaxBackups = typeof value.max_backups === 'number';
  const hasLegacyRules = typeof value.keep_daily === 'number'
    || typeof value.keep_weekly === 'number'
    || typeof value.keep_monthly === 'number';

  if (!hasMaxBackups && !hasLegacyRules) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'retention_policy requer max_backups ou campos legados keep_*',
    });
  }
});

export type RetentionPolicy = z.infer<typeof retentionPolicySchema>;

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Backup Options
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const compressionValues = ['gzip', 'zstd', 'lz4', 'none'] as const;
export type CompressionType = (typeof compressionValues)[number];
export const backupTypeValues = ['full', 'incremental', 'differential'] as const;
export type BackupTypeValue = (typeof backupTypeValues)[number];

export const backupOptionsSchema = z.object({
  backup_type:       z.enum(backupTypeValues).optional(),
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
  referenced_files: z.object({
    enabled: z.boolean().default(false),
    discovery_query: z.string().min(1).optional(),
    path_column: z.string().min(1).max(120).optional(),
    base_directories: z.array(z.string().min(1)).optional(),
    missing_file_policy: z.enum(['warn', 'fail']).optional(),
    max_files: z.number().int().min(1).max(20000).optional(),
    source_type: z.enum(['local', 'ssh']).optional(),
    source: z.object({
      host: z.string().min(1).optional(),
      port: z.number().int().min(1).max(65535).optional(),
      username: z.string().min(1).optional(),
      password: z.string().min(1).optional(),
      private_key: z.string().min(1).optional(),
    }).optional(),
  }).optional(),
}).superRefine((value, ctx) => {
  if (!value.referenced_files?.enabled) return;

  if (!value.referenced_files.discovery_query) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['referenced_files', 'discovery_query'],
      message: 'discovery_query e obrigatorio quando referenced_files.enabled=true',
    });
  }

  if (!Array.isArray(value.referenced_files.base_directories) || value.referenced_files.base_directories.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['referenced_files', 'base_directories'],
      message: 'base_directories precisa ter ao menos um diretorio quando referenced_files.enabled=true',
    });
  }

  if (value.referenced_files.source_type === 'ssh') {
    const source = value.referenced_files.source;
    if (!source?.host || !source?.username || (!source.password && !source.private_key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['referenced_files', 'source'],
        message: 'source ssh requer host, username e password ou private_key',
      });
    }
  }
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
