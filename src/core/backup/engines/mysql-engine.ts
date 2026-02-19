import { BackupEngine, EngineRunCallbacks, getNumber, getRequiredString, spawnCommandToFile } from './base-engine';

export class MysqlBackupEngine implements BackupEngine {
  readonly type = 'mysql';

  async dumpToFile(connectionConfig: unknown, outputFile: string, callbacks?: EngineRunCallbacks) {
    const cfg = (connectionConfig ?? {}) as Record<string, unknown>;

    const host = getRequiredString(cfg, 'host');
    const port = getNumber(cfg, 'port', 3306);
    const database = getRequiredString(cfg, 'database');
    const username = getRequiredString(cfg, 'username');
    const password = getRequiredString(cfg, 'password');

    const args = [
      '-h', host,
      '-P', String(port),
      '-u', username,
      '--single-transaction',
      '--routines',
      '--triggers',
      '--events',
      '--verbose',
      database,
    ];

    await spawnCommandToFile({
      command: 'mysqldump',
      args,
      env: { ...process.env, MYSQL_PWD: password },
      outputFile,
      callbacks,
    });

    return { extension: '.sql' };
  }
}
