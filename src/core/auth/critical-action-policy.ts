import type { PermissionKey } from './permissions';
import { PERMISSIONS } from './permissions';

export const CRITICAL_ACTION_PERMISSION_MAP = {
  'datasource.delete': PERMISSIONS.DATASOURCES_WRITE,
  'storage.delete': PERMISSIONS.STORAGE_WRITE,
  'storage.path.delete': PERMISSIONS.STORAGE_WRITE,
  'backup_job.delete': PERMISSIONS.BACKUP_JOBS_WRITE,
  'backup_job.run': PERMISSIONS.BACKUP_JOBS_RUN,
  'db_sync_job.delete': PERMISSIONS.DB_SYNC_JOBS_WRITE,
  'db_sync_job.run': PERMISSIONS.DB_SYNC_JOBS_RUN,
  'execution.delete': PERMISSIONS.EXECUTIONS_CONTROL,
  'backup.restore': PERMISSIONS.BACKUPS_RESTORE,
  'backup.import_restore': PERMISSIONS.BACKUPS_RESTORE,
  'audit_logs.cleanup': PERMISSIONS.AUDIT_READ,
} as const satisfies Record<string, PermissionKey>;

export type CriticalActionKey = keyof typeof CRITICAL_ACTION_PERMISSION_MAP;

export const CRITICAL_ACTION_KEYS = Object.keys(CRITICAL_ACTION_PERMISSION_MAP) as CriticalActionKey[];

export function getRequiredPermissionForCriticalAction(action: string): PermissionKey | null {
  return CRITICAL_ACTION_PERMISSION_MAP[action as CriticalActionKey] ?? null;
}
