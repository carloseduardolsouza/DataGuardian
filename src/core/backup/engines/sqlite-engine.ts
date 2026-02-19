import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { BackupEngine, EngineRunCallbacks, getRequiredString } from './base-engine';

export class SqliteBackupEngine implements BackupEngine {
  readonly type = 'sqlite';

  async dumpToFile(connectionConfig: unknown, outputFile: string, callbacks?: EngineRunCallbacks) {
    const cfg = (connectionConfig ?? {}) as Record<string, unknown>;
    const filePath = getRequiredString(cfg, 'file_path');

    await fs.mkdir(path.dirname(outputFile), { recursive: true });
    await pipeline(createReadStream(filePath), createWriteStream(outputFile));

    const stat = await fs.stat(outputFile);
    callbacks?.onProgress?.(stat.size);

    return { extension: '.db' };
  }
}
