import { Prisma, DatasourceType, StorageLocationType, BackupType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../middlewares/error-handler';
import { validateCron } from '../../core/scheduler/cron-parser';
import { calculateNextExecution } from '../../core/scheduler/job-scheduler';
import { resolveBackupTypeFromOptions, withNormalizedBackupType } from '../../core/backup/backup-type';
import { logger } from '../../utils/logger';
import { triggerBackupExecutionNow } from '../../workers/backup-worker';
import { deleteBackupExecutionsWithArtifacts } from '../../core/retention/cleanup-manager';

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
// Formatter
// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

export function formatJob(job: {
  id: string;
  name: string;
  datasourceId: string;
  storageLocationId: string;
  scheduleCron: string;
  scheduleTimezone: string;
  enabled: boolean;
  retentionPolicy: Prisma.JsonValue;
  backupOptions: Prisma.JsonValue;
  lastExecutionAt: Date | null;
  nextExecutionAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  datasource?: { id: string; name: string; type: DatasourceType } | null;
  storageLocation?: { id: string; name: string; type: StorageLocationType } | null;
  backupExecutions?: Array<{
    status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
    startedAt: Date | null;
    finishedAt: Date | null;
    sizeBytes: bigint | null;
    durationSeconds: number | null;
  }>;
}) {
  const backupOptions = (job.backupOptions ?? {}) as Record<string, unknown>;
  const rawTargets = Array.isArray(backupOptions.storage_targets)
    ? backupOptions.storage_targets as Array<Record<string, unknown>>
    : [];
  const normalizedTargets = rawTargets
    .map((t) => ({
      storage_location_id: String(t.storage_location_id ?? ''),
      order: Number(t.order ?? 0),
    }))
    .filter((t) => t.storage_location_id && Number.isFinite(t.order) && t.order > 0)
    .sort((a, b) => a.order - b.order);

  const storageTargets = normalizedTargets.length > 0
    ? normalizedTargets
    : [{ storage_location_id: job.storageLocationId, order: 1 }];

  const storageStrategy = backupOptions.storage_strategy === 'replicate' ? 'replicate' : 'fallback';

  const latest = job.backupExecutions?.[0] ?? null;
  return {
    id:                  job.id,
    name:                job.name,
    datasource_id:       job.datasourceId,
    storage_location_id: job.storageLocationId,
    schedule_cron:       job.scheduleCron,
    schedule_timezone:   job.scheduleTimezone,
    enabled:             job.enabled,
    retention_policy:    job.retentionPolicy,
    backup_options:      backupOptions,
    storage_targets:     storageTargets,
    storage_strategy:    storageStrategy,
    last_execution_at:   job.lastExecutionAt?.toISOString() ?? null,
    next_execution_at:   job.nextExecutionAt?.toISOString() ?? null,
    created_at:          job.createdAt.toISOString(),
    updated_at:          job.updatedAt.toISOString(),
    ...(job.datasource && {
      datasource: { id: job.datasource.id, name: job.datasource.name, type: job.datasource.type },
    }),
    ...(job.storageLocation && {
      storage_location: { id: job.storageLocation.id, name: job.storageLocation.name, type: job.storageLocation.type },
    }),
    ...(latest && {
      last_execution: {
        status: latest.status,
        started_at: latest.startedAt?.toISOString() ?? null,
        finished_at: latest.finishedAt?.toISOString() ?? null,
        size_bytes: latest.sizeBytes ? Number(latest.sizeBytes) : null,
        duration_seconds: latest.durationSeconds,
      },
    }),
  };
}

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
// Query types
// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

export interface ListBackupJobsFilters {
  enabled?:             string;
  datasource_id?:       string;
  storage_location_id?: string;
}

export interface CreateBackupJobData {
  name:                string;
  datasource_id:       string;
  storage_location_id: string;
  schedule_cron:       string;
  schedule_timezone?:  string;
  enabled:             boolean;
  retention_policy:    Prisma.InputJsonValue;
  backup_options:      Prisma.InputJsonValue;
}

export interface UpdateBackupJobData {
  name?:                string;
  datasource_id?:       string;
  storage_location_id?: string;
  schedule_cron?:       string;
  schedule_timezone?:   string;
  enabled?:             boolean;
  retention_policy?:    Prisma.InputJsonValue;
  backup_options?:      Prisma.InputJsonValue;
}

const jobInclude = {
  datasource:      { select: { id: true, name: true, type: true } },
  storageLocation: { select: { id: true, name: true, type: true } },
  backupExecutions: {
    take: 1,
    orderBy: { createdAt: 'desc' as const },
    select: {
      status: true,
      startedAt: true,
      finishedAt: true,
      sizeBytes: true,
      durationSeconds: true,
    },
  },
} as const;

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
// Model functions
// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

export async function listBackupJobs(
  filters: ListBackupJobsFilters,
  skip: number,
  limit: number,
) {
  const where: Prisma.BackupJobWhereInput = {};
  if (filters.enabled             !== undefined) where.enabled             = filters.enabled === 'true';
  if (filters.datasource_id)       where.datasourceId       = filters.datasource_id;
  if (filters.storage_location_id) where.storageLocationId = filters.storage_location_id;

  const [items, total] = await Promise.all([
    prisma.backupJob.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: jobInclude,
    }),
    prisma.backupJob.count({ where }),
  ]);

  return { items: items.map(formatJob), total };
}

