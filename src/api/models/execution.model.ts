import { Prisma, ExecutionStatus, DatasourceType, StorageLocationType, BackupType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../middlewares/error-handler';
import { bigIntToSafe } from '../../utils/config';
import { retryExecutionUploadNow } from '../../workers/backup-worker';
import { deleteBackupExecutionWithArtifacts } from '../../core/retention/cleanup-manager';

type ExecutionLogLevel = 'info' | 'warn' | 'error' | 'debug' | 'success';

interface ExecutionLogEntry {
  ts: string;
  level: ExecutionLogLevel;
  message: string;
}

export function formatExecution(exec: {
  id: string;
  jobId: string;
  datasourceId: string;
  storageLocationId: string;
  status: ExecutionStatus;
  startedAt: Date | null;
  finishedAt: Date | null;
  durationSeconds: number | null;
  sizeBytes: bigint | null;
  compressedSizeBytes: bigint | null;
  backupPath: string | null;
  backupType: BackupType;
  filesCount: number | null;
  errorMessage: string | null;
  metadata: unknown;
  createdAt: Date;
  job?: { name: string; scheduleCron: string } | null;
  datasource?: { name: string; type: DatasourceType } | null;
  storageLocation?: { name: string; type: StorageLocationType } | null;
}) {
  const meta = getMetadataObject(exec.metadata);
  const operation = meta.operation === 'restore' ? 'restore' : 'backup';
  const backupType = operation === 'restore' ? 'restore' : exec.backupType;

  return {
    id: exec.id,
    job_id: exec.jobId,
    datasource_id: exec.datasourceId,
    storage_location_id: exec.storageLocationId,
    status: exec.status,
    backup_type: backupType,
    started_at: exec.startedAt?.toISOString() ?? null,
    finished_at: exec.finishedAt?.toISOString() ?? null,
    duration_seconds: exec.durationSeconds,
    size_bytes: bigIntToSafe(exec.sizeBytes),
    compressed_size_bytes: bigIntToSafe(exec.compressedSizeBytes),
    backup_path: exec.backupPath,
    files_count: exec.filesCount,
    error_message: exec.errorMessage,
    operation,
    metadata: exec.metadata,
    created_at: exec.createdAt.toISOString(),
    ...(exec.job && {
      job: { name: exec.job.name, schedule_cron: exec.job.scheduleCron },
    }),
    ...(exec.datasource && {
      datasource: { name: exec.datasource.name, type: exec.datasource.type },
    }),
    ...(exec.storageLocation && {
      storage_location: { name: exec.storageLocation.name, type: exec.storageLocation.type },
    }),
  };
}

function getMetadataObject(metadata: unknown): Record<string, unknown> {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }
  return {};
}

function normalizeExecutionLogs(metadata: unknown, fallbackErrorMessage: string | null): ExecutionLogEntry[] {
  const raw = getMetadataObject(metadata).execution_logs;
  const logs = Array.isArray(raw)
    ? raw
      .map((entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
        const log = entry as Record<string, unknown>;
        const message = String(log.message ?? '').trim();
        if (!message) return null;

        const levelRaw = String(log.level ?? 'info');
        const level: ExecutionLogLevel = ['info', 'warn', 'error', 'debug', 'success'].includes(levelRaw)
          ? levelRaw as ExecutionLogLevel
          : 'info';

        const tsRaw = String(log.ts ?? '');
        const ts = Number.isNaN(Date.parse(tsRaw))
          ? new Date().toISOString()
          : new Date(tsRaw).toISOString();

        return { ts, level, message };
      })
      .filter((entry): entry is ExecutionLogEntry => entry !== null)
    : [];

  if (logs.length > 0) return logs;
  if (!fallbackErrorMessage) return [];

  return [{
    ts: new Date().toISOString(),
    level: 'error',
    message: fallbackErrorMessage,
  }];
}

export interface ListExecutionsFilters {
  job_id?: string;
  datasource_id?: string;
  storage_location_id?: string;
  status?: string;
  from?: string;
  to?: string;
}

