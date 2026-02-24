import { BackupEngine, EngineRunCallbacks, getNumber, getRequiredString, spawnCommandToFile } from './base-engine';
import { Client as PostgresClient } from 'pg';

function parseServerMajorFromVersionNum(value: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed / 10000);
}

function shouldFallbackToDocker(message: string) {
  return message.includes("Binario 'pg_dump' nao encontrado no PATH")
    || /incompatibilidade de vers[aã]o do servidor/i.test(message)
    || /aborting because of server version mismatch/i.test(message)
    || /server version/i.test(message) && /pg_dump version/i.test(message);
}

export class PostgresBackupEngine implements BackupEngine {
  readonly type = 'postgres';

  async dumpToFile(connectionConfig: unknown, outputFile: string, callbacks?: EngineRunCallbacks) {
    const cfg = (connectionConfig ?? {}) as Record<string, unknown>;

    const host = getRequiredString(cfg, 'host');
    const port = getNumber(cfg, 'port', 5432);
    const database = getRequiredString(cfg, 'database');
    const username = getRequiredString(cfg, 'username');
    const password = getRequiredString(cfg, 'password');
    const maintenanceDatabase = typeof cfg.maintenance_database === 'string' && cfg.maintenance_database.trim()
      ? cfg.maintenance_database.trim()
      : database;

    const args = ['-h', host, '-p', String(port), '-U', username, '-d', database, '-F', 'c', '--verbose'];
    let serverMajor: number | null = null;

    const versionClient = new PostgresClient({
      host,
      port,
      user: username,
      password,
      database: maintenanceDatabase,
    });

    try {
      await versionClient.connect();
      const result = await versionClient.query<{ server_version_num: string }>('SHOW server_version_num');
      const versionNum = result.rows[0]?.server_version_num;
      serverMajor = versionNum ? parseServerMajorFromVersionNum(versionNum) : null;
      if (serverMajor) {
        callbacks?.onEngineLog?.(`[engine] Servidor PostgreSQL major detectado: ${serverMajor}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      callbacks?.onEngineLog?.(`[engine] Nao foi possivel detectar versao do servidor antes do dump: ${message}`);
    } finally {
      await versionClient.end().catch(() => undefined);
    }

    try {
      await spawnCommandToFile({
        command: 'pg_dump',
        args,
        env: { ...process.env, PGPASSWORD: password },
        outputFile,
        preferredPostgresMajor: serverMajor ?? undefined,
        callbacks,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!shouldFallbackToDocker(message)) {
        throw err;
      }

      const dockerTag = `${serverMajor ?? 16}-alpine`;
      callbacks?.onEngineLog?.(`[engine] pg_dump local indisponivel/incompativel. Tentando fallback via Docker (postgres:${dockerTag})...`);

      const dockerHost = host === 'localhost' || host === '127.0.0.1' || host === '::1'
        ? 'host.docker.internal'
        : host;

      const dockerArgs = [
        'run',
        '--rm',
        ...(process.platform === 'linux' ? ['--add-host=host.docker.internal:host-gateway'] : []),
        '-e', `PGPASSWORD=${password}`,
        `postgres:${dockerTag}`,
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
