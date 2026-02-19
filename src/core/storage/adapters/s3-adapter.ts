import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  StorageClass,
} from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';
import type { StorageAdapter, StorageTestResult, UploadOptions, UploadResult } from './base-adapter';

export interface S3AdapterConfig {
  bucket: string;
  region: string;
  access_key_id: string;
  secret_access_key: string;
  endpoint?: string | null;
  storage_class?: string;
  force_path_style?: boolean;
}

export class S3StorageAdapter implements StorageAdapter {
  readonly type: string = 's3';

  protected readonly client: S3Client;
  protected readonly bucket: string;
  protected readonly storageClass: StorageClass;

  constructor(config: S3AdapterConfig) {
    this.bucket = config.bucket;
    this.storageClass = (config.storage_class ?? 'STANDARD') as StorageClass;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint ?? undefined,
      forcePathStyle: Boolean(config.force_path_style),
      credentials: {
        accessKeyId: config.access_key_id,
        secretAccessKey: config.secret_access_key,
      },
    });
  }

  async upload(localFilePath: string, relativePath: string, options?: UploadOptions): Promise<UploadResult> {
    const stat = await fs.stat(localFilePath);
    const src = createReadStream(localFilePath);
    const counter = new PassThrough();

    let transferred = 0;
    counter.on('data', (chunk: Buffer) => {
      transferred += chunk.length;
      options?.onProgress?.({
        transferredBytes: transferred,
        totalBytes: stat.size,
        percent: stat.size > 0 ? Math.min(100, (transferred / stat.size) * 100) : 100,
      });
    });

    src.pipe(counter);

    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: relativePath,
      Body: counter,
      StorageClass: this.storageClass,
    }));

    options?.onProgress?.({ transferredBytes: stat.size, totalBytes: stat.size, percent: 100 });

    return {
      backupPath: `s3://${this.bucket}/${relativePath}`,
      relativePath,
    };
  }

  async download(relativePath: string, localDestinationPath: string): Promise<void> {
    const result = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: relativePath,
    }));

    if (!result.Body) {
      throw new Error(`Arquivo '${relativePath}' nao retornou conteudo`);
    }

    const stream = result.Body as Readable;
    await fs.mkdir(dirname(localDestinationPath), { recursive: true });
    await pipeline(stream, createWriteStream(localDestinationPath));
  }

  async delete(relativePath: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: relativePath,
    }));
  }

  async list(prefix = ''): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;

    do {
      const page = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix || undefined,
        ContinuationToken: continuationToken,
      }));

      for (const obj of page.Contents ?? []) {
        if (obj.Key) keys.push(obj.Key);
      }

      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);

    return keys;
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: relativePath,
      }));
      return true;
    } catch {
      return false;
    }
  }

  async checkSpace(): Promise<number | null> {
    return null;
  }

  async testConnection(): Promise<StorageTestResult> {
    const startedAt = Date.now();
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    return {
      latencyMs: Date.now() - startedAt,
      availableSpaceGb: null,
    };
  }
}
