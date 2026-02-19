import type { StorageLocationType } from '@prisma/client';
import type { StorageAdapter } from './adapters/base-adapter';
import { LocalStorageAdapter } from './adapters/local-adapter';
import { SSHStorageAdapter } from './adapters/ssh-adapter';
import { S3StorageAdapter } from './adapters/s3-adapter';
import { MinioStorageAdapter } from './adapters/minio-adapter';
import { BackblazeStorageAdapter } from './adapters/backblaze-adapter';

export function createStorageAdapter(type: StorageLocationType, config: unknown): StorageAdapter {
  const cfg = (config ?? {}) as Record<string, unknown>;

  switch (type) {
    case 'local':
      return new LocalStorageAdapter({
        path: String(cfg.path ?? ''),
        max_size_gb: typeof cfg.max_size_gb === 'number' ? cfg.max_size_gb : undefined,
      });

    case 'ssh':
      return new SSHStorageAdapter({
        host: String(cfg.host ?? ''),
        port: Number(cfg.port ?? 22),
        username: String(cfg.username ?? ''),
        password: typeof cfg.password === 'string' ? cfg.password : undefined,
        private_key: typeof cfg.private_key === 'string' ? cfg.private_key : undefined,
        remote_path: String(cfg.remote_path ?? ''),
      });

    case 's3':
      return new S3StorageAdapter({
        bucket: String(cfg.bucket ?? ''),
        region: String(cfg.region ?? 'us-east-1'),
        endpoint: typeof cfg.endpoint === 'string' ? cfg.endpoint : null,
        access_key_id: String(cfg.access_key_id ?? ''),
        secret_access_key: String(cfg.secret_access_key ?? ''),
        storage_class: typeof cfg.storage_class === 'string' ? cfg.storage_class : undefined,
      });

    case 'minio':
      return new MinioStorageAdapter({
        endpoint: String(cfg.endpoint ?? ''),
        bucket: String(cfg.bucket ?? ''),
        access_key: String(cfg.access_key ?? ''),
        secret_key: String(cfg.secret_key ?? ''),
        use_ssl: Boolean(cfg.use_ssl),
      });

    case 'backblaze':
      return new BackblazeStorageAdapter({
        bucket_id: String(cfg.bucket_id ?? ''),
        bucket_name: String(cfg.bucket_name ?? ''),
        application_key_id: String(cfg.application_key_id ?? ''),
        application_key: String(cfg.application_key ?? ''),
        region: typeof cfg.region === 'string' ? cfg.region : undefined,
        endpoint: typeof cfg.endpoint === 'string' ? cfg.endpoint : undefined,
      });

    default:
      throw new Error(`Storage type '${type}' nao suportado`);
  }
}
