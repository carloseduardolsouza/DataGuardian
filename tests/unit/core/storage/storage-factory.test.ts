import { createStorageAdapter } from '../../../../src/core/storage/storage-factory';

describe('storage factory', () => {
  it('creates local adapter', () => {
    const adapter = createStorageAdapter('local', { path: './tmp' });
    expect(adapter.type).toBe('local');
  });

  it('creates ssh adapter', () => {
    const adapter = createStorageAdapter('ssh', {
      host: '127.0.0.1',
      username: 'root',
      remote_path: '/backup',
    });
    expect(adapter.type).toBe('ssh');
  });

  it('creates s3-like adapters', () => {
    const s3 = createStorageAdapter('s3', {
      bucket: 'b',
      region: 'us-east-1',
      access_key_id: 'a',
      secret_access_key: 's',
    });
    const minio = createStorageAdapter('minio', {
      endpoint: 'http://localhost:9000',
      bucket: 'b',
      access_key: 'a',
      secret_key: 's',
    });
    const backblaze = createStorageAdapter('backblaze', {
      bucket_id: 'id',
      bucket_name: 'name',
      application_key_id: 'a',
      application_key: 's',
    });

    expect(s3.type).toBe('s3');
    expect(minio.type).toBe('minio');
    expect(backblaze.type).toBe('backblaze');
  });

  it('throws for unsupported type', () => {
    expect(() => createStorageAdapter('invalid' as any, {})).toThrow("Storage type 'invalid' nao suportado");
  });
});
