import { Worker } from 'bullmq';
import { logger } from '../utils/logger';
import { config } from '../utils/config';
import { markWorkerError, markWorkerRunning, markWorkerStopped } from './worker-registry';
import {
  QueueName,
  onRestoreDrillQueueEvent,
  type RestoreDrillQueueJobData,
} from '../queue/queues';
import { getBullConnection } from '../queue/redis-client';
import {
  processRestoreDrillExecutionNow,
  schedulerEnqueueDueRestoreDrillJobs,
} from '../api/models/restore-drill-job.model';

let schedulerTimer: NodeJS.Timeout | null = null;
let queueWorker: Worker<RestoreDrillQueueJobData> | null = null;
let eventsBound = false;

async function processRestoreDrillJob(job: { data: RestoreDrillQueueJobData }) {
  markWorkerRunning('restore_drill');
  const { drillExecutionId } = job.data;
  logger.info({ drillExecutionId }, '[RESTORE-DRILL] Job recebido na fila');
  await processRestoreDrillExecutionNow(drillExecutionId);
}

async function runSchedulerCycle() {
  try {
    markWorkerRunning('restore_drill');
    const result = await schedulerEnqueueDueRestoreDrillJobs(new Date());
    if (result.checked > 0 || result.queued > 0) {
      logger.info(
        { checked_due_jobs: result.checked, enqueued: result.queued },
        '[RESTORE-DRILL] Scheduler cycle concluido',
      );
    }
  } catch (err) {
    markWorkerError('restore_drill', err);
    logger.error({ err }, '[RESTORE-DRILL] Erro no scheduler do worker');
  }
}

function bindQueueEvents() {
  if (eventsBound) return;
  eventsBound = true;

  onRestoreDrillQueueEvent('failed', (args: { jobId?: string; failedReason?: string }) => {
    logger.error(
      { drillExecutionId: args.jobId ?? null, reason: args.failedReason ?? 'unknown' },
      '[RESTORE-DRILL] Execucao falhou na fila',
    );
  });

  onRestoreDrillQueueEvent('error', (err: unknown) => {
    logger.error({ err }, '[RESTORE-DRILL] Erro nos eventos da restore-drill-queue');
  });
}

export function startRestoreDrillWorker() {
  if (queueWorker) return;

  queueWorker = new Worker<RestoreDrillQueueJobData>(
    QueueName.restoreDrill,
    async (job) => processRestoreDrillJob(job),
    {
      connection: getBullConnection(),
      concurrency: 1,
      autorun: true,
    },
  );

  queueWorker.on('ready', () => {
    markWorkerRunning('restore_drill');
    logger.info('Restore drill worker inicializado');
  });

  queueWorker.on('error', (err) => {
    markWorkerError('restore_drill', err);
    logger.error({ err }, 'Erro no restore drill worker');
  });

  if (!schedulerTimer) {
    void runSchedulerCycle();
    schedulerTimer = setInterval(() => {
      void runSchedulerCycle();
    }, config.workers.schedulerIntervalMs);
  }

  bindQueueEvents();
}

export async function stopRestoreDrillWorker() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }

  if (queueWorker) {
    const worker = queueWorker;
    queueWorker = null;
    await worker.close();
  }

  markWorkerStopped('restore_drill');
  logger.info('Restore drill worker finalizado');
}
