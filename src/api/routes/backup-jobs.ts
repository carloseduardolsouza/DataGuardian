import { Router, Request, Response, NextFunction } from 'express';
import { Prisma, DatasourceType, StorageLocationType } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { validate } from '../middlewares/validation';
import { AppError } from '../middlewares/error-handler';
import {
  createBackupJobSchema,
  updateBackupJobSchema,
} from '../../types/backup.types';
import { validateCron } from '../../core/scheduler/cron-parser';
import { calculateNextExecution } from '../../core/scheduler/job-scheduler';
import { getPaginationParams, buildPaginatedResponse } from '../../utils/config';

export const backupJobsRouter = Router();

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────

function formatJob(job: {
  id: string;
  name: string;
  datasourceId: string;
  storageLocationId: string;
  scheduleCron: string;
  scheduleTimezone: string;
  enabled: boolean;
  retentionPolicy: Prisma.JsonValue;
  backupOptions: Prisma.JsonValue;
  lastExecutionAt: Date | null;
  nextExecutionAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  datasource?: { id: string; name: string; type: DatasourceType } | null;
  storageLocation?: { id: string; name: string; type: StorageLocationType } | null;
}) {
  return {
    id:                   job.id,
    name:                 job.name,
    datasource_id:        job.datasourceId,
    storage_location_id:  job.storageLocationId,
    schedule_cron:        job.scheduleCron,
    schedule_timezone:    job.scheduleTimezone,
    enabled:              job.enabled,
    retention_policy:     job.retentionPolicy,
    backup_options:       job.backupOptions,
    last_execution_at:    job.lastExecutionAt?.toISOString() ?? null,
    next_execution_at:    job.nextExecutionAt?.toISOString() ?? null,
    created_at:           job.createdAt.toISOString(),
    updated_at:           job.updatedAt.toISOString(),
    ...(job.datasource && {
      datasource: {
        id:   job.datasource.id,
        name: job.datasource.name,
        type: job.datasource.type,
      },
    }),
    ...(job.storageLocation && {
      storage_location: {
        id:   job.storageLocation.id,
        name: job.storageLocation.name,
        type: job.storageLocation.type,
      },
    }),
  };
}

// ──────────────────────────────────────────
// Query schema
// ──────────────────────────────────────────

const listQuerySchema = z.object({
  page:                z.coerce.number().int().min(1).default(1),
  limit:               z.coerce.number().int().min(1).max(100).default(20),
  enabled:             z.enum(['true', 'false']).optional(),
  datasource_id:       z.string().uuid().optional(),
  storage_location_id: z.string().uuid().optional(),
});

// ──────────────────────────────────────────
// GET /api/backup-jobs
// ──────────────────────────────────────────

backupJobsRouter.get(
  '/',
  validate(listQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit, enabled, datasource_id, storage_location_id } =
        req.query as z.infer<typeof listQuerySchema>;
      const { skip } = getPaginationParams({ page, limit });

      const where: Prisma.BackupJobWhereInput = {};
      if (enabled             !== undefined) where.enabled             = enabled === 'true';
      if (datasource_id)       where.datasourceId       = datasource_id;
      if (storage_location_id) where.storageLocationId = storage_location_id;

      const [items, total] = await Promise.all([
        prisma.backupJob.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            datasource: { select: { id: true, name: true, type: true } },
            storageLocation: { select: { id: true, name: true, type: true } },
          },
        }),
        prisma.backupJob.count({ where }),
      ]);

      res.json(buildPaginatedResponse(items.map(formatJob), total, page, limit));
    } catch (err) {
      next(err);
    }
  },
);

// ──────────────────────────────────────────
// POST /api/backup-jobs
// ──────────────────────────────────────────

backupJobsRouter.post(
  '/',
  validate(createBackupJobSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        name, datasource_id, storage_location_id,
        schedule_cron, schedule_timezone,
        enabled, retention_policy, backup_options,
      } = req.body;

      // Valida a expressão cron
      validateCron(schedule_cron);

      // Verifica se datasource e storage existem
      const [datasource, storageLocation] = await Promise.all([
        prisma.datasource.findUnique({ where: { id: datasource_id } }),
        prisma.storageLocation.findUnique({ where: { id: storage_location_id } }),
      ]);

      if (!datasource) {
        throw new AppError('NOT_FOUND', 404, `Datasource '${datasource_id}' não encontrado`);
      }
      if (!storageLocation) {
        throw new AppError('NOT_FOUND', 404, `Storage location '${storage_location_id}' não encontrado`);
      }

      // Calcula a próxima execução
      const nextExecutionAt = calculateNextExecution(schedule_cron, schedule_timezone ?? 'UTC');

      const job = await prisma.backupJob.create({
        data: {
          name,
          datasourceId:     datasource_id,
          storageLocationId: storage_location_id,
          scheduleCron:     schedule_cron,
          scheduleTimezone: schedule_timezone ?? 'UTC',
          enabled,
          retentionPolicy:  retention_policy as Prisma.InputJsonValue,
          backupOptions:    backup_options as Prisma.InputJsonValue,
          nextExecutionAt,
        },
        include: {
          datasource:     { select: { id: true, name: true, type: true } },
          storageLocation: { select: { id: true, name: true, type: true } },
        },
      });

      res.status(201).json(formatJob(job));
    } catch (err) {
      next(err);
    }
  },
);

