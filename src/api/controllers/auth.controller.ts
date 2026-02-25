import { Request, Response, NextFunction } from 'express';
import { config } from '../../utils/config';
import {
  AUTH_COOKIE_NAME,
  SESSION_TTL_MS,
  clearAuthSession,
  clearExpiredAuthSessions,
  getSessionUserByToken,
  hasConfiguredUser,
  loginWithPassword,
  setupInitialUser,
} from '../../core/auth/auth.service';
import { createAuditLog, extractAuditContextFromRequest } from '../models/audit-log.model';

function isSecureCookieEnabled(req: Request) {
  const envValue = process.env.AUTH_COOKIE_SECURE?.trim().toLowerCase();
  if (envValue === 'true' || envValue === '1') return true;
  if (envValue === 'false' || envValue === '0') return false;

  // Auto mode:
  // - true in production only when request is HTTPS (direct or behind proxy).
  // - false for plain HTTP (common in LAN/VPS without TLS termination).
  if (config.env !== 'production') return false;
  if (req.secure) return true;
  const forwardedProto = req.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  return forwardedProto === 'https';
}

function cookieOptions(req: Request) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isSecureCookieEnabled(req),
    path: '/',
    maxAge: SESSION_TTL_MS,
  };
}

function requestMeta(req: Request) {
  const rawUserAgent = req.get('user-agent');
  return {
    ip: req.ip ?? null,
    userAgent: rawUserAgent ? rawUserAgent : null,
  };
}

export const AuthController = {
  async status(req: Request, res: Response, next: NextFunction) {
    try {
      await clearExpiredAuthSessions();
      const hasUser = await hasConfiguredUser();
      const token = req.cookies?.[AUTH_COOKIE_NAME] as string | undefined;
      const session = await getSessionUserByToken(token);

      if (!session && token) {
        res.clearCookie(AUTH_COOKIE_NAME, { path: '/' });
      }

      res.json({
        has_user: hasUser,
        authenticated: Boolean(session),
        user: session,
      });
    } catch (err) {
      next(err);
    }
  },

  async setup(req: Request, res: Response, next: NextFunction) {
    try {
      const { username, password } = req.body as { username: string; password: string };
      const session = await setupInitialUser({ username, password }, requestMeta(req));
      await createAuditLog({
        ...extractAuditContextFromRequest(req, session.user),
        action: 'auth.setup',
        resource_type: 'user',
        resource_id: session.user.id,
        changes: { created_username: session.user.username },
      });
      res.cookie(AUTH_COOKIE_NAME, session.token, cookieOptions(req));

      res.status(201).json({
        message: 'Usuario inicial criado com sucesso',
        user: session.user,
      });
    } catch (err) {
      next(err);
    }
  },

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { username, password } = req.body as { username: string; password: string };
      const session = await loginWithPassword({ username, password }, requestMeta(req));
      await createAuditLog({
        ...extractAuditContextFromRequest(req, session.user),
        action: 'auth.login',
        resource_type: 'user',
        resource_id: session.user.id,
      });
      res.cookie(AUTH_COOKIE_NAME, session.token, cookieOptions(req));

      res.json({
        message: 'Login efetuado com sucesso',
        user: session.user,
      });
    } catch (err) {
      next(err);
    }
  },

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const token = req.cookies?.[AUTH_COOKIE_NAME] as string | undefined;
      await createAuditLog({
        ...extractAuditContextFromRequest(req, res.locals.authUser),
        action: 'auth.logout',
        resource_type: 'user',
        resource_id: String(res.locals.authUser?.id ?? ''),
      });
      await clearAuthSession(token);
      res.clearCookie(AUTH_COOKIE_NAME, { path: '/' });
      res.json({ message: 'Logout efetuado com sucesso' });
    } catch (err) {
      next(err);
    }
  },

  async me(_req: Request, res: Response, next: NextFunction) {
    try {
      const user = res.locals.authUser;
      res.json({ user });
    } catch (err) {
      next(err);
    }
  },
};
