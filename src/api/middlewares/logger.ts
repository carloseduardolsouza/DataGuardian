import { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger';

const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'token',
  'authorization',
  'secret',
  'api_key',
  'admin_password',
]);

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[truncated]';

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeValue(item, depth + 1));
  }

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(obj)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        out[key] = '***';
      } else {
        out[key] = sanitizeValue(raw, depth + 1);
      }
    }
    return out;
  }

  if (typeof value === 'string' && value.length > 500) {
    return `${value.slice(0, 500)}...[truncated]`;
  }

  return value;
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  let responseBody: unknown;

  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    responseBody = body;
    return originalJson(body);
  }) as typeof res.json;

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    if (res.statusCode < 400) return;

    const level = res.statusCode >= 500 ? 'error' : 'warn';
    const payload = (responseBody && typeof responseBody === 'object')
      ? responseBody as Record<string, unknown>
      : null;

    logger[level]({
      method: req.method,
      url: req.originalUrl || req.url,
      status: res.statusCode,
      durationMs,
      userAgent: req.get('user-agent'),
      ip: req.ip,
      errorCode: typeof payload?.error === 'string' ? payload.error : null,
      message: typeof payload?.message === 'string' ? payload.message : null,
      details: payload?.details ?? null,
      requestBody: sanitizeValue(req.body),
      query: sanitizeValue(req.query),
      params: sanitizeValue(req.params),
    }, `${req.method} ${req.originalUrl || req.url} ${res.statusCode} - ${durationMs}ms`);
  });

  next();
}
