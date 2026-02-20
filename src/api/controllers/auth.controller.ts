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

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.env === 'production',
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
      res.cookie(AUTH_COOKIE_NAME, session.token, cookieOptions());

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
      res.cookie(AUTH_COOKIE_NAME, session.token, cookieOptions());

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
