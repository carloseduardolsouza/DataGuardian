import { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    if (res.statusCode < 400) return;

    const level = res.statusCode >= 500 ? 'error' : 'warn';

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
