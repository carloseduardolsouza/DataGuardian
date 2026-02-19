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

    try {
      await spawnCommandToFile({
        command: 'pg_dump',
        args,
        env: { ...process.env, PGPASSWORD: password },
        outputFile,
        callbacks,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("Binario 'pg_dump' nao encontrado no PATH")) {
        throw err;
      }

      callbacks?.onEngineLog?.('[engine] pg_dump local ausente. Tentando fallback via Docker...');

      const dockerHost = host === 'localhost' || host === '127.0.0.1' || host === '::1'
        ? 'host.docker.internal'
        : host;

      const dockerArgs = [
        'run',
        '--rm',
        ...(process.platform === 'linux' ? ['--add-host=host.docker.internal:host-gateway'] : []),
        '-e', `PGPASSWORD=${password}`,
        'postgres:16-alpine',
        'pg_dump',
        '-h', dockerHost,
        '-p', String(port),
        '-U', username,
        '-d', database,
        '-F', 'c',
        '--verbose',
      ];

      await spawnCommandToFile({
        command: 'docker',
        args: dockerArgs,
        outputFile,
        callbacks,
      });
    }

    return { extension: '.dump' };
  }
}
