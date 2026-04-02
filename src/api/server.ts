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
import { dbSyncJobsRouter } from './routes/db-sync-jobs';
import { restoreDrillJobsRouter } from './routes/restore-drill-jobs';
import { executionsRouter } from './routes/executions';
import { healthRouter } from './routes/health';
import { notificationsRouter } from './routes/notifications';
import { systemRouter } from './routes/system';
import { authRouter } from './routes/auth';
import { dashboardRouter } from './routes/dashboard';
import { backupsRouter } from './routes/backups';
import { accessRouter } from './routes/access';
import { auditLogsRouter } from './routes/audit-logs';
import { criticalApprovalsRouter } from './routes/critical-approvals';
import { integrationsRouter } from './routes/integrations';
import { requireAuth } from './middlewares/auth';
import { auditTrailMiddleware } from './middlewares/audit-trail';
import { getPrometheusMetricsText } from './models/metrics.model';

export function createApp() {
  const app = express();
  const scopedApp = express();
  const subPath = config.subPath;
  const corsOrigins = config.cors.origins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowAnyOrigin = corsOrigins.includes('*');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // In HTTP deployments (common in LAN/VPS without reverse proxy TLS),
          // forcing insecure requests to HTTPS breaks static asset loading.
          'upgrade-insecure-requests': null,
        },
      },
    }),
  );
  app.use(
    cors({
      origin: allowAnyOrigin ? true : corsOrigins,
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

  scopedApp.get('/app-config.js', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(
      `window.__APP_CONFIG__ = ${JSON.stringify({ subPath })};`,
    );
  });

  scopedApp.use('/api/integrations', integrationsRouter);
  scopedApp.use('/api', auditTrailMiddleware);
  scopedApp.use('/api/auth', authRouter);
  scopedApp.use('/api', requireAuth);
  scopedApp.use('/api/datasources', datasourcesRouter);
  scopedApp.use('/api/storage-locations', storageLocationsRouter);
  scopedApp.use('/api/backup-jobs', backupJobsRouter);
  scopedApp.use('/api/db-sync-jobs', dbSyncJobsRouter);
  scopedApp.use('/api/restore-drill-jobs', restoreDrillJobsRouter);
  scopedApp.use('/api/executions', executionsRouter);
  scopedApp.use('/api/health', healthRouter);
  scopedApp.use('/api/notifications', notificationsRouter);
  scopedApp.use('/api/system', systemRouter);
  scopedApp.use('/api/dashboard', dashboardRouter);
  scopedApp.use('/api/backups', backupsRouter);
  scopedApp.use('/api/audit-logs', auditLogsRouter);
  scopedApp.use('/api/critical-approvals', criticalApprovalsRouter);
  scopedApp.use('/api/access', accessRouter);

  const frontendCandidates = [
    path.join(process.cwd(), 'public'),
    path.join(process.cwd(), 'interface', 'dist'),
  ];
  const frontendDistPath = frontendCandidates.find((candidate) =>
    existsSync(path.join(candidate, 'index.html')),
  );
  const frontendIndexPath = frontendDistPath ? path.join(frontendDistPath, 'index.html') : null;
  const hasFrontendBuild = Boolean(frontendDistPath && frontendIndexPath && existsSync(frontendIndexPath));

  if (hasFrontendBuild && frontendDistPath && frontendIndexPath) {
    scopedApp.use(express.static(frontendDistPath));

    scopedApp.get('*', (req: Request, res: Response, next) => {
      if (req.path.startsWith('/api/')) return next();
      if (req.path === '/api') return next();
      if (req.path.startsWith('/assets/')) return next();
      if (/\.[a-zA-Z0-9]+$/.test(req.path)) return next();
      res.sendFile(frontendIndexPath);
    });
  }

  if (subPath) {
    app.use(subPath, scopedApp);

    app.get('/', (_req: Request, res: Response) => {
      res.redirect(subPath);
    });
  } else {
    app.use(scopedApp);
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
