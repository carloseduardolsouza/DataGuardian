import { prisma } from '../../lib/prisma';
import { getWorkersSnapshot } from '../../workers/worker-registry';
import { ensureRedisAvailable } from '../../queue/redis-client';

export interface HealthHistoryFilters {
  datasource_id?: string;
  from?: string;
  to?: string;
}

export interface StorageHealthHistoryFilters {
  storage_location_id?: string;
  from?: string;
  to?: string;
}

export async function getSystemHealth() {
  let dbStatus: 'ok' | 'error' = 'ok';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = 'error';
  }

  const startOfDay = new Date(new Date().setHours(0, 0, 0, 0));

  const [
    totalDatasources,
    healthyDatasources,
    criticalDatasources,
    totalStorages,
    accessibleStorages,
    totalJobs,
    enabledJobs,
    executionsToday,
    failedToday,
  ] = await Promise.all([
    prisma.datasource.count(),
    prisma.datasource.count({ where: { status: 'healthy' } }),
    prisma.datasource.count({ where: { status: 'critical' } }),
    prisma.storageLocation.count(),
    prisma.storageLocation.count({ where: { status: { not: 'unreachable' } } }),
    prisma.backupJob.count(),
    prisma.backupJob.count({ where: { enabled: true } }),
    prisma.backupExecution.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.backupExecution.count({ where: { status: 'failed', createdAt: { gte: startOfDay } } }),
  ]);

  const workers = getWorkersSnapshot();
  const redisAvailable = await ensureRedisAvailable();
  const redisStatus = redisAvailable ? 'ok' : 'error';
  const queueDependentWorkers = new Set(['backup', 'restore', 'scheduler', 'db_sync']);
  const effectiveWorkers = Object.fromEntries(
    Object.entries(workers).map(([name, state]) => {
      if (!redisAvailable && queueDependentWorkers.has(name)) {
        return [name, { ...state, status: 'stopped' as const }];
      }
      return [name, state];
    }),
  ) as typeof workers;
  const hasWorkerError = Object.values(effectiveWorkers).some((worker) => worker.status === 'error');
  const overallStatus =
    dbStatus === 'error' || redisStatus === 'error' || hasWorkerError ? 'degraded' : 'ok';

  return {
    status: overallStatus,
    version: process.env.npm_package_version ?? '1.0.0',
    uptime_seconds: Math.floor(process.uptime()),
    services: {
      database: dbStatus,
      redis: redisStatus,
      workers: {
        backup: effectiveWorkers.backup.status,
        restore: effectiveWorkers.restore.status,
        scheduler: effectiveWorkers.scheduler.status,
        db_sync: effectiveWorkers.db_sync.status,
        health: effectiveWorkers.health.status,
        cleanup: effectiveWorkers.cleanup.status,
      },
    },
    stats: {
      datasources_total: totalDatasources,
      datasources_healthy: healthyDatasources,
      datasources_critical: criticalDatasources,
      storages_total: totalStorages,
      storages_accessible: accessibleStorages,
      jobs_total: totalJobs,
      jobs_enabled: enabledJobs,
      executions_today: executionsToday,
      executions_failed_today: failedToday,
    },
    worker_details: {
      backup: effectiveWorkers.backup,
      restore: effectiveWorkers.restore,
      scheduler: effectiveWorkers.scheduler,
      db_sync: effectiveWorkers.db_sync,
      health: effectiveWorkers.health,
      cleanup: effectiveWorkers.cleanup,
    },
  };
}

export async function getDatasourceHealthHistory(
  filters: HealthHistoryFilters,
  skip: number,
  limit: number,
) {
  const where: Record<string, unknown> = {};
  if (filters.datasource_id) where.datasourceId = filters.datasource_id;
  if (filters.from || filters.to) {
    where.checkedAt = {
      ...(filters.from && { gte: new Date(filters.from) }),
      ...(filters.to && { lte: new Date(filters.to) }),
    };
  }

  const [items, total] = await Promise.all([
    prisma.healthCheck.findMany({
      where,
      skip,
      take: limit,
      orderBy: { checkedAt: 'desc' },
      include: { datasource: { select: { name: true, type: true } } },
    }),
    prisma.healthCheck.count({ where }),
  ]);

  const data = items.map((hc) => ({
    id: hc.id,
    datasource_id: hc.datasourceId,
    datasource: hc.datasource
      ? { name: hc.datasource.name, type: hc.datasource.type }
      : undefined,
    checked_at: hc.checkedAt.toISOString(),
    status: hc.status,
    latency_ms: hc.latencyMs,
    error_message: hc.errorMessage,
    metadata: hc.metadata,
  }));

  return {
    data,
    pagination: {
      total,
      page: Math.floor(skip / limit) + 1,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getStorageHealthHistory(
  filters: StorageHealthHistoryFilters,
  skip: number,
  limit: number,
) {
  const where: Record<string, unknown> = {};
  if (filters.storage_location_id) where.storageLocationId = filters.storage_location_id;
  if (filters.from || filters.to) {
    where.checkedAt = {
      ...(filters.from && { gte: new Date(filters.from) }),
      ...(filters.to && { lte: new Date(filters.to) }),
    };
  }

  const [rows, total] = await Promise.all([
    prisma.storageHealthCheck.findMany({
      where,
      include: {
        storageLocation: {
          select: { name: true, type: true },
        },
      },
      orderBy: { checkedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.storageHealthCheck.count({ where }),
  ]);

  const data = rows.map((item) => ({
    id: item.id,
    storage_location_id: item.storageLocationId,
    storage_name: item.storageLocation?.name ?? item.storageLocationId,
    storage_type: item.storageLocation?.type ?? 'local',
    checked_at: item.checkedAt.toISOString(),
    status: item.status,
    latency_ms: item.latencyMs,
    available_space_gb: item.availableSpaceGb ? Number(item.availableSpaceGb) : null,
    error_message: item.errorMessage,
    metadata: item.metadata,
  }));

  return {
    data,
    pagination: {
      total,
      page: Math.floor(skip / limit) + 1,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}


