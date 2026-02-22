import {
  backupOptionsSchema,
  retentionPolicySchema,
} from '../../../src/types/backup.types';

describe('backup types schema', () => {
  it('accepts retention with max_backups', () => {
    const parsed = retentionPolicySchema.parse({
      max_backups: 3,
      auto_delete: true,
    });
    expect(parsed.max_backups).toBe(3);
  });

  it('rejects retention without max_backups or legacy fields', () => {
    const result = retentionPolicySchema.safeParse({
      auto_delete: true,
    });
    expect(result.success).toBe(false);
  });

  it('accepts backup options with storage targets', () => {
    const result = backupOptionsSchema.safeParse({
      compression: 'gzip',
      storage_strategy: 'replicate',
      storage_targets: [
        {
          storage_location_id: '11111111-1111-4111-8111-111111111111',
          order: 1,
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});
