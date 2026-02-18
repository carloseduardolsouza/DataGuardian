import { Router, Request, Response, NextFunction } from 'express';
import { Prisma, DatasourceType, DatasourceStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { validate } from '../middlewares/validation';
import { AppError } from '../middlewares/error-handler';
import {
  createDatasourceSchema,
  updateDatasourceSchema,
} from '../../types/datasource.types';
import {
  maskCredentials,
  getPaginationParams,
  buildPaginatedResponse,
} from '../../utils/config';

export const datasourcesRouter = Router();

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────

function formatDatasource(ds: {
  id: string;
  name: string;
  type: DatasourceType;
  status: DatasourceStatus;
  enabled: boolean;
  tags: string[];
  lastHealthCheckAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id:                   ds.id,
    name:                 ds.name,
    type:                 ds.type,
    status:               ds.status,
    enabled:              ds.enabled,
    tags:                 ds.tags,
    last_health_check_at: ds.lastHealthCheckAt?.toISOString() ?? null,
    created_at:           ds.createdAt.toISOString(),
    updated_at:           ds.updatedAt.toISOString(),
  };
}

// ──────────────────────────────────────────
// Query schema para listagem
// ──────────────────────────────────────────

const listQuerySchema = z.object({
  page:    z.coerce.number().int().min(1).default(1),
  limit:   z.coerce.number().int().min(1).max(100).default(20),
  type:    z.enum(['postgres', 'mysql', 'mongodb', 'sqlserver', 'sqlite', 'files']).optional(),
  status:  z.enum(['healthy', 'warning', 'critical', 'unknown']).optional(),
  enabled: z.enum(['true', 'false']).optional(),
  tag:     z.string().optional(),
});

// ──────────────────────────────────────────
// GET /api/datasources
// ──────────────────────────────────────────

datasourcesRouter.get(
  '/',
  validate(listQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit, type, status, enabled, tag } = req.query as z.infer<typeof listQuerySchema>;
      const { skip } = getPaginationParams({ page, limit });

      const where: Prisma.DatasourceWhereInput = {};
      if (type)    where.type    = type as DatasourceType;
      if (status)  where.status  = status as DatasourceStatus;
      if (enabled !== undefined) where.enabled = enabled === 'true';
      if (tag)     where.tags    = { has: tag };

      const [items, total] = await Promise.all([
        prisma.datasource.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true, name: true, type: true, status: true,
            enabled: true, tags: true, lastHealthCheckAt: true,
            createdAt: true, updatedAt: true,
            // connectionConfig excluído por segurança
          },
        }),
        prisma.datasource.count({ where }),
      ]);

      res.json(buildPaginatedResponse(items.map(formatDatasource), total, page, limit));
    } catch (err) {
      next(err);
    }
  },
);

// ──────────────────────────────────────────
// POST /api/datasources
// ──────────────────────────────────────────

datasourcesRouter.post(
  '/',
  validate(createDatasourceSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, type, connection_config, enabled, tags } = req.body;

      const datasource = await prisma.datasource.create({
        data: {
          name,
          type:             type as DatasourceType,
          connectionConfig: connection_config as Prisma.InputJsonValue,
          status:           'unknown',
          enabled,
          tags,
        },
      });

      // TODO: Agendar primeiro health check via worker quando implementado.

      res.status(201).json(formatDatasource(datasource));
    } catch (err) {
      next(err);
    }
  },
);

// ──────────────────────────────────────────
// GET /api/datasources/:id
// ──────────────────────────────────────────

datasourcesRouter.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const datasource = await prisma.datasource.findUniqueOrThrow({
        where: { id: req.params.id },
      });

      res.json({
        ...formatDatasource(datasource),
        connection_config: maskCredentials(datasource.connectionConfig as Record<string, unknown>),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ──────────────────────────────────────────
// PUT /api/datasources/:id
// ──────────────────────────────────────────

datasourcesRouter.put(
  '/:id',
  validate(updateDatasourceSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, connection_config, enabled, tags } = req.body;

      // Verifica se o registro existe
      await prisma.datasource.findUniqueOrThrow({ where: { id: req.params.id } });

      const updated = await prisma.datasource.update({
        where: { id: req.params.id },
        data: {
          ...(name              !== undefined && { name }),
          ...(connection_config !== undefined && { connectionConfig: connection_config as Prisma.InputJsonValue }),
          ...(enabled           !== undefined && { enabled }),
          ...(tags              !== undefined && { tags }),
        },
      });

      res.json(formatDatasource(updated));
    } catch (err) {
      next(err);
    }
  },
);

// ──────────────────────────────────────────
// DELETE /api/datasources/:id
// ──────────────────────────────────────────

datasourcesRouter.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await prisma.datasource.findUniqueOrThrow({ where: { id: req.params.id } });

      const activeJobs = await prisma.backupJob.findMany({
        where: { datasourceId: req.params.id },
        select: { id: true },
      });

      if (activeJobs.length > 0) {
        throw new AppError(
          'DATASOURCE_HAS_ACTIVE_JOBS',
          409,
          `Existem ${activeJobs.length} backup job(s) associados a este datasource. Remova-os primeiro.`,
          { job_ids: activeJobs.map((j) => j.id) },
        );
      }

      await prisma.datasource.delete({ where: { id: req.params.id } });

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

// ──────────────────────────────────────────
// POST /api/datasources/:id/test
// ──────────────────────────────────────────

datasourcesRouter.post(
  '/:id/test',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const datasource = await prisma.datasource.findUniqueOrThrow({
        where: { id: req.params.id },
      });

      // TODO: Implementar teste real de conexão via health-checker
      // quando os engines de banco de dados estiverem implementados.
      // Por ora retorna 501 indicando que o recurso ainda não está disponível.

      res.status(501).json({
        error:   'NOT_IMPLEMENTED',
        message: `Teste de conexão para datasources do tipo '${datasource.type}' ainda não implementado. O health-checker será ativado junto com os workers.`,
        datasource_id: datasource.id,
        type:          datasource.type,
      });
    } catch (err) {
      next(err);
    }
  },
);
