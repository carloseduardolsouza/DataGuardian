import { NextFunction, Request, Response } from 'express';
import { AppError } from './error-handler';
import { consumeCriticalApprovalGrant } from '../models/critical-approval.model';
import { verifyUserPassword } from '../../core/auth/auth.service';
import { PERMISSIONS } from '../../core/auth/permissions';

interface CriticalApprovalOptions {
  action: string;
  actionLabel: string;
  resourceType?: string;
  resolveResourceId?: (req: Request) => string | null;
  enforceForAdmins?: boolean | ((req: Request, res: Response) => boolean | Promise<boolean>);
}

function readHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export function requireCriticalApproval(options: CriticalApprovalOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = res.locals.authUser as { id?: string; username?: string } | undefined;
      const permissions = res.locals.authPermissions as Set<string> | undefined;
      const actorUserId = String(authUser?.id ?? '').trim();
      if (!actorUserId) {
        throw new AppError('FORBIDDEN', 403, 'Usuario autenticado nao encontrado para validar aprovacao');
      }

      const enforceForAdmins = typeof options.enforceForAdmins === 'function'
        ? await options.enforceForAdmins(req, res)
        : Boolean(options.enforceForAdmins);

      // Admins bypass critical approval requirements.
      if (!enforceForAdmins && permissions?.has(PERMISSIONS.ACCESS_MANAGE)) {
        res.locals.criticalApproval = {
          mode: 'admin_bypass',
          action: options.action,
          resource_type: options.resourceType ?? null,
          resource_id: options.resolveResourceId ? options.resolveResourceId(req) : null,
        };
        next();
        return;
      }

      const resourceId = options.resolveResourceId ? options.resolveResourceId(req) : null;
      const resourceType = options.resourceType ?? null;

      const adminPassword = readHeaderValue(req.header('x-admin-password')).trim();
      if (adminPassword) {
        if (!permissions?.has(PERMISSIONS.ACCESS_MANAGE)) {
          throw new AppError('FORBIDDEN', 403, 'Somente admins podem usar senha administrativa');
        }

        const validPassword = await verifyUserPassword(actorUserId, adminPassword);
        if (!validPassword) {
          throw new AppError('ADMIN_PASSWORD_INVALID', 401, 'Senha administrativa invalida');
        }

        res.locals.criticalApproval = {
          mode: 'admin_password',
          action: options.action,
          resource_type: resourceType,
          resource_id: resourceId,
        };
        next();
        return;
      }

      const approvalRequestId = readHeaderValue(req.header('x-critical-approval-id')).trim();
      if (approvalRequestId) {
        await consumeCriticalApprovalGrant({
          approval_request_id: approvalRequestId,
          requester_user_id: actorUserId,
          action: options.action,
          resource_type: resourceType,
          resource_id: resourceId,
        });

        res.locals.criticalApproval = {
          mode: 'approval_request',
          approval_request_id: approvalRequestId,
          action: options.action,
          resource_type: resourceType,
          resource_id: resourceId,
        };
        next();
        return;
      }

      throw new AppError(
        'CRITICAL_OPERATION_APPROVAL_REQUIRED',
        428,
        'Esta operacao exige senha administrativa ou aprovacao previa',
        {
          action: options.action,
          action_label: options.actionLabel,
          resource_type: resourceType,
          resource_id: resourceId,
          required_headers: ['x-admin-password', 'x-critical-approval-id'],
        },
      );
    } catch (err) {
      next(err);
    }
  };
}
