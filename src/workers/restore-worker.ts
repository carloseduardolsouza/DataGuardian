import { Worker } from 'bullmq';
import { logger } from '../utils/logger';
import { markWorkerError, markWorkerRunning, markWorkerStopped } from './worker-registry';
import {
  QueueName,
  onRestoreQueueEvent,
  type RestoreQueueJobData,
} from '../queue/queues';
import { getBullConnection } from '../queue/redis-client';
import { processRestoreExecutionNow } from '../api/models/backups.model';
import { AppError } from '../api/middlewares/error-handler';
import { config } from '../utils/config';
import { prisma } from '../lib/prisma';

let worker: Worker<RestoreQueueJobData> | null = null;
let eventsBound = false;

async function processRestoreJob(job: { data: RestoreQueueJobData; attemptsMade: number; opts: { attempts?: number } }) {
  markWorkerRunning('restore');
  const { executionId } = job.data;
  logger.info({ executionId }, '[RESTORE] Job recebido na fila');

  try {
    await processRestoreExecutionNow(executionId);
  } catch (err) {
    const maxAttempts = Number(job.opts?.attempts ?? 1);
    const currentAttempt = Number(job.attemptsMade ?? 0) + 1;
    const willRetry = currentAttempt < maxAttempts;
    if (willRetry) {
      await prisma.backupExecution.updateMany({
        where: { id: executionId, status: 'failed' },
        data: {
          status: 'queued',
          finishedAt: null,
          errorMessage: null,
        },
      });
    }
    if (err instanceof AppError) {
      logger.error({ executionId, err, willRetry, attempt: currentAttempt, maxAttempts }, `[RESTORE] Falha no job: ${err.message}`);
    } else {
      logger.error({ executionId, err, willRetry, attempt: currentAttempt, maxAttempts }, '[RESTORE] Falha inesperada no job');
    }
    throw err;
  }
}

function bindQueueEvents() {
  if (eventsBound) return;
  eventsBound = true;

  onRestoreQueueEvent('failed', (args: { jobId?: string; failedReason?: string }) => {
    logger.error(
      { executionId: args.jobId ?? null, reason: args.failedReason ?? 'unknown' },
      '[RESTORE] Execucao falhou na fila',
    );
  });

  onRestoreQueueEvent('error', (err: unknown) => {
    logger.error({ err }, 'Erro nos eventos da restore-queue');
  });
}

export function startRestoreWorker() {
  if (worker) return;

  worker = new Worker<RestoreQueueJobData>(
    QueueName.restore,
    async (job) => processRestoreJob(job),
    {
      connection: getBullConnection(),
      concurrency: Math.max(1, Math.min(4, config.workers.maxConcurrentBackups)),
      autorun: true,
    },
  );

  worker.on('ready', () => {
    markWorkerRunning('restore');
    logger.info('Restore worker inicializado');
  });

  worker.on('error', (err) => {
    markWorkerError('restore', err);
    logger.error({ err }, 'Erro no restore worker');
  });

  bindQueueEvents();
}

export async function stopRestoreWorker() {
  if (!worker) return;
  await worker.close();
  worker = null;
  markWorkerStopped('restore');
  logger.info('Restore worker finalizado');
}
