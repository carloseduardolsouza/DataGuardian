import { S3StorageAdapter } from './s3-adapter';

export interface BackblazeAdapterConfig {
  bucket_id: string;
  bucket_name: string;
  application_key_id: string;
  application_key: string;
  region?: string;
  endpoint?: string;
}

export class BackblazeStorageAdapter extends S3StorageAdapter {
  readonly type = 'backblaze';

  constructor(config: BackblazeAdapterConfig) {
    const region = config.region ?? 'us-west-002';
    const endpoint = config.endpoint ?? `https://s3.${region}.backblazeb2.com`;

    super({
      bucket: config.bucket_name,
      region,
      endpoint,
      access_key_id: config.application_key_id,
      secret_access_key: config.application_key,
      force_path_style: true,
      storage_class: 'STANDARD',
    });
  }
}
