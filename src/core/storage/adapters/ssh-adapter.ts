import SftpClient from 'ssh2-sftp-client';
import { createReadStream, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Transform } from 'node:stream';
import type { StorageAdapter, StorageTestResult, UploadOptions, UploadResult } from './base-adapter';

export interface SSHAdapterConfig {
  host: string;
  port?: number;
  username: string;
  password?: string;
  private_key?: string;
  remote_path: string;
}

export class SSHStorageAdapter implements StorageAdapter {
  readonly type = 'ssh';

  constructor(private readonly config: SSHAdapterConfig) {}

  private async withClient<T>(runner: (client: SftpClient) => Promise<T>) {
    const client = new SftpClient();
    try {
      await client.connect({
        host: this.config.host,
        port: this.config.port ?? 22,
        username: this.config.username,
        password: this.config.password,
        privateKey: this.config.private_key,
        readyTimeout: 15000,
      });
      return await runner(client);
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  private resolveRemotePath(relativePath: string) {
    const sanitized = relativePath.replace(/\\/g, '/');
    return path.posix.join(this.config.remote_path, sanitized);
  }

  async upload(localFilePath: string, relativePath: string, options?: UploadOptions): Promise<UploadResult> {
    const remotePath = this.resolveRemotePath(relativePath);
    const remoteDir = path.posix.dirname(remotePath);
    const stat = await fs.stat(localFilePath);

    await this.withClient(async (client) => {
      await client.mkdir(remoteDir, true);

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

      await client.put(createReadStream(localFilePath).pipe(progress), remotePath);
    });

    options?.onProgress?.({ transferredBytes: stat.size, totalBytes: stat.size, percent: 100 });

    return {
      backupPath: `ssh://${this.config.host}:${this.config.port ?? 22}${remotePath}`,
      relativePath,
    };
  }

  async download(relativePath: string, localDestinationPath: string): Promise<void> {
    const remotePath = this.resolveRemotePath(relativePath);
    await fs.mkdir(path.dirname(localDestinationPath), { recursive: true });

    await this.withClient(async (client) => {
      await client.fastGet(remotePath, localDestinationPath);
    });
  }

  async delete(relativePath: string): Promise<void> {
    const remotePath = this.resolveRemotePath(relativePath);
    await this.withClient(async (client) => {
      await client.delete(remotePath, true).catch(() => undefined);
    });
  }

  async list(prefix = ''): Promise<string[]> {
    const remotePrefix = this.resolveRemotePath(prefix);

    return this.withClient(async (client) => {
      const result: string[] = [];

      const walk = async (directory: string) => {
        const entries = await client.list(directory).catch(() => []);
        for (const entry of entries) {
          const fullPath = path.posix.join(directory, entry.name);
          if (entry.type === 'd') {
            await walk(fullPath);
          } else {
            const relative = path.posix.relative(this.config.remote_path, fullPath);
            result.push(relative);
          }
        }
      };

      await walk(remotePrefix);
      return result.sort();
    });
  }

  async exists(relativePath: string): Promise<boolean> {
    const remotePath = this.resolveRemotePath(relativePath);

    return this.withClient(async (client) => {
      const exists = await client.exists(remotePath);
      return exists === '-' || exists === 'l';
    });
  }

  async checkSpace(): Promise<number | null> {
    return null;
  }

  async testConnection(): Promise<StorageTestResult> {
    const startedAt = Date.now();

    await this.withClient(async (client) => {
      await client.mkdir(this.config.remote_path, true);
      const exists = await client.exists(this.config.remote_path);
      if (!exists) {
        throw new Error(`Diretorio remoto '${this.config.remote_path}' nao encontrado`);
      }
    });

    return {
      latencyMs: Date.now() - startedAt,
      availableSpaceGb: null,
    };
  }
}
