import { Prisma, SyncExecutionStatus, SyncOverwriteDirection } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../middlewares/error-handler';
import { validateCron } from '../../core/scheduler/cron-parser';
import { calculateNextExecution } from '../../core/scheduler/job-scheduler';
import { enqueueDbSyncExecution } from '../../queue/queues';

const SYNC_SUPPORTED_TYPES = new Set(['postgres', 'mysql', 'mariadb']);

interface CreateDbSyncJobData {
  name: string;
  source_datasource_id: string;
  target_datasource_id: string;
  storage_location_id: string;
  schedule_cron: string;
  schedule_timezone?: string;
  overwrite_direction?: 'source_to_target' | 'target_to_source';
  drop_existing?: boolean;
  run_on_manual?: boolean;
  enabled?: boolean;
}

interface UpdateDbSyncJobData {
  name?: string;
  source_datasource_id?: string;
  target_datasource_id?: string;
  storage_location_id?: string;
  schedule_cron?: string;
  schedule_timezone?: string;
  overwrite_direction?: 'source_to_target' | 'target_to_source';
  drop_existing?: boolean;
  run_on_manual?: boolean;
  enabled?: boolean;
}

function mapOverwriteDirection(value: unknown): SyncOverwriteDirection {
  return value === 'target_to_source' ? 'target_to_source' : 'source_to_target';
}

async function validateSyncPair(params: {
  sourceDatasourceId: string;
  targetDatasourceId: string;
  storageLocationId: string;
}) {
  if (params.sourceDatasourceId === params.targetDatasourceId) {
    throw new AppError('SYNC_INVALID', 422, 'source_datasource_id e target_datasource_id devem ser diferentes');
  }

  const [sourceDatasource, targetDatasource, storage] = await Promise.all([
    prisma.datasource.findUnique({ where: { id: params.sourceDatasourceId }, select: { id: true, type: true, name: true } }),
    prisma.datasource.findUnique({ where: { id: params.targetDatasourceId }, select: { id: true, type: true, name: true } }),
    prisma.storageLocation.findUnique({ where: { id: params.storageLocationId }, select: { id: true } }),
  ]);

  if (!sourceDatasource) throw new AppError('NOT_FOUND', 404, `Datasource origem '${params.sourceDatasourceId}' nao encontrada`);
  if (!targetDatasource) throw new AppError('NOT_FOUND', 404, `Datasource destino '${params.targetDatasourceId}' nao encontrada`);
  if (!storage) throw new AppError('NOT_FOUND', 404, `Storage '${params.storageLocationId}' nao encontrado`);

  if (!SYNC_SUPPORTED_TYPES.has(sourceDatasource.type) || !SYNC_SUPPORTED_TYPES.has(targetDatasource.type)) {
    throw new AppError('SYNC_NOT_SUPPORTED', 422, 'Sync separado suporta apenas postgres, mysql e mariadb');
  }

  if (sourceDatasource.type !== targetDatasource.type) {
    throw new AppError(
      'SYNC_TYPE_MISMATCH',
      422,
      `Tipos diferentes: '${sourceDatasource.name}' (${sourceDatasource.type}) e '${targetDatasource.name}' (${targetDatasource.type})`,
    );
  }
}

function formatSyncExecution(execution: {
  id: string;
  status: SyncExecutionStatus;
  triggerSource: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  durationSeconds: number | null;
  backupExecutionId: string | null;
  restoreExecutionId: string | null;
  errorMessage: string | null;
  createdAt: Date;
}) {
  return {
    id: execution.id,
    status: execution.status,
    trigger_source: execution.triggerSource,
    started_at: execution.startedAt?.toISOString() ?? null,
    finished_at: execution.finishedAt?.toISOString() ?? null,
    duration_seconds: execution.durationSeconds,
    backup_execution_id: execution.backupExecutionId,
    restore_execution_id: execution.restoreExecutionId,
    error_message: execution.errorMessage,
    created_at: execution.createdAt.toISOString(),
  };
}