// ──────────────────────────────────────────
// GET /api/backup-jobs/:id
// ──────────────────────────────────────────

backupJobsRouter.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const job = await prisma.backupJob.findUniqueOrThrow({
        where: { id: req.params.id },
        include: {
          datasource:      { select: { id: true, name: true, type: true } },
          storageLocation: { select: { id: true, name: true, type: true } },
        },
      });

      res.json(formatJob(job));
    } catch (err) {
      next(err);
    }
  },
);

// ──────────────────────────────────────────
// PUT /api/backup-jobs/:id
// ──────────────────────────────────────────

backupJobsRouter.put(
  '/:id',
  validate(updateBackupJobSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const current = await prisma.backupJob.findUniqueOrThrow({ where: { id: req.params.id } });

      const {
        name, datasource_id, storage_location_id,
        schedule_cron, schedule_timezone,
        enabled, retention_policy, backup_options,
      } = req.body;

      // Valida novo cron se fornecido
      const newCron     = schedule_cron     ?? current.scheduleCron;
      const newTimezone = schedule_timezone ?? current.scheduleTimezone;

      if (schedule_cron) validateCron(schedule_cron);

      // Recalcula next_execution_at se cron ou timezone mudou
      const needsRecalculate = schedule_cron || schedule_timezone;
      const nextExecutionAt = needsRecalculate
        ? calculateNextExecution(newCron, newTimezone)
        : undefined;

      // Verifica se datasource existe, se fornecido
      if (datasource_id) {
        const ds = await prisma.datasource.findUnique({ where: { id: datasource_id } });
        if (!ds) throw new AppError('NOT_FOUND', 404, `Datasource '${datasource_id}' não encontrado`);
      }

      // Verifica se storage existe, se fornecido
      if (storage_location_id) {
        const sl = await prisma.storageLocation.findUnique({ where: { id: storage_location_id } });
        if (!sl) throw new AppError('NOT_FOUND', 404, `Storage location '${storage_location_id}' não encontrado`);
      }

      const updated = await prisma.backupJob.update({
        where: { id: req.params.id },
        data: {
          ...(name                !== undefined && { name }),
          ...(datasource_id       !== undefined && { datasourceId: datasource_id }),
          ...(storage_location_id !== undefined && { storageLocationId: storage_location_id }),
          ...(schedule_cron       !== undefined && { scheduleCron: schedule_cron }),
          ...(schedule_timezone   !== undefined && { scheduleTimezone: schedule_timezone }),
          ...(enabled             !== undefined && { enabled }),
          ...(retention_policy    !== undefined && { retentionPolicy: retention_policy as Prisma.InputJsonValue }),
          ...(backup_options      !== undefined && { backupOptions: backup_options as Prisma.InputJsonValue }),
          ...(nextExecutionAt     !== undefined && { nextExecutionAt }),
        },
        include: {
          datasource:      { select: { id: true, name: true, type: true } },
          storageLocation: { select: { id: true, name: true, type: true } },
        },
      });

      res.json(formatJob(updated));
    } catch (err) {
      next(err);
    }
  },
);

// ──────────────────────────────────────────
// DELETE /api/backup-jobs/:id
// ──────────────────────────────────────────

backupJobsRouter.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await prisma.backupJob.findUniqueOrThrow({ where: { id: req.params.id } });
      await prisma.backupJob.delete({ where: { id: req.params.id } });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

// ──────────────────────────────────────────
// POST /api/backup-jobs/:id/run
// ──────────────────────────────────────────

backupJobsRouter.post(
  '/:id/run',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const job = await prisma.backupJob.findUniqueOrThrow({ where: { id: req.params.id } });

      if (!job.enabled) {
        throw new AppError('JOB_DISABLED', 400, 'Este backup job está desabilitado. Habilite-o antes de executar.');
      }

      // Cria o registro de execução manual
      const execution = await prisma.backupExecution.create({
        data: {
          jobId:            job.id,
          datasourceId:     job.datasourceId,
          storageLocationId: job.storageLocationId,
          status:           'queued',
          backupType:       'full',
        },
      });

      // TODO: Enfileirar na backup-queue via BullMQ quando workers estiverem implementados.
      // await backupQueue.add('backup', { execution_id: execution.id, job_id: job.id }, { priority: 1 });

      res.status(202).json({
        execution_id: execution.id,
        message:      'Backup enfileirado com sucesso',
        status:       'queued',
      });
    } catch (err) {
      next(err);
    }
  },
);
