import { BackupType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { config } from '../utils/config';
import { calculateNextExecution } from '../core/scheduler/job-scheduler';
import { resolveBackupTypeFromOptions } from '../core/backup/backup-type';
import { markWorkerError, markWorkerRunning, markWorkerStopped } from './worker-registry';
import { enqueueBackupExecution } from '../queue/queues';
import { ensureRedisAvailable } from '../queue/redis-client';

let timer: NodeJS.Timeout | null = null;
let running = false;
let lastRedisUnavailableWarnAt = 0;

async function executeSchedulerCycle() {
  if (running) return;
  running = true;

  try {
    const redisReady = await ensureRedisAvailable();
    if (!redisReady) {
      const now = Date.now();
      if (now - lastRedisUnavailableWarnAt > 30_000) {
        lastRedisUnavailableWarnAt = now;
        logger.warn(
          'Scheduler pausado: Redis indisponivel. Jobs nao serao enfileirados ate reconexao.',
        );
      }
      return;
    }

    const now = new Date();
    const dueJobs = await prisma.backupJob.findMany({
      where: {
        enabled: true,
        nextExecutionAt: { lte: now },
      },
      select: {
        id: true,
        name: true,
        datasourceId: true,
        storageLocationId: true,
        backupOptions: true,
        scheduleCron: true,
        scheduleTimezone: true,
      },
      orderBy: { nextExecutionAt: 'asc' },
      take: 200,
    });

    let enqueued = 0;

    for (const job of dueJobs) {
      const inProgress = await prisma.backupExecution.count({
        where: {
          jobId: job.id,
          status: { in: ['queued', 'running'] },
        },
      });

      const nextExecutionAt = calculateNextExecution(job.scheduleCron, job.scheduleTimezone);

      if (inProgress > 0) {
        await prisma.backupJob.update({
          where: { id: job.id },
          data: { nextExecutionAt },
        });
        continue;
      }

      const execution = await prisma.$transaction(async (tx) => {
        const backupType = resolveBackupTypeFromOptions(job.backupOptions) as BackupType;
        const createdExecution = await tx.backupExecution.create({
          data: {
            jobId: job.id,
            datasourceId: job.datasourceId,
            storageLocationId: job.storageLocationId,
            status: 'queued',
            backupType,
            metadata: {
              enqueue_source: 'scheduled',
              execution_logs: [
                {
                  ts: new Date().toISOString(),
                  level: 'info',
                  message: `Motivo da fila: agendamento automatico atingiu a janela do job '${job.name}'.`,
                },
              ],
            },
          },
        });

        await tx.backupJob.update({
          where: { id: job.id },
          data: { nextExecutionAt },
        });

        return createdExecution;
      });

      try {
        await enqueueBackupExecution(execution.id, 'scheduled');
      } catch (err) {
        await prisma.backupExecution.updateMany({
          where: { id: execution.id, status: 'queued' },
          data: {
            status: 'failed',
            finishedAt: new Date(),
            errorMessage: 'Falha ao enfileirar backup no Redis',
          },
        });
        throw err;
      }

      enqueued += 1;
    }

    if (dueJobs.length > 0 || enqueued > 0) {
      logger.info(
        { checked_due_jobs: dueJobs.length, enqueued },
        'Scheduler cycle concluido',
      );
    }
  } catch (err) {
    markWorkerError('scheduler', err);
    logger.error({ err }, 'Erro no scheduler worker');
  } finally {
    running = false;
  }
}

export function startSchedulerWorker() {
  if (timer) return;

  markWorkerRunning('scheduler');
  void executeSchedulerCycle();

  timer = setInterval(() => {
    void executeSchedulerCycle();
  }, config.workers.schedulerIntervalMs);

  logger.info(
    { intervalMs: config.workers.schedulerIntervalMs },
    'Scheduler worker inicializado',
  );
}

export function stopSchedulerWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  markWorkerStopped('scheduler');
  logger.info('Scheduler worker finalizado');
}
