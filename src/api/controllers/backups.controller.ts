import { NextFunction, Request, Response } from 'express';
import {
  listBackupDatasources,
  listBackupsByDatasource,
  restoreBackupExecution,
} from '../models/backups.model';
import { AppError } from '../middlewares/error-handler';
import { PERMISSIONS } from '../../core/auth/permissions';

export const BackupsController = {
  async datasources(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await listBackupDatasources();
      res.json({ data });
    } catch (err) {
      next(err);
    }
  },

  async byDatasource(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await listBackupsByDatasource(String(req.params.datasourceId));
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  async restore(req: Request, res: Response, next: NextFunction) {
    try {
      const verificationMode = Boolean(req.body?.verification_mode);
      const confirmationPhrase = String(req.body?.confirmation_phrase ?? '').trim();
      const requiredPhrase = verificationMode ? 'VERIFICAR RESTORE' : 'RESTAURAR';

      if (confirmationPhrase !== requiredPhrase) {
        throw new AppError(
          'RESTORE_CONFIRMATION_REQUIRED',
          422,
          `Confirmacao invalida. Digite '${requiredPhrase}' para continuar.`,
          { expected_phrase: requiredPhrase },
        );
      }

      if (verificationMode) {
        const permissions = res.locals.authPermissions as Set<string> | undefined;
        if (!permissions?.has(PERMISSIONS.BACKUPS_RESTORE_VERIFY)) {
          throw new AppError(
            'FORBIDDEN',
            403,
            'Voce nao possui permissao para executar restore em modo de verificacao',
            { required_permission: PERMISSIONS.BACKUPS_RESTORE_VERIFY },
          );
        }
      }

      const result = await restoreBackupExecution({
        executionId: String(req.params.executionId),
        storageLocationId: req.body?.storage_location_id,
        dropExisting: req.body?.drop_existing,
        verificationMode,
        keepVerificationDatabase: req.body?.keep_verification_database,
      });
      res.status(202).json(result);
    } catch (err) {
      next(err);
    }
  },
};
