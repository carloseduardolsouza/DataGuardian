import { S3StorageAdapter } from './s3-adapter';

export interface MinioAdapterConfig {
  endpoint: string;
  bucket: string;
  access_key: string;
  secret_key: string;
  use_ssl?: boolean;
}

export class MinioStorageAdapter extends S3StorageAdapter {
  readonly type = 'minio';

  constructor(config: MinioAdapterConfig) {
    const endpoint = config.endpoint.startsWith('http://') || config.endpoint.startsWith('https://')
      ? config.endpoint
      : `${config.use_ssl ? 'https' : 'http'}://${config.endpoint}`;

    super({
      bucket: config.bucket,
      region: 'us-east-1',
      endpoint,
      access_key_id: config.access_key,
      secret_access_key: config.secret_key,
      force_path_style: true,
      storage_class: 'STANDARD',
    });
  }
}
