import { BackupEngine, EngineRunCallbacks, getRequiredString, spawnCommandToFile } from './base-engine';

export class FilesBackupEngine implements BackupEngine {
  readonly type = 'files';

  async dumpToFile(connectionConfig: unknown, outputFile: string, callbacks?: EngineRunCallbacks) {
    const cfg = (connectionConfig ?? {}) as Record<string, unknown>;
    const sourcePath = getRequiredString(cfg, 'source_path');

    await spawnCommandToFile({
      command: 'tar',
      args: ['-cf', outputFile, '-C', sourcePath, '.'],
      env: process.env,
      outputFile,
      callbacks,
    });

    return { extension: '.tar' };
  }
}
