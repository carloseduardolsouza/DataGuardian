import { ExecutionStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { getWorkersSnapshot } from '../../workers/worker-registry';
import { isRedisAvailable } from '../../queue/redis-client';

type DaySeriesItem = {
  date: string;
  total: number;
  completed: number;
  failed: number;
  cancelled: number;
  running: number;
  queued: number;
};

function startOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function toNumberLike(value: bigint | null | undefined) {
  if (value === null || value === undefined) return null;
  if (value <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(value);
  return value.toString();
}

function statusLevel(status: string) {
  if (status === 'healthy') return 2;
  if (status === 'warning') return 1;
  return 0;
}

export async function getDashboardOverview() {
  const workers = getWorkersSnapshot();
  const redisStatus = isRedisAvailable() ? 'ok' : 'error';

  let databaseStatus: 'ok' | 'error' = 'ok';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    databaseStatus = 'error';
  }

  const today = startOfToday();
  const sevenDaysAgo = addDays(today, -6);
  const oneDayAgo = addDays(new Date(), -1);

  const [
    totalDatasources,
    healthyDatasources,
    totalJobs,
    enabledJobs,
    totalStorages,
    healthyStorages,
    executionsToday,
    failedToday,
    executionsLast24h,
    recentExecutionsRaw,
    upcomingJobsRaw,
    datasourcesRaw,
    latestHealthChecks,
    weeklyExecutions,
  ] = await Promise.all([
    prisma.datasource.count(),
    prisma.datasource.count({ where: { status: 'healthy' } }),
    prisma.backupJob.count(),
    prisma.backupJob.count({ where: { enabled: true } }),
    prisma.storageLocation.count(),
    prisma.storageLocation.count({ where: { status: 'healthy' } }),
    prisma.backupExecution.count({ where: { createdAt: { gte: today } } }),
    prisma.backupExecution.count({ where: { status: 'failed', createdAt: { gte: today } } }),
    prisma.backupExecution.findMany({
      where: { createdAt: { gte: oneDayAgo } },
      select: { status: true },
    }),
    prisma.backupExecution.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: {
        datasource: { select: { name: true, type: true } },
        job: { select: { name: true } },
      },
    }),
    prisma.backupJob.findMany({
      where: { enabled: true },
      orderBy: [{ nextExecutionAt: 'asc' }, { createdAt: 'asc' }],
      take: 6,
      include: {
        datasource: { select: { name: true, type: true } },
      },
    }),
    prisma.datasource.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        lastHealthCheckAt: true,
      },
      orderBy: { name: 'asc' },
      take: 12,
    }),
    prisma.healthCheck.findMany({
      where: { checkedAt: { gte: addDays(today, -2) } },
      orderBy: { checkedAt: 'desc' },
      select: {
        datasourceId: true,
        latencyMs: true,
        status: true,
        checkedAt: true,
      },
    }),
    prisma.backupExecution.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true, status: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const last24hTotal = executionsLast24h.length;
  const last24hSuccess = executionsLast24h.filter((e) => e.status === 'completed').length;
  const successRate24h = last24hTotal > 0
    ? Number(((last24hSuccess / last24hTotal) * 100).toFixed(1))
    : 0;

  const healthCheckByDatasource = new Map<
    string,
    { latencyMs: number | null; status: string; checkedAt: Date }
  >();
  for (const hc of latestHealthChecks) {
    if (!healthCheckByDatasource.has(hc.datasourceId)) {
      healthCheckByDatasource.set(hc.datasourceId, {
        latencyMs: hc.latencyMs,
        status: hc.status,
        checkedAt: hc.checkedAt,
      });
    }
  }

  const datasourceHealth = datasourcesRaw
    .map((ds) => {
      const hc = healthCheckByDatasource.get(ds.id);
      return {
        id: ds.id,
        name: ds.name,
        status: ds.status,
        latency_ms: hc?.latencyMs ?? null,
        health_status: hc?.status ?? null,
        last_health_check_at: ds.lastHealthCheckAt?.toISOString() ?? null,
      };
    })
    .sort((a, b) => statusLevel(b.status) - statusLevel(a.status));

  const seriesSeed = new Map<string, DaySeriesItem>();
  for (let i = 0; i < 7; i += 1) {
    const day = addDays(sevenDaysAgo, i);
    const key = isoDate(startOfDay(day));
    seriesSeed.set(key, {
      date: key,
      total: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      running: 0,
      queued: 0,
    });
  }

  for (const execution of weeklyExecutions) {
    const key = isoDate(startOfDay(execution.createdAt));
    const bucket = seriesSeed.get(key);
    if (!bucket) continue;

    bucket.total += 1;
    const status = execution.status as ExecutionStatus;
    if (status === 'completed') bucket.completed += 1;
    if (status === 'failed') bucket.failed += 1;
    if (status === 'cancelled') bucket.cancelled += 1;
    if (status === 'running') bucket.running += 1;
    if (status === 'queued') bucket.queued += 1;
  }

  return {
    generated_at: new Date().toISOString(),
    stats: {
      datasources_total: totalDatasources,
      datasources_healthy: healthyDatasources,
      jobs_total: totalJobs,
      jobs_enabled: enabledJobs,
      storages_total: totalStorages,
      storages_healthy: healthyStorages,
      executions_today: executionsToday,
      executions_failed_today: failedToday,
      success_rate_24h: successRate24h,
      executions_24h_total: last24hTotal,
    },
    services: {
      database: databaseStatus,
      redis: redisStatus,
      workers: {
        backup: workers.backup.status,
        restore: workers.restore.status,
        scheduler: workers.scheduler.status,
        health: workers.health.status,
        cleanup: workers.cleanup.status,
      },
    },
    recent_executions: recentExecutionsRaw.map((exec) => ({
      id: exec.id,
      datasource_name: exec.datasource?.name ?? exec.datasourceId,
      datasource_type: exec.datasource?.type ?? null,
      job_name: exec.job?.name ?? exec.jobId,
      status: exec.status,
      size_bytes: toNumberLike(exec.sizeBytes),
      compressed_size_bytes: toNumberLike(exec.compressedSizeBytes),
      duration_seconds: exec.durationSeconds,
      started_at: exec.startedAt?.toISOString() ?? null,
      finished_at: exec.finishedAt?.toISOString() ?? null,
      created_at: exec.createdAt.toISOString(),
    })),
    upcoming_jobs: upcomingJobsRaw.map((job) => ({
      id: job.id,
      name: job.name,
      schedule_cron: job.scheduleCron,
      schedule_timezone: job.scheduleTimezone,
      next_execution_at: job.nextExecutionAt?.toISOString() ?? null,
      enabled: job.enabled,
      datasource_name: job.datasource.name,
      datasource_type: job.datasource.type,
    })),
    datasource_health: datasourceHealth,
    executions_by_day: Array.from(seriesSeed.values()),
  };
}
