import { Prisma, RestoreDrillExecutionStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../middlewares/error-handler';
import { validateCron } from '../../core/scheduler/cron-parser';
import { calculateNextExecution } from '../../core/scheduler/job-scheduler';
import { enqueueRestoreDrillExecution } from '../../queue/queues';
import { restoreBackupExecution } from './backups.model';
import { createNotification } from '../../utils/notifications';

interface CreateRestoreDrillJobData {
  name: string;
  datasource_id: string;
  storage_location_id?: string | null;
  schedule_cron: string;
  schedule_timezone?: string;
  max_backup_age_hours?: number;
  run_on_manual?: boolean;
  enabled?: boolean;
}

interface UpdateRestoreDrillJobData {
  name?: string;
  datasource_id?: string;
  storage_location_id?: string | null;
  schedule_cron?: string;
  schedule_timezone?: string;
  max_backup_age_hours?: number;
  run_on_manual?: boolean;
  enabled?: boolean;
}

type TriggerSource = 'manual' | 'scheduled';

interface DrillExecutionLog {
  ts: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readLogs(metadata: Prisma.JsonValue | null): DrillExecutionLog[] {
  const root = asObject(metadata);
  const raw = root.execution_logs;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
      const e = entry as Record<string, unknown>;
      const message = String(e.message ?? '').trim();
      if (!message) return null;
      const levelRaw = String(e.level ?? 'info');
      const level = levelRaw === 'warn' || levelRaw === 'error' || levelRaw === 'success' ? levelRaw : 'info';
      return {
        ts: new Date(String(e.ts ?? new Date().toISOString())).toISOString(),
        level: level as DrillExecutionLog['level'],
        message,
      };
    })
    .filter((entry): entry is DrillExecutionLog => entry !== null);
}

function pushLog(logs: DrillExecutionLog[], message: string, level: DrillExecutionLog['level'] = 'info') {
  logs.push({ ts: new Date().toISOString(), level, message });
}

async function persistExecutionMetadata(
  drillExecutionId: string,
  logs: DrillExecutionLog[],
  extra: Record<string, unknown> = {},
) {
  await prisma.restoreDrillExecution.update({
    where: { id: drillExecutionId },
    data: {
      metadata: {
        ...extra,
        execution_logs: logs,
      } as unknown as Prisma.InputJsonValue,
    },
  });
}

async function validateDrillPair(params: { datasourceId: string; storageLocationId?: string | null }) {
  const [datasource, storage] = await Promise.all([
    prisma.datasource.findUnique({ where: { id: params.datasourceId }, select: { id: true, type: true, name: true } }),
    params.storageLocationId
      ? prisma.storageLocation.findUnique({ where: { id: params.storageLocationId }, select: { id: true } })
      : Promise.resolve(null),
  ]);

  if (!datasource) {
    throw new AppError('NOT_FOUND', 404, `Datasource '${params.datasourceId}' nao encontrada`);
  }

  if (!['postgres', 'mysql', 'mariadb'].includes(datasource.type)) {
    throw new AppError('RESTORE_DRILL_NOT_SUPPORTED', 422, 'Restore drill suporta apenas postgres, mysql e mariadb');
  }

  if (params.storageLocationId && !storage) {
    throw new AppError('NOT_FOUND', 404, `Storage '${params.storageLocationId}' nao encontrado`);
  }
}

function formatRestoreDrillExecution(execution: {
  id: string;
  status: RestoreDrillExecutionStatus;
  triggerSource: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  durationSeconds: number | null;
  backupExecutionId: string | null;
  restoreExecutionId: string | null;
  errorMessage: string | null;
  metadata: Prisma.JsonValue | null;
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
    metadata: execution.metadata,
    created_at: execution.createdAt.toISOString(),
  };
}

