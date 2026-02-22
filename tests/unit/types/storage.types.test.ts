import {
  createStorageLocationSchema,
  localConfigSchema,
  s3ConfigSchema,
  sshConfigSchema,
} from '../../../src/types/storage.types';

describe('storage types schema', () => {
  it('validates local config', () => {
    expect(localConfigSchema.safeParse({ path: '/tmp/backups' }).success).toBe(true);
  });

  it('requires ssh auth via password or private key', () => {
    const result = sshConfigSchema.safeParse({
      host: 'localhost',
      port: 22,
      username: 'root',
      remote_path: '/backup',
    });
    expect(result.success).toBe(false);
  });

  it('validates s3 config', () => {
    const result = s3ConfigSchema.safeParse({
      bucket: 'my-bucket',
      region: 'us-east-1',
      access_key_id: 'abc',
      secret_access_key: 'def',
    });
    expect(result.success).toBe(true);
  });

  it('validates create storage schema based on type', () => {
    const result = createStorageLocationSchema.safeParse({
      name: 'S3 Primary',
      type: 's3',
      config: {
        bucket: 'my-bucket',
        region: 'us-east-1',
        access_key_id: 'abc',
        secret_access_key: 'def',
      },
      is_default: true,
    });

    expect(result.success).toBe(true);
  });
});
