import { Router, Request, Response, NextFunction } from 'express';
import {
  ExecutionStatus,
  DatasourceType,
  StorageLocationType,
  BackupType,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { validate } from '../middlewares/validation';
import { AppError } from '../middlewares/error-handler';
import { executionQuerySchema } from '../../types/backup.types';
import { getPaginationParams, buildPaginatedResponse, bigIntToSafe } from '../../utils/config';

export const executionsRouter = Router();

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────

function formatExecution(exec: {
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
    id:                   exec.id,
    job_id:               exec.jobId,
    datasource_id:        exec.datasourceId,
    storage_location_id:  exec.storageLocationId,
    status:               exec.status,
    backup_type:          exec.backupType,
    started_at:           exec.startedAt?.toISOString() ?? null,
    finished_at:          exec.finishedAt?.toISOString() ?? null,
    duration_seconds:     exec.durationSeconds,
    size_bytes:           bigIntToSafe(exec.sizeBytes),
    compressed_size_bytes: bigIntToSafe(exec.compressedSizeBytes),
    backup_path:          exec.backupPath,
    files_count:          exec.filesCount,
    error_message:        exec.errorMessage,
    metadata:             exec.metadata,
    created_at:           exec.createdAt.toISOString(),
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
// GET /api/executions
// ──────────────────────────────────────────

executionsRouter.get(
  '/',
  validate(executionQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit, job_id, datasource_id, storage_location_id, status, from, to } =
        req.query as unknown as { [key: string]: string | undefined } & { page: number; limit: number };

      const pageNum  = Number(page  ?? 1);
      const limitNum = Number(limit ?? 20);
      const { skip } = getPaginationParams({ page: pageNum, limit: limitNum });

      const where: Record<string, unknown> = {};
      if (job_id)              where.jobId             = job_id;
      if (datasource_id)       where.datasourceId      = datasource_id;
      if (storage_location_id) where.storageLocationId = storage_location_id;
      if (status)              where.status            = status as ExecutionStatus;
      if (from || to) {
        where.createdAt = {
          ...(from && { gte: new Date(from) }),
          ...(to   && { lte: new Date(to) }),
        };
      }

      const [items, total] = await Promise.all([
        prisma.backupExecution.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: { createdAt: 'desc' },
          include: {
            job:             { select: { name: true, scheduleCron: true } },
            datasource:      { select: { name: true, type: true } },
            storageLocation: { select: { name: true, type: true } },
          },
        }),
        prisma.backupExecution.count({ where }),
      ]);

      res.json(buildPaginatedResponse(items.map(formatExecution), total, pageNum, limitNum));
    } catch (err) {
      next(err);
    }
  },
);

// ──────────────────────────────────────────
// GET /api/executions/:id
// ──────────────────────────────────────────

executionsRouter.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const execution = await prisma.backupExecution.findUniqueOrThrow({
        where: { id: req.params.id },
        include: {
          job:             { select: { name: true, scheduleCron: true } },
          datasource:      { select: { name: true, type: true } },
          storageLocation: { select: { name: true, type: true } },
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

      res.json({
        ...formatExecution(execution),
        chunks: execution.chunks.map((c) => ({
          chunk_number: c.chunkNumber,
          file_path:    c.filePath,
          size_bytes:   bigIntToSafe(c.sizeBytes),
          checksum:     c.checksum,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ──────────────────────────────────────────
// POST /api/executions/:id/cancel
// ──────────────────────────────────────────

executionsRouter.post(
  '/:id/cancel',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const execution = await prisma.backupExecution.findUniqueOrThrow({
        where: { id: req.params.id },
      });

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
        where: { id: req.params.id },
        data: {
          status:     'cancelled',
          finishedAt: new Date(),
        },
      });

      // TODO: Sinalizar ao worker para interromper o processo de backup em andamento.

      res.json({
        id:      cancelled.id,
        status:  'cancelled',
        message: 'Execução cancelada com sucesso',
      });
    } catch (err) {
      next(err);
    }
  },
);