function formatDbSyncJob(job: {
  id: string;
  name: string;
  sourceDatasourceId: string;
  targetDatasourceId: string;
  storageLocationId: string;
  scheduleCron: string;
  scheduleTimezone: string;
  overwriteDirection: SyncOverwriteDirection;
  dropExisting: boolean;
  runOnManual: boolean;
  enabled: boolean;
  lastExecutionAt: Date | null;
  nextExecutionAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  sourceDatasource?: { id: string; name: string; type: string } | null;
  targetDatasource?: { id: string; name: string; type: string } | null;
  storageLocation?: { id: string; name: string; type: string } | null;
  executions?: Array<{
    id: string;
    status: SyncExecutionStatus;
    triggerSource: string;
    startedAt: Date | null;
    finishedAt: Date | null;
    durationSeconds: number | null;
    backupExecutionId: string | null;
    restoreExecutionId: string | null;
    errorMessage: string | null;
    createdAt: Date;
  }>;
}) {
  const latestExecution = job.executions?.[0] ?? null;
  return {
    id: job.id,
    name: job.name,
    source_datasource_id: job.sourceDatasourceId,
    target_datasource_id: job.targetDatasourceId,
    storage_location_id: job.storageLocationId,
    schedule_cron: job.scheduleCron,
    schedule_timezone: job.scheduleTimezone,
    overwrite_direction: job.overwriteDirection,
    drop_existing: job.dropExisting,
    run_on_manual: job.runOnManual,
    enabled: job.enabled,
    last_execution_at: job.lastExecutionAt?.toISOString() ?? null,
    next_execution_at: job.nextExecutionAt?.toISOString() ?? null,
    created_at: job.createdAt.toISOString(),
    updated_at: job.updatedAt.toISOString(),
    ...(job.sourceDatasource && { source_datasource: job.sourceDatasource }),
    ...(job.targetDatasource && { target_datasource: job.targetDatasource }),
    ...(job.storageLocation && { storage_location: job.storageLocation }),
    ...(latestExecution && { last_sync_execution: formatSyncExecution(latestExecution) }),
  };
}

const includeDefinition = {
  sourceDatasource: { select: { id: true, name: true, type: true } },
  targetDatasource: { select: { id: true, name: true, type: true } },
  storageLocation: { select: { id: true, name: true, type: true } },
  executions: {
    take: 1,
    orderBy: { createdAt: 'desc' as const },
    select: {
      id: true,
      status: true,
      triggerSource: true,
      startedAt: true,
      finishedAt: true,
      durationSeconds: true,
      backupExecutionId: true,
      restoreExecutionId: true,
      errorMessage: true,
      createdAt: true,
    },
  },
} as const;

export async function listDbSyncJobs(skip: number, limit: number) {
  const [items, total] = await Promise.all([
    prisma.databaseSyncJob.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: includeDefinition,
    }),
    prisma.databaseSyncJob.count(),
  ]);

  return {
    items: items.map(formatDbSyncJob),
    total,
  };
}

export async function createDbSyncJob(data: CreateDbSyncJobData) {
  validateCron(data.schedule_cron, 'sync.schedule_cron');

  await validateSyncPair({
    sourceDatasourceId: data.source_datasource_id,
    targetDatasourceId: data.target_datasource_id,
    storageLocationId: data.storage_location_id,
  });

  const nextExecutionAt = calculateNextExecution(data.schedule_cron, data.schedule_timezone ?? 'UTC');

  const created = await prisma.databaseSyncJob.create({
    data: {
      name: data.name,
      sourceDatasourceId: data.source_datasource_id,
      targetDatasourceId: data.target_datasource_id,
      storageLocationId: data.storage_location_id,
      scheduleCron: data.schedule_cron,
      scheduleTimezone: data.schedule_timezone ?? 'UTC',
      overwriteDirection: mapOverwriteDirection(data.overwrite_direction),
      dropExisting: data.drop_existing !== false,
      runOnManual: data.run_on_manual !== false,
      enabled: data.enabled !== false,
      nextExecutionAt,
    },
    include: includeDefinition,
  });

  return formatDbSyncJob(created);
}

export async function findDbSyncJobById(id: string) {
  const job = await prisma.databaseSyncJob.findUniqueOrThrow({
    where: { id },
    include: includeDefinition,
  });
  return formatDbSyncJob(job);
}

