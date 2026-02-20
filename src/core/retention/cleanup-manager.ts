import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../utils/logger';

function asNumber(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function shouldAutoDelete(retentionPolicy: Prisma.JsonValue) {
  const policy = retentionPolicy as Record<string, unknown>;
  return Boolean(policy?.auto_delete);
}

function computeKeepCount(retentionPolicy: Prisma.JsonValue) {
  const policy = retentionPolicy as Record<string, unknown>;
  const maxBackups = asNumber(policy?.max_backups, -1);
  if (maxBackups >= 0) {
    return Math.max(0, Math.floor(maxBackups));
  }

  const keepDaily = asNumber(policy?.keep_daily, 7);
  const keepWeekly = asNumber(policy?.keep_weekly, 4);
  const keepMonthly = asNumber(policy?.keep_monthly, 12);
  return Math.max(0, keepDaily + keepWeekly + keepMonthly);
}

async function cleanupForJobs(
  jobs: Array<{ id: string; name: string; retentionPolicy: Prisma.JsonValue }>,
) {
  let deletedExecutions = 0;
  let processedJobs = 0;

  for (const job of jobs) {
    if (!shouldAutoDelete(job.retentionPolicy)) continue;
    processedJobs += 1;

    const keepCount = computeKeepCount(job.retentionPolicy);
    const completed = await prisma.backupExecution.findMany({
      where: {
        jobId: job.id,
        status: 'completed',
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (completed.length <= keepCount) continue;

    const toDelete = completed.slice(keepCount).map((exec) => exec.id);
    if (toDelete.length === 0) continue;

    await prisma.backupChunk.deleteMany({ where: { executionId: { in: toDelete } } });
    const delResult = await prisma.backupExecution.deleteMany({ where: { id: { in: toDelete } } });
    deletedExecutions += delResult.count;

    logger.info(
      { jobId: job.id, deleted: delResult.count, keepCount },
      `Cleanup aplicado no job '${job.name}'`,
    );
  }

  return {
    processed_jobs: processedJobs,
    deleted_executions: deletedExecutions,
  };
}

export async function runCleanupCycle() {
  const jobs = await prisma.backupJob.findMany({
    select: {
      id: true,
      name: true,
      retentionPolicy: true,
    },
  });

  return cleanupForJobs(jobs);
}

export async function runCleanupForJob(jobId: string) {
  const job = await prisma.backupJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      name: true,
      retentionPolicy: true,
    },
  });

  if (!job) {
    return {
      processed_jobs: 0,
      deleted_executions: 0,
    };
  }

  return cleanupForJobs([job]);
}

