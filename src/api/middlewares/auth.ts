import { Request, Response, NextFunction } from 'express';
import { AppError } from './error-handler';
import { AUTH_COOKIE_NAME, getSessionUserByToken } from '../../core/auth/auth.service';
import { createAuditLog, extractAuditContextFromRequest } from '../models/audit-log.model';
import { resolveScopedAccess, type ScopeResourceType } from '../../core/auth/scope.service';

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

interface ScopeRequirement {
  resource_type: ScopeResourceType;
  resource_id?: string | null;
}

type ScopedPermissionResolver =
  | ScopeRequirement
  | ScopeRequirement[]
  | ((req: Request) => ScopeRequirement | ScopeRequirement[] | Promise<ScopeRequirement | ScopeRequirement[]>);

function getScopeStorage(res: Response) {
  const current = (res.locals.scopeFilters ?? {}) as Record<string, string[]>;
  res.locals.scopeFilters = current;
  return current;
}

function normalizeRequirements(
  resolver: ScopedPermissionResolver,
  req: Request,
): Promise<ScopeRequirement[]> {
  const resolved = typeof resolver === 'function' ? resolver(req) : resolver;
  return Promise.resolve(resolved).then((value) => Array.isArray(value) ? value : [value]);
}

export function getScopedFilter(
  res: Response,
  permission: string,
  resourceType: ScopeResourceType,
) {
  const storage = getScopeStorage(res);
  const key = `${permission}::${resourceType}`;
  const value = storage[key];
  return Array.isArray(value) ? value : undefined;
}

export function requireScopedPermission(permission: string, resolver: ScopedPermissionResolver) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = res.locals.authUser as { id?: string; username?: string } | undefined;
      const permissions = res.locals.authPermissions as Set<string> | undefined;

      if (!authUser?.id || !authUser?.username || !permissions?.has(permission)) {
        throw new AppError(
          'FORBIDDEN',
          403,
          'Voce nao possui permissao para executar esta acao',
          { required_permission: permission },
        );
      }

      const requirements = await normalizeRequirements(resolver, req);
      const scopeStorage = getScopeStorage(res);

      for (const item of requirements) {
        const decision = await resolveScopedAccess({
          user_id: authUser.id,
          permission_key: permission,
          resource_type: item.resource_type,
          resource_id: item.resource_id ?? undefined,
        });

        if (!decision.has_scoped_rules) continue;

        if (item.resource_id) {
          if (!decision.allowed) {
            await createAuditLog({
              ...extractAuditContextFromRequest(req, authUser),
              action: 'access.scope.deny',
              resource_type: item.resource_type,
              resource_id: item.resource_id,
              metadata: {
                permission,
                reason: 'resource_not_allowed_by_scope',
              },
            });
            throw new AppError(
              'FORBIDDEN',
              403,
              'Voce nao possui escopo para executar esta acao no recurso informado',
              {
                required_permission: permission,
                resource_type: item.resource_type,
                resource_id: item.resource_id,
              },
            );
          }
          continue;
        }

        const key = `${permission}::${item.resource_type}`;
        scopeStorage[key] = decision.allowed_resource_ids;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireRole(roleName: string) {
  return (_req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = res.locals.authUser as { username?: string; roles?: string[] } | undefined;
      const roles = Array.isArray(authUser?.roles) ? authUser.roles : [];
      if (!authUser?.username || !roles.includes(roleName)) {
        throw new AppError(
          'FORBIDDEN',
          403,
          'Voce nao possui role para executar esta acao',
          { required_role: roleName },
        );
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
