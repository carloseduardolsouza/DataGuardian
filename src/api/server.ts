import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { config } from '../utils/config';
import { requestLogger } from './middlewares/logger';
import { errorHandler } from './middlewares/error-handler';

import { datasourcesRouter } from './routes/datasources';
import { storageLocationsRouter } from './routes/storage-locations';
import { backupJobsRouter } from './routes/backup-jobs';
import { executionsRouter } from './routes/executions';
import { healthRouter } from './routes/health';
import { notificationsRouter } from './routes/notifications';
import { systemRouter } from './routes/system';
import { authRouter } from './routes/auth';
import { dashboardRouter } from './routes/dashboard';
import { backupsRouter } from './routes/backups';
import { accessRouter } from './routes/access';
import { auditLogsRouter } from './routes/audit-logs';
import { integrationsRouter } from './routes/integrations';
import { requireAuth, requirePermission } from './middlewares/auth';
import { PERMISSIONS } from '../core/auth/permissions';
import { auditTrailMiddleware } from './middlewares/audit-trail';
import { getPrometheusMetricsText } from './models/metrics.model';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: config.cors.origins === '*' ? '*' : config.cors.origins.split(','),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  app.use(requestLogger);

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/metrics', async (_req: Request, res: Response, next) => {
    try {
      const payload = await getPrometheusMetricsText();
      res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.status(200).send(payload);
    } catch (err) {
      next(err);
    }
  });

  app.use('/api/integrations', integrationsRouter);
  app.use('/api', auditTrailMiddleware);
  app.use('/api/auth', authRouter);
  app.use('/api', requireAuth);
  app.use('/api/datasources', datasourcesRouter);
  app.use('/api/storage-locations', storageLocationsRouter);
  app.use('/api/backup-jobs', backupJobsRouter);
  app.use('/api/executions', executionsRouter);
  app.use('/api/health', healthRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/system', systemRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/backups', backupsRouter);
  app.use('/api/audit-logs', auditLogsRouter);
  app.use('/api/access', requirePermission(PERMISSIONS.ACCESS_MANAGE), accessRouter);

  const frontendDistPath = path.join(process.cwd(), 'public');
  const frontendIndexPath = path.join(frontendDistPath, 'index.html');
  const hasFrontendBuild = existsSync(frontendIndexPath);

  if (hasFrontendBuild) {
    app.use(express.static(frontendDistPath));

    app.get('*', (req: Request, res: Response, next) => {
      if (req.path.startsWith('/api/')) return next();
      if (req.path === '/api') return next();
      if (req.path === '/health' || req.path === '/metrics') return next();
      res.sendFile(frontendIndexPath);
    });
  }

  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: 'NOT_FOUND',
      message: 'Endpoint nao encontrado',
    });
  });

  app.use(errorHandler);

  return app;
}
