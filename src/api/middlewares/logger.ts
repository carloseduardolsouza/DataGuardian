import { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger';

// ──────────────────────────────────────────
// Middleware de request logging
// ──────────────────────────────────────────

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger[level]({
      method:     req.method,
      url:        req.url,
      status:     res.statusCode,
      durationMs,
      userAgent:  req.get('user-agent'),
      ip:         req.ip,
    }, `${req.method} ${req.url} ${res.statusCode} — ${durationMs}ms`);
  });

  next();
}
