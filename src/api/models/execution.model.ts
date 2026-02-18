import { ExecutionStatus, DatasourceType, StorageLocationType, BackupType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../middlewares/error-handler';
import { bigIntToSafe } from '../../utils/config';

// ──────────────────────────────────────────
// Formatter
// ──────────────────────────────────────────

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
  return {
    id:                    exec.id,
    job_id:                exec.jobId,
    datasource_id:         exec.datasourceId,
    storage_location_id:   exec.storageLocationId,
    status:                exec.status,
    backup_type:           exec.backupType,
    started_at:            exec.startedAt?.toISOString() ?? null,
    finished_at:           exec.finishedAt?.toISOString() ?? null,
    duration_seconds:      exec.durationSeconds,
    size_bytes:            bigIntToSafe(exec.sizeBytes),
    compressed_size_bytes: bigIntToSafe(exec.compressedSizeBytes),
    backup_path:           exec.backupPath,
    files_count:           exec.filesCount,
    error_message:         exec.errorMessage,
    metadata:              exec.metadata,
    created_at:            exec.createdAt.toISOString(),
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

// ──────────────────────────────────────────
// Query types
// ──────────────────────────────────────────

export interface ListExecutionsFilters {
  job_id?:              string;
  datasource_id?:       string;
  storage_location_id?: string;
  status?:              string;
  from?:                string;
  to?:                  string;
}

const executionInclude = {
  job:             { select: { name: true, scheduleCron: true } },
  datasource:      { select: { name: true, type: true } },
  storageLocation: { select: { name: true, type: true } },
} as const;

// ──────────────────────────────────────────
// Model functions
// ──────────────────────────────────────────

export async function listExecutions(
  filters: ListExecutionsFilters,
  skip: number,
  limit: number,
) {
  const where: Record<string, unknown> = {};
  if (filters.job_id)              where.jobId             = filters.job_id;
  if (filters.datasource_id)       where.datasourceId      = filters.datasource_id;
  if (filters.storage_location_id) where.storageLocationId = filters.storage_location_id;
  if (filters.status)              where.status            = filters.status as ExecutionStatus;
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from && { gte: new Date(filters.from) }),
      ...(filters.to   && { lte: new Date(filters.to) }),
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
          filePath:    true,
          sizeBytes:   true,
          checksum:    true,
        },
      },
    },
  });

  return {
    ...formatExecution(execution),
    chunks: execution.chunks.map((c) => ({
      chunk_number: c.chunkNumber,
      file_path:    c.filePath,
      size_bytes:   bigIntToSafe(c.sizeBytes),
      checksum:     c.checksum,
    })),
  };
}

export async function cancelExecution(id: string) {
  const execution = await prisma.backupExecution.findUniqueOrThrow({ where: { id } });

  const cancellableStatuses: ExecutionStatus[] = ['queued', 'running'];
  if (!cancellableStatuses.includes(execution.status)) {
    throw new AppError(
      'EXECUTION_NOT_CANCELLABLE',
      409,
      `Execução com status '${execution.status}' não pode ser cancelada`,
      { current_status: execution.status },
    );
  }

  const cancelled = await prisma.backupExecution.update({
    where: { id },
    data: {
      status:     'cancelled',
      finishedAt: new Date(),
    },
  });

  // TODO: Sinalizar ao worker para interromper o processo de backup em andamento.

  return {
    id:      cancelled.id,
    status:  'cancelled',
    message: 'Execução cancelada com sucesso',
  };
}