const executionInclude = {
  job: { select: { name: true, scheduleCron: true } },
  datasource: { select: { name: true, type: true } },
  storageLocation: { select: { name: true, type: true } },
} as const;

export async function listExecutions(
  filters: ListExecutionsFilters,
  skip: number,
  limit: number,
) {
  const where: Prisma.BackupExecutionWhereInput = {};
  if (filters.job_id) where.jobId = filters.job_id;
  if (filters.datasource_id) where.datasourceId = filters.datasource_id;
  if (filters.storage_location_id) where.storageLocationId = filters.storage_location_id;
  if (filters.status) where.status = filters.status as ExecutionStatus;
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from && { gte: new Date(filters.from) }),
      ...(filters.to && { lte: new Date(filters.to) }),
    };
  }

  const [items, total] = await Promise.all([
    prisma.backupExecution.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: executionInclude,
    }),
    prisma.backupExecution.count({ where }),
  ]);

  return { items: items.map(formatExecution), total };
}

export async function findExecutionById(id: string) {
  const execution = await prisma.backupExecution.findUniqueOrThrow({
    where: { id },
    include: {
      ...executionInclude,
      chunks: {
        orderBy: { chunkNumber: 'asc' },
        select: {
          chunkNumber: true,
          filePath: true,
          sizeBytes: true,
          checksum: true,
        },
      },
    },
  });

  return {
    ...formatExecution(execution),
    chunks: execution.chunks.map((c) => ({
      chunk_number: c.chunkNumber,
      file_path: c.filePath,
      size_bytes: bigIntToSafe(c.sizeBytes),
      checksum: c.checksum,
    })),
  };
}

export async function getExecutionLogs(id: string) {
  const execution = await prisma.backupExecution.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      errorMessage: true,
      metadata: true,
    },
  });

  return {
    execution_id: execution.id,
    status: execution.status,
    started_at: execution.startedAt?.toISOString() ?? null,
    finished_at: execution.finishedAt?.toISOString() ?? null,
    logs: normalizeExecutionLogs(execution.metadata, execution.errorMessage),
  };
}

export async function cancelExecution(id: string) {
  const execution = await prisma.backupExecution.findUniqueOrThrow({ where: { id } });

  const cancellableStatuses: ExecutionStatus[] = ['queued', 'running'];
  if (!cancellableStatuses.includes(execution.status)) {
    throw new AppError(
      'EXECUTION_NOT_CANCELLABLE',
      409,
      `Execucao com status '${execution.status}' nao pode ser cancelada`,
      { current_status: execution.status },
    );
  }

  const cancelled = await prisma.backupExecution.update({
    where: { id },
    data: {
      status: 'cancelled',
      finishedAt: new Date(),
    },
  });

  return {
    id: cancelled.id,
    status: 'cancelled',
    message: 'Execucao cancelada com sucesso',
  };
}

export async function deleteExecution(id: string) {
  const execution = await prisma.backupExecution.findUniqueOrThrow({
    where: { id },
    select: { id: true, status: true },
  });

  if (execution.status === 'queued' || execution.status === 'running') {
    throw new AppError(
      'EXECUTION_NOT_DELETABLE',
      409,
      `Execucao com status '${execution.status}' nao pode ser removida`,
      { current_status: execution.status },
    );
  }

  await deleteBackupExecutionWithArtifacts(id);
}

export async function retryExecutionUpload(id: string) {
  const execution = await prisma.backupExecution.findUniqueOrThrow({
    where: { id },
    select: { id: true, status: true },
  });

  if (execution.status !== 'failed') {
    throw new AppError(
      'EXECUTION_NOT_RETRIABLE',
      409,
      `Execucao com status '${execution.status}' nao pode retomar upload`,
      { current_status: execution.status },
    );
  }

  try {
    return await retryExecutionUploadNow(id);
  } catch (err) {
    if (err instanceof AppError && err.errorCode === 'EXECUTION_ALREADY_PROCESSING') {
      return {
        execution_id: id,
        status: 'running',
        message: 'Execucao ja esta em andamento',
      };
    }
    throw err;
  }
}
