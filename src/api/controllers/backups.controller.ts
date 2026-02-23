import { NextFunction, Request, Response } from 'express';
import {
  importAndRestoreBackupFile,
  listBackupDatasources,
  listBackupsByDatasource,
  listRestoreTargetDatasources,
  prepareBackupExecutionDownload,
  restoreBackupExecution,
} from '../models/backups.model';
import { AppError } from '../middlewares/error-handler';
import { PERMISSIONS } from '../../core/auth/permissions';
import { promises as fs } from 'node:fs';

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

  async restoreTargets(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await listRestoreTargetDatasources();
      res.json({ data });
    } catch (err) {
      next(err);
    }
  },

  async download(req: Request, res: Response, next: NextFunction) {
    try {
      const prepared = await prepareBackupExecutionDownload({
        executionId: String(req.params.executionId),
        storageLocationId: typeof req.query?.storage_location_id === 'string'
          ? req.query.storage_location_id
          : undefined,
      });

      const cleanup = async () => {
        await fs.rm(prepared.cleanup_dir, { recursive: true, force: true }).catch(() => undefined);
      };

      res.on('finish', () => { void cleanup(); });
      res.on('close', () => { void cleanup(); });
      res.download(prepared.file_path, prepared.file_name);
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
        targetDatasourceId: req.body?.target_datasource_id,
        dropExisting: req.body?.drop_existing,
        verificationMode,
        keepVerificationDatabase: req.body?.keep_verification_database,
      });
      res.status(202).json(result);
    } catch (err) {
      next(err);
    }
  },

  async importRestore(req: Request, res: Response, next: NextFunction) {
    try {
      const verificationMode = String(req.query?.verification_mode ?? 'false') === 'true';
      const confirmationPhrase = String(req.query?.confirmation_phrase ?? '').trim();
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

      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        throw new AppError('INVALID_UPLOAD', 422, 'Arquivo de backup nao enviado no corpo da requisicao');
      }

      const rawFileName = req.get('x-file-name') ?? 'restore-import.bin';
      const fileName = decodeURIComponent(rawFileName);

      const result = await importAndRestoreBackupFile({
        fileBuffer: req.body as Buffer,
        fileName,
        targetDatasourceId: String(req.query?.target_datasource_id),
        dropExisting: String(req.query?.drop_existing ?? 'true') === 'true',
        verificationMode,
        keepVerificationDatabase: String(req.query?.keep_verification_database ?? 'false') === 'true',
      });
      res.status(202).json(result);
    } catch (err) {
      next(err);
    }
  },
};
