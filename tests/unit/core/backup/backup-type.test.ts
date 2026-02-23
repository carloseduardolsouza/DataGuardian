import {
  resolveBackupTypeFromOptions,
  withNormalizedBackupType,
} from '../../../../src/core/backup/backup-type';

describe('backup type helpers', () => {
  it('resolves supported backup type from options', () => {
    expect(resolveBackupTypeFromOptions({ backup_type: 'full' })).toBe('full');
    expect(resolveBackupTypeFromOptions({ backup_type: 'incremental' })).toBe('incremental');
    expect(resolveBackupTypeFromOptions({ backup_type: 'differential' })).toBe('differential');
  });

  it('falls back to full for invalid backup type', () => {
    expect(resolveBackupTypeFromOptions({ backup_type: 'invalid' })).toBe('full');
    expect(resolveBackupTypeFromOptions({})).toBe('full');
  });

  it('returns options with normalized backup_type', () => {
    expect(withNormalizedBackupType({ compression: 'gzip' })).toEqual({
      compression: 'gzip',
      backup_type: 'full',
    });
  });
});