export async function updateDbSyncJob(id: string, data: UpdateDbSyncJobData) {
  const current = await prisma.databaseSyncJob.findUniqueOrThrow({ where: { id } });

  if (data.schedule_cron) validateCron(data.schedule_cron, 'sync.schedule_cron');

  const sourceDatasourceId = data.source_datasource_id ?? current.sourceDatasourceId;
  const targetDatasourceId = data.target_datasource_id ?? current.targetDatasourceId;
  const storageLocationId = data.storage_location_id ?? current.storageLocationId;

  await validateSyncPair({
    sourceDatasourceId,
    targetDatasourceId,
    storageLocationId,
  });

  const recalculatedNextExecution = (data.schedule_cron || data.schedule_timezone)
    ? calculateNextExecution(data.schedule_cron ?? current.scheduleCron, data.schedule_timezone ?? current.scheduleTimezone)
    : undefined;

  const updated = await prisma.databaseSyncJob.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.source_datasource_id !== undefined && { sourceDatasourceId: data.source_datasource_id }),
      ...(data.target_datasource_id !== undefined && { targetDatasourceId: data.target_datasource_id }),
      ...(data.storage_location_id !== undefined && { storageLocationId: data.storage_location_id }),
      ...(data.schedule_cron !== undefined && { scheduleCron: data.schedule_cron }),
      ...(data.schedule_timezone !== undefined && { scheduleTimezone: data.schedule_timezone }),
      ...(data.overwrite_direction !== undefined && { overwriteDirection: mapOverwriteDirection(data.overwrite_direction) }),
      ...(data.drop_existing !== undefined && { dropExisting: data.drop_existing }),
      ...(data.run_on_manual !== undefined && { runOnManual: data.run_on_manual }),
      ...(data.enabled !== undefined && { enabled: data.enabled }),
      ...(recalculatedNextExecution !== undefined && { nextExecutionAt: recalculatedNextExecution }),
    },
    include: includeDefinition,
  });

  return formatDbSyncJob(updated);
}

export async function deleteDbSyncJob(id: string) {
  await prisma.databaseSyncJob.findUniqueOrThrow({ where: { id } });
  await prisma.databaseSyncJob.delete({ where: { id } });
}

export async function enqueueDbSyncRun(params: {
  syncJobId: string;
  triggerSource: 'manual' | 'scheduled';
}) {
  const syncJob = await prisma.databaseSyncJob.findUniqueOrThrow({
    where: { id: params.syncJobId },
  });

  const inFlightCount = await prisma.databaseSyncExecution.count({
    where: {
      syncJobId: params.syncJobId,
      status: { in: ['queued', 'running'] },
    },
  });
  if (inFlightCount > 0) {
    throw new AppError('SYNC_ALREADY_RUNNING', 409, 'Ja existe sincronizacao em andamento para este job');
  }

  const now = new Date();
  const execution = await prisma.databaseSyncExecution.create({
    data: {
      syncJobId: syncJob.id,
      sourceDatasourceId: syncJob.sourceDatasourceId,
      targetDatasourceId: syncJob.targetDatasourceId,
      status: 'queued',
      triggerSource: params.triggerSource,
      metadata: {
        execution_logs: [
          {
            ts: now.toISOString(),
            level: 'info',
            message: params.triggerSource === 'manual'
              ? 'Sincronizacao manual enfileirada'
              : 'Sincronizacao agendada enfileirada',
          },
        ],
      } as Prisma.InputJsonValue,
    },
  });

  await enqueueDbSyncExecution(execution.id, params.triggerSource);

  return {
    sync_job_id: syncJob.id,
    sync_execution_id: execution.id,
    status: 'queued' as const,
    message: 'Sincronizacao enfileirada com sucesso',
  };
}

export async function runDbSyncJobNow(syncJobId: string) {
  const syncJob = await prisma.databaseSyncJob.findUniqueOrThrow({ where: { id: syncJobId } });
  if (!syncJob.runOnManual) {
    throw new AppError('SYNC_MANUAL_DISABLED', 409, 'Este sync job nao permite execucao manual');
  }
  return enqueueDbSyncRun({ syncJobId, triggerSource: 'manual' });
}

export async function schedulerEnqueueDueDbSyncJobs(now: Date) {
  const dueJobs = await prisma.databaseSyncJob.findMany({
    where: {
      enabled: true,
      nextExecutionAt: { lte: now },
    },
    select: {
      id: true,
      scheduleCron: true,
      scheduleTimezone: true,
    },
    orderBy: { nextExecutionAt: 'asc' },
    take: 100,
  });

  let queued = 0;
  for (const job of dueJobs) {
    const inFlightCount = await prisma.databaseSyncExecution.count({
      where: {
        syncJobId: job.id,
        status: { in: ['queued', 'running'] },
      },
    });

    const nextExecutionAt = calculateNextExecution(job.scheduleCron, job.scheduleTimezone);
    if (inFlightCount > 0) {
      await prisma.databaseSyncJob.update({
        where: { id: job.id },
        data: { nextExecutionAt },
      });
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.databaseSyncJob.update({
        where: { id: job.id },
        data: { nextExecutionAt },
      });
    });

    await enqueueDbSyncRun({ syncJobId: job.id, triggerSource: 'scheduled' });
    queued += 1;
  }

  return {
    checked: dueJobs.length,
    queued,
  };
}

export async function listDbSyncExecutions(syncJobId: string, limit = 20) {
  const executions = await prisma.databaseSyncExecution.findMany({
    where: { syncJobId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return executions.map(formatSyncExecution);
}
