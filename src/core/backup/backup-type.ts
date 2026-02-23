export type BackupTypeValue = 'full' | 'incremental' | 'differential';

export function resolveBackupTypeFromOptions(
  backupOptions: unknown,
  fallback: BackupTypeValue = 'full',
): BackupTypeValue {
  const opts = (backupOptions ?? {}) as Record<string, unknown>;
  const raw = String(opts.backup_type ?? fallback).toLowerCase();
  if (raw === 'incremental' || raw === 'differential' || raw === 'full') {
    return raw;
  }
  return fallback;
}

export function withNormalizedBackupType(backupOptions: unknown) {
  const opts = (backupOptions ?? {}) as Record<string, unknown>;
  return {
    ...opts,
    backup_type: resolveBackupTypeFromOptions(opts),
  };
}
