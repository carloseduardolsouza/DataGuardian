import { Request, Response, NextFunction } from 'express';
import { createAuditLog } from '../models/audit-log.model';
import { logger } from '../../utils/logger';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SENSITIVE_KEYS = new Set(['password', 'password_hash', 'api_key', 'token', 'authorization', 'secret']);

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[truncated]';
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitizeValue(item, depth + 1));
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
  if (typeof value === 'string' && value.length > 1000) {
    return `${value.slice(0, 1000)}...[truncated]`;
  }
  return value;
}

function resolveResource(path: string) {
  const clean = path.replace(/^\/api\//, '');
  const [resourceType, resourceId] = clean.split('/');
  return {
    resourceType: resourceType || null,
    resourceId: resourceId || null,
  };
}

export function auditTrailMiddleware(req: Request, res: Response, next: NextFunction) {
  const shouldAudit = MUTATING_METHODS.has(req.method.toUpperCase());
  if (!shouldAudit) {
    next();
    return;
  }

  const startedAt = Date.now();
  const bodySnapshot = sanitizeValue(req.body);

  res.on('finish', () => {
    if (res.statusCode >= 500) return;

    const authUser = res.locals.authUser as { id?: string; username?: string } | undefined;
    const fallbackUsername = typeof req.body?.username === 'string' ? req.body.username.trim() : null;
    const { resourceType, resourceId } = resolveResource(req.originalUrl);

    void createAuditLog({
      action: `${req.method.toUpperCase()} ${req.path}`,
      actor_user_id: authUser?.id ?? null,
      actor_username: authUser?.username ?? fallbackUsername,
      resource_type: resourceType,
      resource_id: resourceId,
      ip: req.ip,
      user_agent: req.get('user-agent') ?? null,
      changes: {
        request_body: bodySnapshot,
      },
      metadata: {
        status_code: res.statusCode,
        duration_ms: Date.now() - startedAt,
      },
    }).catch((err: unknown) => {
      logger.warn({ err }, 'Falha ao gravar trilha de auditoria');
    });
  });

  next();
}
