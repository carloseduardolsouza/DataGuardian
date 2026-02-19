import { BackupEngine, EngineRunCallbacks, getNumber, getRequiredString, spawnCommandToFile } from './base-engine';

export class PostgresBackupEngine implements BackupEngine {
  readonly type = 'postgres';

  async dumpToFile(connectionConfig: unknown, outputFile: string, callbacks?: EngineRunCallbacks) {
    const cfg = (connectionConfig ?? {}) as Record<string, unknown>;

    const host = getRequiredString(cfg, 'host');
    const port = getNumber(cfg, 'port', 5432);
    const database = getRequiredString(cfg, 'database');
    const username = getRequiredString(cfg, 'username');
    const password = getRequiredString(cfg, 'password');

    const args = ['-h', host, '-p', String(port), '-U', username, '-d', database, '-F', 'c', '--verbose'];

    await spawnCommandToFile({
      command: 'pg_dump',
      args,
      env: { ...process.env, PGPASSWORD: password },
      outputFile,
      callbacks,
    });

    return { extension: '.dump' };
  }
}
