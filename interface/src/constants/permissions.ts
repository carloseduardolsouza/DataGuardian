export const PERMISSIONS = {
  DASHBOARD_READ: 'dashboard.read',
  DATASOURCES_READ: 'datasources.read',
  STORAGE_READ: 'storage.read',
  BACKUP_JOBS_READ: 'backup_jobs.read',
  BACKUPS_READ: 'backups.read',
  BACKUPS_RESTORE: 'backups.restore',
  EXECUTIONS_READ: 'executions.read',
  BACKUPS_RESTORE_VERIFY: 'backups.restore_verify',
  HEALTH_READ: 'health.read',
  NOTIFICATIONS_READ: 'notifications.read',
  SYSTEM_READ: 'system.read',
  AUDIT_READ: 'audit.read',
  ACCESS_MANAGE: 'access.manage',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