export async function createBackupJob(data: CreateBackupJobData) {
  validateCron(data.schedule_cron);

  const backupOptions = (data.backup_options ?? {}) as Record<string, unknown>;
  const strategy = backupOptions.storage_strategy === 'replicate' ? 'replicate' : 'fallback';
  const rawTargets = Array.isArray(backupOptions.storage_targets)
    ? backupOptions.storage_targets as Array<Record<string, unknown>>
    : [];
  const normalizedTargets = rawTargets
    .map((t) => ({
      storage_location_id: String(t.storage_location_id ?? ''),
      order: Number(t.order ?? 0),
    }))
    .filter((t) => t.storage_location_id && Number.isFinite(t.order) && t.order > 0)
    .sort((a, b) => a.order - b.order);

  const storageTargets = normalizedTargets.length > 0
    ? normalizedTargets
    : [{ storage_location_id: data.storage_location_id, order: 1 }];

  const primaryStorageId = storageTargets[0].storage_location_id;

  const [datasource, storageLocation] = await Promise.all([
    prisma.datasource.findUnique({ where: { id: data.datasource_id } }),
    prisma.storageLocation.findUnique({ where: { id: primaryStorageId } }),
  ]);

  if (!datasource) {
    throw new AppError('NOT_FOUND', 404, `Datasource '${data.datasource_id}' nÃƒÆ’Ã‚Â£o encontrado`);
  }
  if (!storageLocation) {
    throw new AppError('NOT_FOUND', 404, `Storage location '${primaryStorageId}' nÃƒÆ’Ã‚Â£o encontrado`);
  }

  if (storageTargets.length > 1) {
    const uniqueIds = [...new Set(storageTargets.map((t) => t.storage_location_id))];
    const count = await prisma.storageLocation.count({ where: { id: { in: uniqueIds } } });
    if (count !== uniqueIds.length) {
      throw new AppError('NOT_FOUND', 404, 'Um ou mais storage targets nÃƒÆ’Ã‚Â£o foram encontrados');
    }
  }

  const nextExecutionAt = calculateNextExecution(data.schedule_cron, data.schedule_timezone ?? 'UTC');

  const job = await prisma.backupJob.create({
    data: {
      name:              data.name,
      datasourceId:      data.datasource_id,
      storageLocationId: primaryStorageId,
      scheduleCron:      data.schedule_cron,
      scheduleTimezone:  data.schedule_timezone ?? 'UTC',
      enabled:           data.enabled,
      retentionPolicy:   data.retention_policy,
      backupOptions: withNormalizedBackupType({
        ...backupOptions,
        storage_strategy: strategy,
        storage_targets: storageTargets,
      }),
      nextExecutionAt,
    },
    include: jobInclude,
  });

  return formatJob(job);
}

export async function findBackupJobById(id: string) {
  const job = await prisma.backupJob.findUniqueOrThrow({
    where: { id },
    include: jobInclude,
  });
  return formatJob(job);
}

