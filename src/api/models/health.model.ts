import { prisma } from '../../lib/prisma';

// ──────────────────────────────────────────
// Query types
// ──────────────────────────────────────────

export interface HealthHistoryFilters {
  datasource_id?: string;
  from?:          string;
  to?:            string;
}

// ──────────────────────────────────────────
// Model functions
// ──────────────────────────────────────────

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
    totalJobs,
    enabledJobs,
    executionsToday,
    failedToday,
  ] = await Promise.all([
    prisma.datasource.count(),
    prisma.datasource.count({ where: { status: 'healthy' } }),
    prisma.datasource.count({ where: { status: 'critical' } }),
    prisma.backupJob.count(),
    prisma.backupJob.count({ where: { enabled: true } }),
    prisma.backupExecution.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.backupExecution.count({ where: { status: 'failed', createdAt: { gte: startOfDay } } }),
  ]);

  const overallStatus = dbStatus === 'error' ? 'degraded' : 'ok';

  return {
    status:         overallStatus,
    version:        process.env.npm_package_version ?? '1.0.0',
    uptime_seconds: Math.floor(process.uptime()),
    services: {
      database: dbStatus,
      redis:    'unknown',
      workers: {
        backup:    'not_started',
        scheduler: 'not_started',
        health:    'not_started',
        cleanup:   'not_started',
      },
    },
    stats: {
      datasources_total:       totalDatasources,
      datasources_healthy:     healthyDatasources,
      datasources_critical:    criticalDatasources,
      jobs_total:              totalJobs,
      jobs_enabled:            enabledJobs,
      executions_today:        executionsToday,
      executions_failed_today: failedToday,
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
      ...(filters.to   && { lte: new Date(filters.to) }),
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
    id:            hc.id,
    datasource_id: hc.datasourceId,
    datasource:    hc.datasource
      ? { name: hc.datasource.name, type: hc.datasource.type }
      : undefined,
    checked_at:    hc.checkedAt.toISOString(),
    status:        hc.status,
    latency_ms:    hc.latencyMs,
    error_message: hc.errorMessage,
    metadata:      hc.metadata,
  }));

  return {
    data,
    pagination: {
      total,
      page:       Math.floor(skip / limit) + 1,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}
