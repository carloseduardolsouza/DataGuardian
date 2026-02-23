import type { JobsOptions } from 'bullmq';
import { Queue, QueueEvents } from 'bullmq';
import { config } from '../utils/config';
import { getBullConnection } from './redis-client';
import { logger } from '../utils/logger';

export const QueueName = {
  backup: 'backup-queue',
  restore: 'restore-queue',
  dbSync: 'db-sync-queue',
  health: 'health-queue',
  cleanup: 'cleanup-queue',
  notification: 'notification-queue',
} as const;

export interface BackupQueueJobData {
  executionId: string;
}
export interface RestoreQueueJobData {
  executionId: string;
}
export interface DbSyncQueueJobData {
  syncExecutionId: string;
}

let backupQueue: Queue<BackupQueueJobData, void, 'backup'> | null = null;
let backupQueueEvents: QueueEvents | null = null;
let restoreQueue: Queue<RestoreQueueJobData, void, 'restore'> | null = null;
let restoreQueueEvents: QueueEvents | null = null;
let dbSyncQueue: Queue<DbSyncQueueJobData, void, 'db-sync'> | null = null;
let dbSyncQueueEvents: QueueEvents | null = null;

function getBackupQueue() {
  if (!backupQueue) {
    backupQueue = new Queue<BackupQueueJobData, void, 'backup'>(QueueName.backup, {
      connection: getBullConnection(),
    });
  }
  return backupQueue;
}

function getBackupQueueEvents() {
  if (!backupQueueEvents) {
    backupQueueEvents = new QueueEvents(QueueName.backup, {
      connection: getBullConnection(),
    });
  }
  return backupQueueEvents;
}

function getRestoreQueue() {
  if (!restoreQueue) {
    restoreQueue = new Queue<RestoreQueueJobData, void, 'restore'>(QueueName.restore, {
      connection: getBullConnection(),
    });
  }
  return restoreQueue;
}

function getRestoreQueueEvents() {
  if (!restoreQueueEvents) {
    restoreQueueEvents = new QueueEvents(QueueName.restore, {
      connection: getBullConnection(),
    });
  }
  return restoreQueueEvents;
}

function getDbSyncQueue() {
  if (!dbSyncQueue) {
    dbSyncQueue = new Queue<DbSyncQueueJobData, void, 'db-sync'>(QueueName.dbSync, {
      connection: getBullConnection(),
    });
  }
  return dbSyncQueue;
}

function getDbSyncQueueEvents() {
  if (!dbSyncQueueEvents) {
    dbSyncQueueEvents = new QueueEvents(QueueName.dbSync, {
      connection: getBullConnection(),
    });
  }
  return dbSyncQueueEvents;
}

const baseBackupOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 200 },
};
const baseRestoreOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 20_000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 200 },
};
const baseDbSyncOptions: JobsOptions = {
  attempts: 2,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 300 },
};

export async function enqueueBackupExecution(
  executionId: string,
  origin: 'manual' | 'scheduled',
) {
  const queue = getBackupQueue();

  try {
    return await queue.add(
      'backup',
      { executionId },
      {
        ...baseBackupOptions,
        priority: origin === 'manual' ? 1 : 10,
        jobId: executionId,
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Job') && msg.includes('already exists')) {
      logger.info({ executionId }, 'Execucao ja enfileirada no backup-queue');
      const existing = await queue.getJob(executionId);
      if (existing) return existing;
    }
    throw err;
  }
}

export function onBackupQueueEvent(
  event: 'error' | 'failed',
  handler: (...args: any[]) => void,
) {
  const events = getBackupQueueEvents();
  events.on(event, handler as never);
}

export async function enqueueRestoreExecution(
  executionId: string,
  origin: 'manual' | 'retry',
) {
  const queue = getRestoreQueue();
  try {
    return await queue.add(
      'restore',
      { executionId },
      {
        ...baseRestoreOptions,
        priority: origin === 'manual' ? 1 : 5,
        jobId: executionId,
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Job') && msg.includes('already exists')) {
      logger.info({ executionId }, 'Execucao ja enfileirada no restore-queue');
      const existing = await queue.getJob(executionId);
      if (existing) return existing;
    }
    throw err;
  }
}

export function onRestoreQueueEvent(
  event: 'error' | 'failed',
  handler: (...args: any[]) => void,
) {
  const events = getRestoreQueueEvents();
  events.on(event, handler as never);
}

export async function enqueueDbSyncExecution(
  syncExecutionId: string,
  origin: 'manual' | 'scheduled',
) {
  const queue = getDbSyncQueue();
  try {
    return await queue.add(
      'db-sync',
      { syncExecutionId },
      {
        ...baseDbSyncOptions,
        priority: origin === 'manual' ? 1 : 5,
        jobId: syncExecutionId,
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Job') && msg.includes('already exists')) {
      logger.info({ syncExecutionId }, 'Execucao ja enfileirada no db-sync-queue');
      const existing = await queue.getJob(syncExecutionId);
      if (existing) return existing;
    }
    throw err;
  }
}

export function onDbSyncQueueEvent(
  event: 'error' | 'failed',
  handler: (...args: any[]) => void,
) {
  const events = getDbSyncQueueEvents();
  events.on(event, handler as never);
}

export async function closeQueues() {
  const closeOps: Array<Promise<void>> = [];
  if (backupQueue) closeOps.push(backupQueue.close());
  if (backupQueueEvents) closeOps.push(backupQueueEvents.close());
  if (restoreQueue) closeOps.push(restoreQueue.close());
  if (restoreQueueEvents) closeOps.push(restoreQueueEvents.close());
  if (dbSyncQueue) closeOps.push(dbSyncQueue.close());
  if (dbSyncQueueEvents) closeOps.push(dbSyncQueueEvents.close());
  await Promise.all(closeOps);
  backupQueue = null;
  backupQueueEvents = null;
  restoreQueue = null;
  restoreQueueEvents = null;
  dbSyncQueue = null;
  dbSyncQueueEvents = null;
}

export function getBackupWorkerConcurrency() {
  return config.workers.maxConcurrentBackups;
}
