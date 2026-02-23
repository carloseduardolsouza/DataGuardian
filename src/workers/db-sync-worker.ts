import { Prisma } from '@prisma/client';
import { Worker } from 'bullmq';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { config } from '../utils/config';
import { markWorkerError, markWorkerRunning, markWorkerStopped } from './worker-registry';
import {
  QueueName,
  onDbSyncQueueEvent,
  type DbSyncQueueJobData,
} from '../queue/queues';
import { getBullConnection } from '../queue/redis-client';
import { schedulerEnqueueDueDbSyncJobs } from '../api/models/db-sync-job.model';
import { triggerBackupExecutionNow } from './backup-worker';
import { restoreBackupExecution } from '../api/models/backups.model';

let schedulerTimer: NodeJS.Timeout | null = null;
let queueWorker: Worker<DbSyncQueueJobData> | null = null;
let eventsBound = false;

interface SyncExecutionLog {
  ts: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readLogs(metadata: Prisma.JsonValue | null): SyncExecutionLog[] {
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
        level: level as SyncExecutionLog['level'],
        message,
      };
    })
    .filter((entry): entry is SyncExecutionLog => entry !== null);
}

async function persistExecutionMetadata(syncExecutionId: string, logs: SyncExecutionLog[], extra: Record<string, unknown> = {}) {
  await prisma.databaseSyncExecution.update({
    where: { id: syncExecutionId },
    data: {
      metadata: {
        ...extra,
        execution_logs: logs,
      } as unknown as Prisma.InputJsonValue,
    },
  });
}

function pushLog(logs: SyncExecutionLog[], message: string, level: SyncExecutionLog['level'] = 'info') {
  logs.push({ ts: new Date().toISOString(), level, message });
}

async function ensureShadowBackupJob(params: {
  syncJobId: string;
  sourceDatasourceId: string;
  storageLocationId: string;
}) {
  const shadowName = `__db_sync_shadow__:${params.syncJobId}`;
  const existing = await prisma.backupJob.findFirst({
    where: { name: shadowName },
    select: { id: true },
  });

  const backupOptions = {
    backup_type: 'full',
    compression: 'gzip',
    storage_strategy: 'fallback',
    storage_targets: [
      {
        storage_location_id: params.storageLocationId,
        order: 1,
      },
    ],
  } as Prisma.InputJsonValue;

  if (existing) {
    await prisma.backupJob.update({
      where: { id: existing.id },
      data: {
        datasourceId: params.sourceDatasourceId,
        storageLocationId: params.storageLocationId,
        enabled: false,
        scheduleCron: '0 0 * * *',
        scheduleTimezone: 'UTC',
        retentionPolicy: { max_backups: 1, auto_delete: true },
        backupOptions,
      },
    });
    return existing.id;
  }

  const created = await prisma.backupJob.create({
    data: {
      name: shadowName,
      datasourceId: params.sourceDatasourceId,
      storageLocationId: params.storageLocationId,
      scheduleCron: '0 0 * * *',
      scheduleTimezone: 'UTC',
      enabled: false,
      retentionPolicy: { max_backups: 1, auto_delete: true },
      backupOptions,
      nextExecutionAt: null,
    },
    select: { id: true },
  });

  return created.id;
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
      return { status: 'failed' as const, error: restoreExecution.errorMessage ?? `Restore terminou com status '${restoreExecution.status}'` };
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  return { status: 'failed' as const, error: 'Timeout aguardando finalizacao do restore de sincronizacao' };
}