function formatRestoreDrillJob(job: {
  id: string;
  name: string;
  datasourceId: string;
  storageLocationId: string | null;
  scheduleCron: string;
  scheduleTimezone: string;
  maxBackupAgeHours: number;
  runOnManual: boolean;
  enabled: boolean;
  lastExecutionAt: Date | null;
  nextExecutionAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  datasource?: { id: string; name: string; type: string } | null;
  storageLocation?: { id: string; name: string; type: string } | null;
  executions?: Array<{
    id: string;
    status: RestoreDrillExecutionStatus;
    triggerSource: string;
    startedAt: Date | null;
    finishedAt: Date | null;
    durationSeconds: number | null;
    backupExecutionId: string | null;
    restoreExecutionId: string | null;
    errorMessage: string | null;
    metadata: Prisma.JsonValue | null;
    createdAt: Date;
  }>;
}) {
  const latestExecution = job.executions?.[0] ?? null;

  return {
    id: job.id,
    name: job.name,
    datasource_id: job.datasourceId,
    storage_location_id: job.storageLocationId,
    schedule_cron: job.scheduleCron,
    schedule_timezone: job.scheduleTimezone,
    max_backup_age_hours: job.maxBackupAgeHours,
    run_on_manual: job.runOnManual,
    enabled: job.enabled,
    last_execution_at: job.lastExecutionAt?.toISOString() ?? null,
    next_execution_at: job.nextExecutionAt?.toISOString() ?? null,
    created_at: job.createdAt.toISOString(),
    updated_at: job.updatedAt.toISOString(),
    ...(job.datasource && { datasource: job.datasource }),
    ...(job.storageLocation && { storage_location: job.storageLocation }),
    ...(latestExecution && { last_drill_execution: formatRestoreDrillExecution(latestExecution) }),
  };
}

const includeDefinition = {
  datasource: { select: { id: true, name: true, type: true } },
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
      metadata: true,
      createdAt: true,
    },
  },
} as const;

export async function listRestoreDrillJobs(skip: number, limit: number, allowedIds?: string[]) {
  if (allowedIds && allowedIds.length === 0) {
    return { items: [], total: 0 };
  }

  const where: Prisma.RestoreDrillJobWhereInput | undefined = allowedIds
    ? { id: { in: allowedIds } }
    : undefined;

  const [items, total] = await Promise.all([
    prisma.restoreDrillJob.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: includeDefinition,
    }),
    prisma.restoreDrillJob.count({ where }),
  ]);

  return {
    items: items.map(formatRestoreDrillJob),
    total,
  };
}

export async function createRestoreDrillJob(data: CreateRestoreDrillJobData) {
  validateCron(data.schedule_cron, 'restore_drill.schedule_cron');

  await validateDrillPair({
    datasourceId: data.datasource_id,
    storageLocationId: data.storage_location_id,
  });

  const nextExecutionAt = calculateNextExecution(data.schedule_cron, data.schedule_timezone ?? 'UTC');

  const created = await prisma.restoreDrillJob.create({
    data: {
      name: data.name,
      datasourceId: data.datasource_id,
      storageLocationId: data.storage_location_id ?? null,
      scheduleCron: data.schedule_cron,
      scheduleTimezone: data.schedule_timezone ?? 'UTC',
      maxBackupAgeHours: data.max_backup_age_hours ?? 168,
      runOnManual: data.run_on_manual !== false,
      enabled: data.enabled !== false,
      nextExecutionAt,
    },
    include: includeDefinition,
  });

  return formatRestoreDrillJob(created);
}

export async function findRestoreDrillJobById(id: string) {
  const job = await prisma.restoreDrillJob.findUniqueOrThrow({
    where: { id },
    include: includeDefinition,
  });
  return formatRestoreDrillJob(job);
}

