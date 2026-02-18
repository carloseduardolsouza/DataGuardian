import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { validate } from '../middlewares/validation';
import { config } from '../../utils/config';

export const healthRouter = Router();

// ──────────────────────────────────────────
// GET /api/health  (também disponível em GET /health)
// ──────────────────────────────────────────

healthRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // Testa a conexão com o banco de dados
    let dbStatus: 'ok' | 'error' = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'error';
    }

    // Estatísticas agregadas
    const [
      totalDatasources,
      healthyDatasources,
      criticalDatasources,
      totalJobs,
      enabledJobs,
      today,
    ] = await Promise.all([
      prisma.datasource.count(),
      prisma.datasource.count({ where: { status: 'healthy' } }),
      prisma.datasource.count({ where: { status: 'critical' } }),
      prisma.backupJob.count(),
      prisma.backupJob.count({ where: { enabled: true } }),
      prisma.backupExecution.count({
        where: {
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
    ]);

    const failedToday = await prisma.backupExecution.count({
      where: {
        status:    'failed',
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    });

    const overallStatus = dbStatus === 'error' ? 'degraded' : 'ok';

    res.status(overallStatus === 'ok' ? 200 : 503).json({
      status:        overallStatus,
      version:       process.env.npm_package_version ?? '1.0.0',
      uptime_seconds: Math.floor(process.uptime()),
      services: {
        database: dbStatus,
        redis:    'unknown', // TODO: verificar quando Redis estiver integrado
        workers: {
          backup:    'not_started', // TODO: atualizar quando workers estiverem implementados
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
        executions_today:        today,
        executions_failed_today: failedToday,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────
// GET /api/health/datasources
// ──────────────────────────────────────────

const healthQuerySchema = z.object({
  page:          z.coerce.number().int().min(1).default(1),
  limit:         z.coerce.number().int().min(1).max(100).default(20),
  datasource_id: z.string().uuid().optional(),
  from:          z.string().datetime().optional(),
  to:            z.string().datetime().optional(),
});

healthRouter.get(
  '/datasources',
  validate(healthQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit, datasource_id, from, to } = req.query as z.infer<typeof healthQuerySchema>;
      const skip = (page - 1) * limit;

      const where: Record<string, unknown> = {};
      if (datasource_id) where.datasourceId = datasource_id;
      if (from || to) {
        where.checkedAt = {
          ...(from && { gte: new Date(from) }),
          ...(to   && { lte: new Date(to) }),
        };
      }

      const [items, total] = await Promise.all([
        prisma.healthCheck.findMany({
          where,
          skip,
          take: limit,
          orderBy: { checkedAt: 'desc' },
          include: {
            datasource: { select: { name: true, type: true } },
          },
        }),
        prisma.healthCheck.count({ where }),
      ]);

      res.json({
        data: items.map((hc) => ({
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
        })),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);
