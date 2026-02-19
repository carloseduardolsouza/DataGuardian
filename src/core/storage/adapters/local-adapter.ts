import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import type { StorageAdapter, StorageTestResult, UploadOptions, UploadResult } from './base-adapter';

export interface LocalAdapterConfig {
  path: string;
  max_size_gb?: number;
}

export class LocalStorageAdapter implements StorageAdapter {
  readonly type = 'local';

  constructor(private readonly config: LocalAdapterConfig) {}

  async upload(localFilePath: string, relativePath: string, options?: UploadOptions): Promise<UploadResult> {
    const destination = path.join(this.config.path, ...relativePath.split('/'));
    await fs.mkdir(path.dirname(destination), { recursive: true });

    const stat = await fs.stat(localFilePath);
    let transferred = 0;

    const progress = new Transform({
      transform: (chunk, _enc, callback) => {
        transferred += chunk.length;
        options?.onProgress?.({
          transferredBytes: transferred,
          totalBytes: stat.size,
          percent: stat.size > 0 ? Math.min(100, (transferred / stat.size) * 100) : 100,
        });
        callback(null, chunk);
      },
    });

    await pipeline(
      createReadStream(localFilePath),
      progress,
      createWriteStream(destination),
    );

    options?.onProgress?.({ transferredBytes: stat.size, totalBytes: stat.size, percent: 100 });

    return {
      backupPath: destination,
      relativePath,
    };
  }

  async download(relativePath: string, localDestinationPath: string): Promise<void> {
    const origin = path.join(this.config.path, ...relativePath.split('/'));
    await fs.mkdir(path.dirname(localDestinationPath), { recursive: true });
    await fs.copyFile(origin, localDestinationPath);
  }

  async delete(relativePath: string): Promise<void> {
    const target = path.join(this.config.path, ...relativePath.split('/'));
    await fs.rm(target, { force: true });
  }

  async list(prefix = ''): Promise<string[]> {
    const root = path.join(this.config.path, ...prefix.split('/').filter(Boolean));
    const results: string[] = [];

    const walk = async (directory: string) => {
      const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
          continue;
        }
        const rel = path.relative(this.config.path, fullPath).split(path.sep).join('/');
        results.push(rel);
      }
    };

    await walk(root);
    return results.sort();
  }

  async exists(relativePath: string): Promise<boolean> {
    const fullPath = path.join(this.config.path, ...relativePath.split('/'));
    try {
      await fs.access(fullPath);
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
    await fs.mkdir(this.config.path, { recursive: true });
    const stat = await fs.stat(this.config.path);
    if (!stat.isDirectory()) {
      throw new Error(`Path '${this.config.path}' nao e um diretorio valido`);
    }

    return {
      latencyMs: Date.now() - startedAt,
      availableSpaceGb: await this.checkSpace(),
    };
  }
}
