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

    res.locals.authUser = session;
    res.locals.authPermissions = new Set(session.permissions);
    next();
  } catch (err) {
    next(err);
  }
}

export function requirePermission(permission: string) {
  return (_req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = res.locals.authUser as { username?: string } | undefined;
      const permissions = res.locals.authPermissions as Set<string> | undefined;
      if (!authUser?.username || !permissions?.has(permission)) {
        throw new AppError(
          'FORBIDDEN',
          403,
          'Voce nao possui permissao para executar esta acao',
          { required_permission: permission },
        );
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireAnyPermission(permissionList: string[]) {
  return (_req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = res.locals.authUser as { username?: string } | undefined;
      const permissions = res.locals.authPermissions as Set<string> | undefined;
      if (!authUser?.username || !permissions) {
        throw new AppError('FORBIDDEN', 403, 'Acesso negado');
      }
      if (permissionList.some((permission) => permissions.has(permission))) {
        next();
        return;
      }
      throw new AppError(
        'FORBIDDEN',
        403,
        'Voce nao possui permissao para executar esta acao',
        { required_any_permission: permissionList },
      );
    } catch (err) {
      next(err);
    }
  };
}