export async function updateRestoreDrillJob(id: string, data: UpdateRestoreDrillJobData) {
  const current = await prisma.restoreDrillJob.findUniqueOrThrow({ where: { id } });

  if (data.schedule_cron) validateCron(data.schedule_cron, 'restore_drill.schedule_cron');

  const datasourceId = data.datasource_id ?? current.datasourceId;
  const storageLocationId = data.storage_location_id !== undefined
    ? data.storage_location_id
    : current.storageLocationId;

  await validateDrillPair({ datasourceId, storageLocationId });

  const recalculatedNextExecution = (data.schedule_cron || data.schedule_timezone)
    ? calculateNextExecution(data.schedule_cron ?? current.scheduleCron, data.schedule_timezone ?? current.scheduleTimezone)
    : undefined;

  const updated = await prisma.restoreDrillJob.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.datasource_id !== undefined && { datasourceId: data.datasource_id }),
      ...(data.storage_location_id !== undefined && { storageLocationId: data.storage_location_id }),
      ...(data.schedule_cron !== undefined && { scheduleCron: data.schedule_cron }),
      ...(data.schedule_timezone !== undefined && { scheduleTimezone: data.schedule_timezone }),
      ...(data.max_backup_age_hours !== undefined && { maxBackupAgeHours: data.max_backup_age_hours }),
      ...(data.run_on_manual !== undefined && { runOnManual: data.run_on_manual }),
      ...(data.enabled !== undefined && { enabled: data.enabled }),
      ...(recalculatedNextExecution !== undefined && { nextExecutionAt: recalculatedNextExecution }),
    },
    include: includeDefinition,
  });

  return formatRestoreDrillJob(updated);
}

export async function deleteRestoreDrillJob(id: string) {
  await prisma.restoreDrillJob.findUniqueOrThrow({ where: { id } });
  await prisma.restoreDrillJob.delete({ where: { id } });
}