export async function updateBackupJob(id: string, data: UpdateBackupJobData) {
  const current = await prisma.backupJob.findUniqueOrThrow({ where: { id } });

  if (data.schedule_cron) validateCron(data.schedule_cron);

  const newCron     = data.schedule_cron     ?? current.scheduleCron;
  const newTimezone = data.schedule_timezone ?? current.scheduleTimezone;
  const needsRecalculate = data.schedule_cron || data.schedule_timezone;
  const nextExecutionAt  = needsRecalculate
    ? calculateNextExecution(newCron, newTimezone)
    : undefined;

  if (data.datasource_id) {
    const ds = await prisma.datasource.findUnique({ where: { id: data.datasource_id } });
    if (!ds) throw new AppError('NOT_FOUND', 404, `Datasource '${data.datasource_id}' nÃƒÆ’Ã‚Â£o encontrado`);
  }

  const currentBackupOptions = (current.backupOptions ?? {}) as Record<string, unknown>;
  const patchBackupOptions = (data.backup_options ?? {}) as Record<string, unknown>;
  const mergedBackupOptions = { ...currentBackupOptions, ...patchBackupOptions };

  const rawTargets = Array.isArray(mergedBackupOptions.storage_targets)
    ? mergedBackupOptions.storage_targets as Array<Record<string, unknown>>
    : [];
  const normalizedTargets = rawTargets
    .map((t) => ({
      storage_location_id: String(t.storage_location_id ?? ''),
      order: Number(t.order ?? 0),
    }))
    .filter((t) => t.storage_location_id && Number.isFinite(t.order) && t.order > 0)
    .sort((a, b) => a.order - b.order);

  const computedTargets = normalizedTargets.length > 0
    ? normalizedTargets
    : [{ storage_location_id: data.storage_location_id ?? current.storageLocationId, order: 1 }];

  const primaryStorageId = data.storage_location_id ?? computedTargets[0].storage_location_id;

  const uniqueStorageIds = [...new Set(computedTargets.map((t) => t.storage_location_id))];
  const storageCount = await prisma.storageLocation.count({ where: { id: { in: uniqueStorageIds } } });
  if (storageCount !== uniqueStorageIds.length) {
    throw new AppError('NOT_FOUND', 404, 'Um ou mais storage targets nÃƒÆ’Ã‚Â£o foram encontrados');
  }

  const updated = await prisma.backupJob.update({
    where: { id },
    data: {
      ...(data.name                !== undefined && { name: data.name }),
      ...(data.datasource_id       !== undefined && { datasourceId: data.datasource_id }),
      ...(primaryStorageId !== undefined && { storageLocationId: primaryStorageId }),
      ...(data.schedule_cron       !== undefined && { scheduleCron: data.schedule_cron }),
      ...(data.schedule_timezone   !== undefined && { scheduleTimezone: data.schedule_timezone }),
      ...(data.enabled             !== undefined && { enabled: data.enabled }),
      ...(data.retention_policy    !== undefined && { retentionPolicy: data.retention_policy }),
      ...((data.backup_options !== undefined || data.storage_location_id !== undefined) && {
        backupOptions: {
          ...mergedBackupOptions,
          storage_strategy: mergedBackupOptions.storage_strategy === 'replicate' ? 'replicate' : 'fallback',
          storage_targets: computedTargets,
          backup_type: resolveBackupTypeFromOptions(mergedBackupOptions),
        },
      }),
      ...(nextExecutionAt          !== undefined && { nextExecutionAt }),
    },
    include: jobInclude,
  });

  return formatJob(updated);
}

export async function deleteBackupJob(id: string) {
  await prisma.backupJob.findUniqueOrThrow({ where: { id } });
  const executions = await prisma.backupExecution.findMany({
    where: { jobId: id },
    select: { id: true },
  });
  await deleteBackupExecutionsWithArtifacts(executions.map((execution) => execution.id));
  await prisma.backupJob.delete({ where: { id } });
}

export async function runBackupJob(id: string) {
  const job = await prisma.backupJob.findUniqueOrThrow({ where: { id } });
  const backupType = resolveBackupTypeFromOptions(job.backupOptions) as BackupType;

  const execution = await prisma.backupExecution.create({
    data: {
      jobId:             job.id,
      datasourceId:      job.datasourceId,
      storageLocationId: job.storageLocationId,
      status:            'queued',
      backupType,
      metadata: {
        enqueue_source: 'manual_direct',
        execution_logs: [
          {
            ts: new Date().toISOString(),
            level: 'info',
            message: 'Execucao manual solicitada. Processamento iniciado imediatamente, sem enfileiramento.',
          },
        ],
      } as Prisma.InputJsonValue,
    },
  });

  void triggerBackupExecutionNow(execution.id).catch((err) => {
    logger.error({ err, executionId: execution.id, jobId: job.id }, 'Falha ao iniciar backup manual imediato');
  });

  return {
    execution_id: execution.id,
    message:      'Backup manual iniciado para execucao imediata',
    status:       'running',
  };
}
