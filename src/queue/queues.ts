import type { JobsOptions } from 'bullmq';
import { Queue, QueueEvents } from 'bullmq';
import { config } from '../utils/config';
import { getBullConnection } from './redis-client';
import { logger } from '../utils/logger';

export const QueueName = {
  backup: 'backup-queue',
  health: 'health-queue',
  cleanup: 'cleanup-queue',
  notification: 'notification-queue',
} as const;

export interface BackupQueueJobData {
  executionId: string;
}

let backupQueue: Queue<BackupQueueJobData, void, 'backup'> | null = null;
let backupQueueEvents: QueueEvents | null = null;

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

const baseBackupOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 200 },
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

export async function closeQueues() {
  const closeOps: Array<Promise<void>> = [];
  if (backupQueue) closeOps.push(backupQueue.close());
  if (backupQueueEvents) closeOps.push(backupQueueEvents.close());
  await Promise.all(closeOps);
  backupQueue = null;
  backupQueueEvents = null;
}

export function getBackupWorkerConcurrency() {
  return config.workers.maxConcurrentBackups;
}
