import { HealthCheckStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../utils/logger';
import { createNotification } from '../../utils/notifications';
import { testDatasourceConnection } from '../../api/models/datasource.model';
import { testStorageConnection } from '../../api/models/storage-location.model';

function mapDatasourceFailureStatus(err: unknown): HealthCheckStatus {
  const code = (err as { code?: string })?.code;
  const message = String((err as { message?: string })?.message ?? '');

  if (code === 'ETIMEDOUT' || message.toLowerCase().includes('timeout')) return 'timeout';
  if (code === '28P01' || code === '1045' || message.toLowerCase().includes('auth')) return 'auth_failed';
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EHOSTUNREACH' || code === 'EAI_AGAIN') {
    return 'unreachable';
  }
  return 'error';
}

function mapDatasourceStatus(latencyMs: number) {
  if (latencyMs > 1000) return 'warning' as const;
  return 'healthy' as const;
}

async function checkDatasourceConnection(datasource: {
  id: string;
  name: string;
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
}) {
  const startedAt = Date.now();

  try {
    const result = await testDatasourceConnection(datasource.id);
    const latencyMs = result.latency_ms ?? (Date.now() - startedAt);
    const nextStatus = mapDatasourceStatus(latencyMs);

    await prisma.healthCheck.create({
      data: {
        datasourceId: datasource.id,
        status: 'ok',
        latencyMs,
        metadata: {
          worker: 'health-worker',
          raw_status: result.status,
        },
      },
    });

    await prisma.datasource.update({
      where: { id: datasource.id },
      data: {
        status: nextStatus,
        lastHealthCheckAt: new Date(),
      },
    });

    if (datasource.status === 'critical') {
      await createNotification({
        type: 'connection_restored',
        severity: 'info',
        entityType: 'datasource',
        entityId: datasource.id,
        title: `Conexão restaurada: ${datasource.name}`,
        message: `O datasource '${datasource.name}' voltou a responder com latência ${latencyMs}ms.`,
        metadata: { latency_ms: latencyMs },
      });
    }
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const failureStatus = mapDatasourceFailureStatus(err);
    const errorMessage = err instanceof Error ? err.message : String(err);

    await prisma.healthCheck.create({
      data: {
        datasourceId: datasource.id,
        status: failureStatus,
        latencyMs,
        errorMessage,
        metadata: {
          worker: 'health-worker',
        },
      },
    });

    await prisma.datasource.update({
      where: { id: datasource.id },
      data: {
        status: 'critical',
        lastHealthCheckAt: new Date(),
      },
    });

    if (datasource.status !== 'critical') {
      await createNotification({
        type: 'connection_lost',
        severity: 'critical',
        entityType: 'datasource',
        entityId: datasource.id,
        title: `Conexão perdida: ${datasource.name}`,
        message: `Falha no health check do datasource '${datasource.name}': ${errorMessage}`,
        metadata: { latency_ms: latencyMs },
      });
    }

    logger.warn(
      { datasourceId: datasource.id, err },
      `Health check falhou para datasource '${datasource.name}'`,
    );
  }
}

async function checkStorageConnection(storage: {
  id: string;
  name: string;
  type: string;
  status: 'healthy' | 'full' | 'unreachable';
}) {
  try {
    const result = await testStorageConnection(storage.id);

    await prisma.storageHealthCheck.create({
      data: {
        storageLocationId: storage.id,
        status: 'ok',
        latencyMs: result.latency_ms ?? null,
        availableSpaceGb: result.available_space_gb ?? null,
        errorMessage: null,
        metadata: {
          worker: 'health-worker',
          storage_name: storage.name,
          storage_type: storage.type,
        },
      },
    });

    if (storage.status === 'unreachable') {
      await createNotification({
        type: 'connection_restored',
        severity: 'info',
        entityType: 'storage_location',
        entityId: storage.id,
        title: `Storage restaurado: ${storage.name}`,
        message: `O storage '${storage.name}' voltou a responder normalmente.`,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await prisma.storageHealthCheck.create({
      data: {
        storageLocationId: storage.id,
        status: 'error',
        latencyMs: null,
        availableSpaceGb: null,
        errorMessage: message,
        metadata: {
          worker: 'health-worker',
          storage_name: storage.name,
          storage_type: storage.type,
        },
      },
    });

    if (storage.status !== 'unreachable') {
      await createNotification({
        type: 'storage_unreachable',
        severity: 'critical',
        entityType: 'storage_location',
        entityId: storage.id,
        title: `Storage inacessível: ${storage.name}`,
        message: `Falha no health check do storage '${storage.name}': ${message}`,
      });
    }

    logger.warn(
      { storageId: storage.id, err },
      `Health check falhou para storage '${storage.name}'`,
    );
  }
}

export async function runHealthChecksCycle() {
  const [datasources, storages] = await Promise.all([
    prisma.datasource.findMany({
      where: { enabled: true },
      select: { id: true, name: true, status: true },
    }),
    prisma.storageLocation.findMany({
      select: { id: true, name: true, type: true, status: true },
    }),
  ]);

  for (const datasource of datasources) {
    await checkDatasourceConnection(datasource);
  }

  for (const storage of storages) {
    await checkStorageConnection(storage);
  }

  return {
    checked_datasources: datasources.length,
    checked_storages: storages.length,
  };
}