async function selectCandidateBackup(params: {
  datasourceId: string;
  maxBackupAgeHours: number;
}) {
  const minDate = new Date(Date.now() - (params.maxBackupAgeHours * 60 * 60 * 1000));

  const candidates = await prisma.backupExecution.findMany({
    where: {
      datasourceId: params.datasourceId,
      status: 'completed',
      createdAt: { gte: minDate },
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: {
      id: true,
      createdAt: true,
      metadata: true,
      job: { select: { name: true } },
    },
  });

  for (const candidate of candidates) {
    const meta = asObject(candidate.metadata);
    const op = String(meta.operation ?? '').trim().toLowerCase();
    if (op === 'restore') continue;
    return candidate;
  }

  return null;
}

export async function enqueueRestoreDrillRun(params: {
  drillJobId: string;
  triggerSource: TriggerSource;
}) {
  const drillJob = await prisma.restoreDrillJob.findUniqueOrThrow({ where: { id: params.drillJobId } });

  const inFlightCount = await prisma.restoreDrillExecution.count({
    where: {
      drillJobId: params.drillJobId,
      status: { in: ['queued', 'running'] },
    },
  });

  if (inFlightCount > 0) {
    throw new AppError('RESTORE_DRILL_ALREADY_RUNNING', 409, 'Ja existe restore drill em andamento para este job');
  }

  const now = new Date();
  const execution = await prisma.restoreDrillExecution.create({
    data: {
      drillJobId: drillJob.id,
      datasourceId: drillJob.datasourceId,
      storageLocationId: drillJob.storageLocationId,
      status: 'queued',
      triggerSource: params.triggerSource,
      metadata: {
        execution_logs: [
          {
            ts: now.toISOString(),
            level: 'info',
            message: params.triggerSource === 'manual'
              ? 'Restore drill manual enfileirado'
              : 'Restore drill agendado enfileirado',
          },
        ],
      } as Prisma.InputJsonValue,
    },
  });

  await enqueueRestoreDrillExecution(execution.id, params.triggerSource);

  return {
    restore_drill_job_id: drillJob.id,
    restore_drill_execution_id: execution.id,
    status: 'queued' as const,
    message: 'Restore drill enfileirado com sucesso',
  };
}

export async function runRestoreDrillJobNow(drillJobId: string) {
  const drillJob = await prisma.restoreDrillJob.findUniqueOrThrow({ where: { id: drillJobId } });
  if (!drillJob.runOnManual) {
    throw new AppError('RESTORE_DRILL_MANUAL_DISABLED', 409, 'Este restore drill job nao permite execucao manual');
  }

  return enqueueRestoreDrillRun({ drillJobId, triggerSource: 'manual' });
}

export async function schedulerEnqueueDueRestoreDrillJobs(now: Date) {
  const dueJobs = await prisma.restoreDrillJob.findMany({
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
    const inFlightCount = await prisma.restoreDrillExecution.count({
      where: {
        drillJobId: job.id,
        status: { in: ['queued', 'running'] },
      },
    });

    const nextExecutionAt = calculateNextExecution(job.scheduleCron, job.scheduleTimezone);

    if (inFlightCount > 0) {
      await prisma.restoreDrillJob.update({
        where: { id: job.id },
        data: { nextExecutionAt },
      });
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.restoreDrillJob.update({
        where: { id: job.id },
        data: { nextExecutionAt },
      });
    });

    await enqueueRestoreDrillRun({ drillJobId: job.id, triggerSource: 'scheduled' });
    queued += 1;
  }

  return {
    checked: dueJobs.length,
    queued,
  };
}

export async function listRestoreDrillExecutions(drillJobId: string, limit = 20) {
  const executions = await prisma.restoreDrillExecution.findMany({
    where: { drillJobId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return executions.map(formatRestoreDrillExecution);
}

async function waitRestoreFinish(restoreExecutionId: string, timeoutMs = 2 * 60 * 60 * 1000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const restoreExecution = await prisma.backupExecution.findUnique({
      where: { id: restoreExecutionId },
      select: { status: true, errorMessage: true },
    });

    if (!restoreExecution) {
      return { status: 'failed' as const, error: 'Execucao de restore nao encontrada' };
    }

    if (restoreExecution.status === 'completed') {
      return { status: 'completed' as const, error: null };
    }

    if (restoreExecution.status === 'failed' || restoreExecution.status === 'cancelled') {
      return {
        status: 'failed' as const,
        error: restoreExecution.errorMessage ?? `Restore terminou com status '${restoreExecution.status}'`,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  return { status: 'failed' as const, error: 'Timeout aguardando finalizacao do restore do drill' };
}

export async function processRestoreDrillExecutionNow(drillExecutionId: string) {
  const startedAt = new Date();

  const lock = await prisma.restoreDrillExecution.updateMany({
    where: { id: drillExecutionId, status: 'queued' },
    data: { status: 'running', startedAt, finishedAt: null, errorMessage: null },
  });

  if (lock.count === 0) return;

  const execution = await prisma.restoreDrillExecution.findUniqueOrThrow({
    where: { id: drillExecutionId },
    include: {
      drillJob: {
        include: {
          datasource: { select: { id: true, name: true, type: true } },
          storageLocation: { select: { id: true, name: true } },
        },
      },
    },
  });

  const logs = readLogs(execution.metadata);

  try {
    pushLog(logs, `Restore drill '${execution.drillJob.name}' iniciado`, 'info');

    const candidate = await selectCandidateBackup({
      datasourceId: execution.drillJob.datasourceId,
      maxBackupAgeHours: execution.drillJob.maxBackupAgeHours,
    });

    if (!candidate) {
      throw new AppError(
        'RESTORE_DRILL_NO_RECENT_BACKUP',
        409,
        `Nenhum backup concluido encontrado nas ultimas ${execution.drillJob.maxBackupAgeHours}h para a datasource`,
      );
    }

    pushLog(logs, `Backup selecionado para drill: ${candidate.id} (${candidate.job?.name ?? 'job desconhecido'})`, 'info');
    await persistExecutionMetadata(drillExecutionId, logs, {
      selected_backup_execution_id: candidate.id,
    });

    const restoreResult = await restoreBackupExecution({
      executionId: candidate.id,
      targetDatasourceId: execution.drillJob.datasourceId,
      storageLocationId: execution.drillJob.storageLocationId ?? undefined,
      dropExisting: false,
      verificationMode: true,
      keepVerificationDatabase: false,
    });

    await prisma.restoreDrillExecution.update({
      where: { id: drillExecutionId },
      data: {
        backupExecutionId: candidate.id,
        restoreExecutionId: restoreResult.execution_id,
      },
    });

    pushLog(logs, `Restore de verificacao enfileirado (${restoreResult.execution_id})`, 'info');
    await persistExecutionMetadata(drillExecutionId, logs, {
      selected_backup_execution_id: candidate.id,
      restore_execution_id: restoreResult.execution_id,
    });

    const restoreFinal = await waitRestoreFinish(restoreResult.execution_id);

    if (restoreFinal.status !== 'completed') {
      throw new Error(restoreFinal.error || 'Restore de verificacao falhou');
    }

    const finishedAt = new Date();
    const durationSeconds = Math.max(1, Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000));

    pushLog(logs, 'Restore drill concluido com sucesso', 'success');

    await prisma.$transaction(async (tx) => {
      await tx.restoreDrillExecution.update({
        where: { id: drillExecutionId },
        data: {
          status: 'completed',
          finishedAt,
          durationSeconds,
          metadata: {
            selected_backup_execution_id: candidate.id,
            restore_execution_id: restoreResult.execution_id,
            report: {
              verification_mode: true,
              keep_verification_database: false,
              backup_created_at: candidate.createdAt.toISOString(),
              duration_seconds: durationSeconds,
              completed_at: finishedAt.toISOString(),
              result: 'success',
            },
            execution_logs: logs,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      await tx.restoreDrillJob.update({
        where: { id: execution.drillJob.id },
        data: { lastExecutionAt: finishedAt },
      });
    });

    await createNotification({
      type: 'restore_drill_success',
      severity: 'info',
      entityType: 'system',
      entityId: execution.drillJob.id,
      title: `Restore drill concluido: ${execution.drillJob.name}`,
      message: `Drill finalizado com sucesso para datasource '${execution.drillJob.datasource.name}'.`,
      metadata: {
        restore_drill_job_id: execution.drillJob.id,
        restore_drill_execution_id: drillExecutionId,
        datasource_id: execution.drillJob.datasourceId,
        backup_execution_id: candidate.id,
        restore_execution_id: restoreResult.execution_id,
      },
    });
  } catch (err) {
    const finishedAt = new Date();
    const durationSeconds = Math.max(1, Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000));
    const message = err instanceof Error ? err.message : String(err);

    pushLog(logs, `Falha no restore drill: ${message}`, 'error');

    await prisma.restoreDrillExecution.update({
      where: { id: drillExecutionId },
      data: {
        status: 'failed',
        finishedAt,
        durationSeconds,
        errorMessage: message,
        metadata: {
          ...(asObject(execution.metadata)),
          report: {
            verification_mode: true,
            keep_verification_database: false,
            duration_seconds: durationSeconds,
            completed_at: finishedAt.toISOString(),
            result: 'failed',
          },
          execution_logs: logs,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    await createNotification({
      type: 'restore_drill_failed',
      severity: 'critical',
      entityType: 'system',
      entityId: execution.drillJob.id,
      title: `Falha no restore drill: ${execution.drillJob.name}`,
      message: message,
      metadata: {
        restore_drill_job_id: execution.drillJob.id,
        restore_drill_execution_id: drillExecutionId,
        datasource_id: execution.drillJob.datasourceId,
        error_message: message,
      },
    });

    throw err;
  }
}
