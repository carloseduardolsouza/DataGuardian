import { Prisma, DatasourceType, StorageLocationType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../middlewares/error-handler';
import { validateCron } from '../../core/scheduler/cron-parser';
import { calculateNextExecution } from '../../core/scheduler/job-scheduler';

// ──────────────────────────────────────────
// Formatter
// ──────────────────────────────────────────

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
}) {
  return {
    id:                  job.id,
    name:                job.name,
    datasource_id:       job.datasourceId,
    storage_location_id: job.storageLocationId,
    schedule_cron:       job.scheduleCron,
    schedule_timezone:   job.scheduleTimezone,
    enabled:             job.enabled,
    retention_policy:    job.retentionPolicy,
    backup_options:      job.backupOptions,
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
  };
}

// ──────────────────────────────────────────
// Query types
// ──────────────────────────────────────────

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
} as const;

// ──────────────────────────────────────────
// Model functions
// ──────────────────────────────────────────

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

  const [datasource, storageLocation] = await Promise.all([
    prisma.datasource.findUnique({ where: { id: data.datasource_id } }),
    prisma.storageLocation.findUnique({ where: { id: data.storage_location_id } }),
  ]);

  if (!datasource) {
    throw new AppError('NOT_FOUND', 404, `Datasource '${data.datasource_id}' não encontrado`);
  }
  if (!storageLocation) {
    throw new AppError('NOT_FOUND', 404, `Storage location '${data.storage_location_id}' não encontrado`);
  }

  const nextExecutionAt = calculateNextExecution(data.schedule_cron, data.schedule_timezone ?? 'UTC');

  const job = await prisma.backupJob.create({
    data: {
      name:              data.name,
      datasourceId:      data.datasource_id,
      storageLocationId: data.storage_location_id,
      scheduleCron:      data.schedule_cron,
      scheduleTimezone:  data.schedule_timezone ?? 'UTC',
      enabled:           data.enabled,
      retentionPolicy:   data.retention_policy,
      backupOptions:     data.backup_options,
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
    if (!ds) throw new AppError('NOT_FOUND', 404, `Datasource '${data.datasource_id}' não encontrado`);
  }

  if (data.storage_location_id) {
    const sl = await prisma.storageLocation.findUnique({ where: { id: data.storage_location_id } });
    if (!sl) throw new AppError('NOT_FOUND', 404, `Storage location '${data.storage_location_id}' não encontrado`);
  }

  const updated = await prisma.backupJob.update({
    where: { id },
    data: {
      ...(data.name                !== undefined && { name: data.name }),
      ...(data.datasource_id       !== undefined && { datasourceId: data.datasource_id }),
      ...(data.storage_location_id !== undefined && { storageLocationId: data.storage_location_id }),
      ...(data.schedule_cron       !== undefined && { scheduleCron: data.schedule_cron }),
      ...(data.schedule_timezone   !== undefined && { scheduleTimezone: data.schedule_timezone }),
      ...(data.enabled             !== undefined && { enabled: data.enabled }),
      ...(data.retention_policy    !== undefined && { retentionPolicy: data.retention_policy }),
      ...(data.backup_options      !== undefined && { backupOptions: data.backup_options }),
      ...(nextExecutionAt          !== undefined && { nextExecutionAt }),
    },
    include: jobInclude,
  });

  return formatJob(updated);
}

export async function deleteBackupJob(id: string) {
  await prisma.backupJob.findUniqueOrThrow({ where: { id } });
  await prisma.backupJob.delete({ where: { id } });
}

export async function runBackupJob(id: string) {
  const job = await prisma.backupJob.findUniqueOrThrow({ where: { id } });

  if (!job.enabled) {
    throw new AppError('JOB_DISABLED', 400, 'Este backup job está desabilitado. Habilite-o antes de executar.');
  }

  const execution = await prisma.backupExecution.create({
    data: {
      jobId:             job.id,
      datasourceId:      job.datasourceId,
      storageLocationId: job.storageLocationId,
      status:            'queued',
      backupType:        'full',
    },
  });

  // TODO: Enfileirar na backup-queue via BullMQ quando workers estiverem implementados.

  return {
    execution_id: execution.id,
    message:      'Backup enfileirado com sucesso',
    status:       'queued',
  };
}