async function processDbSyncExecution(syncExecutionId: string) {
  const startedAt = new Date();
  const lock = await prisma.databaseSyncExecution.updateMany({
    where: { id: syncExecutionId, status: 'queued' },
    data: { status: 'running', startedAt, finishedAt: null, errorMessage: null },
  });

  if (lock.count === 0) return;

  const execution = await prisma.databaseSyncExecution.findUniqueOrThrow({
    where: { id: syncExecutionId },
    include: {
      syncJob: {
        select: {
          id: true,
          name: true,
          sourceDatasourceId: true,
          targetDatasourceId: true,
          storageLocationId: true,
          dropExisting: true,
          overwriteDirection: true,
        },
      },
    },
  });

  const logs = readLogs(execution.metadata);

  try {
    pushLog(logs, `Sync '${execution.syncJob.name}' iniciada`, 'info');
    await persistExecutionMetadata(syncExecutionId, logs, {
      overwrite_direction: execution.syncJob.overwriteDirection,
    });

    const backupDatasourceId = execution.syncJob.overwriteDirection === 'target_to_source'
      ? execution.syncJob.targetDatasourceId
      : execution.syncJob.sourceDatasourceId;

    const restoreTargetDatasourceId = execution.syncJob.overwriteDirection === 'target_to_source'
      ? execution.syncJob.sourceDatasourceId
      : execution.syncJob.targetDatasourceId;

    const shadowJobId = await ensureShadowBackupJob({
      syncJobId: execution.syncJob.id,
      sourceDatasourceId: backupDatasourceId,
      storageLocationId: execution.syncJob.storageLocationId,
    });

    const backupExecution = await prisma.backupExecution.create({
      data: {
        jobId: shadowJobId,
        datasourceId: backupDatasourceId,
        storageLocationId: execution.syncJob.storageLocationId,
        status: 'queued',
        backupType: 'full',
        metadata: {
          enqueue_source: 'db_sync_worker',
          operation: 'db_sync_backup',
          sync_job_id: execution.syncJob.id,
          sync_execution_id: syncExecutionId,
          execution_logs: [
            {
              ts: new Date().toISOString(),
              level: 'info',
              message: `Backup iniciado pelo sync worker para job '${execution.syncJob.name}'`,
            },
          ],
        } as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    await prisma.databaseSyncExecution.update({
      where: { id: syncExecutionId },
      data: { backupExecutionId: backupExecution.id },
    });

    pushLog(logs, `Backup iniciado (execution ${backupExecution.id})`, 'info');
    await persistExecutionMetadata(syncExecutionId, logs);

    await triggerBackupExecutionNow(backupExecution.id);

    const completedBackup = await prisma.backupExecution.findUniqueOrThrow({
      where: { id: backupExecution.id },
      select: { id: true, status: true, errorMessage: true },
    });

    if (completedBackup.status !== 'completed') {
      throw new Error(completedBackup.errorMessage || `Backup terminou com status '${completedBackup.status}'`);
    }

    pushLog(logs, `Backup concluido com sucesso (${backupExecution.id})`, 'success');
    await persistExecutionMetadata(syncExecutionId, logs);

    const restoreResult = await restoreBackupExecution({
      executionId: backupExecution.id,
      targetDatasourceId: restoreTargetDatasourceId,
      dropExisting: execution.syncJob.dropExisting,
      verificationMode: false,
      keepVerificationDatabase: false,
      syncContext: {
        syncJobId: execution.syncJob.id,
        sourceDatasourceId: backupDatasourceId,
        targetDatasourceId: restoreTargetDatasourceId,
        overwriteDirection: execution.syncJob.overwriteDirection === 'target_to_source' ? 'pair_to_job' : 'job_to_pair',
      },
    });

    await prisma.databaseSyncExecution.update({
      where: { id: syncExecutionId },
      data: { restoreExecutionId: restoreResult.execution_id },
    });

    pushLog(logs, `Restore enfileirado (${restoreResult.execution_id})`, 'info');
    await persistExecutionMetadata(syncExecutionId, logs);

    const restoreFinal = await waitRestoreFinish(restoreResult.execution_id);

    if (restoreFinal.status !== 'completed') {
      throw new Error(restoreFinal.error || 'Restore de sincronizacao falhou');
    }

    const finishedAt = new Date();
    const durationSeconds = Math.max(1, Math.floor((finishedAt.getTime() - startedAt.getTime()) / 1000));
    pushLog(logs, 'Sincronizacao concluida com sucesso', 'success');

    await prisma.$transaction([
      prisma.databaseSyncExecution.update({
        where: { id: syncExecutionId },
        data: {
          status: 'completed',
          finishedAt,
          durationSeconds,
          metadata: { execution_logs: logs } as unknown as Prisma.InputJsonValue,
        },
      }),
      prisma.databaseSyncJob.update({
        where: { id: execution.syncJob.id },
        data: { lastExecutionAt: finishedAt },
      }),
    ]);
  } catch (err) {
    const finishedAt = new Date();
    const durationSeconds = Math.max(1, Math.floor((finishedAt.getTime() - startedAt.getTime()) / 1000));
    const message = err instanceof Error ? err.message : String(err);
    pushLog(logs, `Falha na sincronizacao: ${message}`, 'error');
    await prisma.databaseSyncExecution.update({
      where: { id: syncExecutionId },
      data: {
        status: 'failed',
        finishedAt,
        durationSeconds,
        errorMessage: message,
        metadata: { execution_logs: logs } as unknown as Prisma.InputJsonValue,
      },
    });
    logger.error({ err, syncExecutionId }, '[DB-SYNC] Falha ao processar execucao de sincronizacao');
  }
}

async function executeSchedulerCycle() {
  try {
    const result = await schedulerEnqueueDueDbSyncJobs(new Date());
    if (result.checked > 0 || result.queued > 0) {
      logger.info(result, '[DB-SYNC] Ciclo de agendamento concluido');
    }
  } catch (err) {
    markWorkerError('db_sync', err);
    logger.error({ err }, '[DB-SYNC] Falha no ciclo de agendamento');
  }
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  onDbSyncQueueEvent('error', (err) => {
    markWorkerError('db_sync', err);
    logger.error({ err }, '[DB-SYNC] Erro nos eventos da fila');
  });

  onDbSyncQueueEvent('failed', ({ jobId, failedReason }) => {
    logger.error({ syncExecutionId: jobId, reason: failedReason }, '[DB-SYNC] Job falhou na fila');
  });
}

export function startDbSyncWorker() {
  if (queueWorker) return;

  bindEvents();
  markWorkerRunning('db_sync');

  queueWorker = new Worker<DbSyncQueueJobData>(
    QueueName.dbSync,
    async (job) => {
      await processDbSyncExecution(job.data.syncExecutionId);
    },
    {
      connection: getBullConnection(),
      concurrency: 1,
    },
  );

  queueWorker.on('error', (err) => {
    markWorkerError('db_sync', err);
    logger.error({ err }, '[DB-SYNC] Erro no worker');
  });

  queueWorker.on('completed', (job) => {
    logger.info({ syncExecutionId: job.id }, '[DB-SYNC] Job concluido');
  });

  if (!schedulerTimer) {
    void executeSchedulerCycle();
    schedulerTimer = setInterval(() => {
      void executeSchedulerCycle();
    }, config.workers.schedulerIntervalMs);
  }

  logger.info({ intervalMs: config.workers.schedulerIntervalMs }, 'DB Sync worker inicializado');
}

export async function stopDbSyncWorker() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }

  if (queueWorker) {
    const worker = queueWorker;
    queueWorker = null;
    await worker.close();
  }

  markWorkerStopped('db_sync');
  logger.info('DB Sync worker finalizado');
}
