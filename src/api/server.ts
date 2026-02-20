import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

import { config } from '../utils/config';
import { requestLogger } from './middlewares/logger';
import { errorHandler } from './middlewares/error-handler';

import { datasourcesRouter }      from './routes/datasources';
import { storageLocationsRouter } from './routes/storage-locations';
import { backupJobsRouter }       from './routes/backup-jobs';
import { executionsRouter }       from './routes/executions';
import { healthRouter }           from './routes/health';
import { notificationsRouter }    from './routes/notifications';
import { systemRouter }           from './routes/system';
import { authRouter }             from './routes/auth';
import { dashboardRouter }        from './routes/dashboard';
import { backupsRouter }          from './routes/backups';
import { accessRouter }           from './routes/access';
import { requireAuth, requirePermission } from './middlewares/auth';
import { PERMISSIONS }            from '../core/auth/permissions';

// ──────────────────────────────────────────
// Criação e configuração do app Express
// ──────────────────────────────────────────

export function createApp() {
  const app = express();

  // ── Segurança e parsing ──
  app.use(helmet());
  app.use(
    cors({
      origin:      config.cors.origins === '*' ? '*' : config.cors.origins.split(','),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // ── Request logging ──
  app.use(requestLogger);

  // ── Healthcheck simples (sem prefixo /api, para load balancers/Docker) ──
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  // ── Rotas da API ──
  app.use('/api/auth',              authRouter);
  app.use('/api',                   requireAuth);
  app.use('/api/datasources',       datasourcesRouter);
  app.use('/api/storage-locations', storageLocationsRouter);
  app.use('/api/backup-jobs',       backupJobsRouter);
  app.use('/api/executions',        executionsRouter);
  app.use('/api/health',            healthRouter);
  app.use('/api/notifications',     notificationsRouter);
  app.use('/api/system',            systemRouter);
  app.use('/api/dashboard',         dashboardRouter);
  app.use('/api/backups',           backupsRouter);
  app.use('/api/access',            requirePermission(PERMISSIONS.ACCESS_MANAGE), accessRouter);

  // ── Rota 404 ──
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error:   'NOT_FOUND',
      message: 'Endpoint não encontrado',
    });
  });

  // ── Error handler global (deve ser o último middleware) ──
  app.use(errorHandler);

  return app;
}
