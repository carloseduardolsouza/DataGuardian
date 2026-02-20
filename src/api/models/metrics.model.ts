import { Queue } from 'bullmq';
import { prisma } from '../../lib/prisma';
import { getWorkersSnapshot } from '../../workers/worker-registry';
import { QueueName } from '../../queue/queues';
import { getBullConnection, isRedisAvailable } from '../../queue/redis-client';

function escapeLabel(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function metricLine(name: string, value: number, labels?: Record<string, string>) {
  if (!labels || Object.keys(labels).length === 0) {
    return `${name} ${value}`;
  }
  const raw = Object.entries(labels)
    .map(([k, v]) => `${k}="${escapeLabel(v)}"`)
    .join(',');
  return `${name}{${raw}} ${value}`;
}

export async function getPrometheusMetricsText() {
  const lines: string[] = [];
  const workers = getWorkersSnapshot();

  lines.push('# HELP dg_worker_status Worker status (1=running, 0=not running)');
  lines.push('# TYPE dg_worker_status gauge');
  for (const [workerName, worker] of Object.entries(workers)) {
    lines.push(metricLine('dg_worker_status', worker.status === 'running' ? 1 : 0, { worker: workerName }));
  }

  const [jobsByEnabled, executionsByStatus, storagesByStatusAndType, datasourcesByStatus, redisUp] = await Promise.all([
    prisma.backupJob.groupBy({
      by: ['enabled'],
      _count: { _all: true },
    }),
    prisma.backupExecution.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.storageLocation.groupBy({
      by: ['status', 'type'],
      _count: { _all: true },
    }),
    prisma.datasource.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    Promise.resolve(isRedisAvailable()),
  ]);

  lines.push('# HELP dg_backup_jobs_total Total backup jobs grouped by enabled flag');
  lines.push('# TYPE dg_backup_jobs_total gauge');
  for (const row of jobsByEnabled) {
    lines.push(metricLine('dg_backup_jobs_total', row._count._all, { enabled: row.enabled ? 'true' : 'false' }));
  }

  lines.push('# HELP dg_backup_executions_total Total executions grouped by status');
  lines.push('# TYPE dg_backup_executions_total gauge');
  for (const row of executionsByStatus) {
    lines.push(metricLine('dg_backup_executions_total', row._count._all, { status: row.status }));
  }

  lines.push('# HELP dg_storage_locations_total Total storage locations grouped by type and status');
  lines.push('# TYPE dg_storage_locations_total gauge');
  for (const row of storagesByStatusAndType) {
    lines.push(metricLine('dg_storage_locations_total', row._count._all, { type: row.type, status: row.status }));
  }

  lines.push('# HELP dg_datasources_total Total datasources grouped by status');
  lines.push('# TYPE dg_datasources_total gauge');
  for (const row of datasourcesByStatus) {
    lines.push(metricLine('dg_datasources_total', row._count._all, { status: row.status }));
  }

  lines.push('# HELP dg_redis_up Redis connectivity status (1=up, 0=down)');
  lines.push('# TYPE dg_redis_up gauge');
  lines.push(metricLine('dg_redis_up', redisUp ? 1 : 0));

  lines.push('# HELP dg_queue_jobs_waiting Queue waiting jobs by queue name');
  lines.push('# TYPE dg_queue_jobs_waiting gauge');
  lines.push('# HELP dg_queue_jobs_active Queue active jobs by queue name');
  lines.push('# TYPE dg_queue_jobs_active gauge');
  lines.push('# HELP dg_queue_jobs_delayed Queue delayed jobs by queue name');
  lines.push('# TYPE dg_queue_jobs_delayed gauge');
  lines.push('# HELP dg_queue_jobs_failed Queue failed jobs by queue name');
  lines.push('# TYPE dg_queue_jobs_failed gauge');

  if (redisUp) {
    const queueNames = [QueueName.backup, QueueName.restore];
    for (const queueName of queueNames) {
      const queue = new Queue(queueName, { connection: getBullConnection() });
      try {
        const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed');
        lines.push(metricLine('dg_queue_jobs_waiting', counts.waiting ?? 0, { queue: queueName }));
        lines.push(metricLine('dg_queue_jobs_active', counts.active ?? 0, { queue: queueName }));
        lines.push(metricLine('dg_queue_jobs_delayed', counts.delayed ?? 0, { queue: queueName }));
        lines.push(metricLine('dg_queue_jobs_failed', counts.failed ?? 0, { queue: queueName }));
      } finally {
        await queue.close().catch(() => undefined);
      }
    }
  } else {
    lines.push(metricLine('dg_queue_jobs_waiting', 0, { queue: QueueName.backup }));
    lines.push(metricLine('dg_queue_jobs_active', 0, { queue: QueueName.backup }));
    lines.push(metricLine('dg_queue_jobs_delayed', 0, { queue: QueueName.backup }));
    lines.push(metricLine('dg_queue_jobs_failed', 0, { queue: QueueName.backup }));
    lines.push(metricLine('dg_queue_jobs_waiting', 0, { queue: QueueName.restore }));
    lines.push(metricLine('dg_queue_jobs_active', 0, { queue: QueueName.restore }));
    lines.push(metricLine('dg_queue_jobs_delayed', 0, { queue: QueueName.restore }));
    lines.push(metricLine('dg_queue_jobs_failed', 0, { queue: QueueName.restore }));
  }

  return `${lines.join('\n')}\n`;
}

