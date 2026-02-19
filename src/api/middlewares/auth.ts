import { Request, Response, NextFunction } from 'express';
import { AppError } from './error-handler';
import { AUTH_COOKIE_NAME, getSessionUserByToken } from '../../core/auth/auth.service';

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[AUTH_COOKIE_NAME] as string | undefined;
    const session = await getSessionUserByToken(token);

    if (!session) {
      throw new AppError('UNAUTHORIZED', 401, 'Sessao invalida ou expirada');
    }

    res.locals.authUser = { username: session.username };
    next();
  } catch (err) {
    next(err);
  }
}
