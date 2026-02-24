import { BackupEngine, EngineRunCallbacks, getNumber, getRequiredString, spawnCommandToFile } from './base-engine';
import { Client as PostgresClient } from 'pg';
import { buildPostgresDumpRecoveryMessage, listContainerRuntimeCandidates } from './postgres-dump-strategy';

function parseServerMajorFromVersionNum(value: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed / 10000);
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
      if (!serverMajor) {
        throw new Error('Nao foi possivel identificar a major do servidor PostgreSQL');
      }
      callbacks?.onEngineLog?.(`[engine] Servidor PostgreSQL major detectado: ${serverMajor}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Falha ao detectar versao do servidor PostgreSQL antes do dump: ${message}`);
    } finally {
      await versionClient.end().catch(() => undefined);
    }

    const dockerTag = `${serverMajor}-alpine`;
    const dumpArgs = ['-h', host, '-p', String(port), '-U', username, '-d', database, '-F', 'c', '--verbose'];
    const runtimes = listContainerRuntimeCandidates();
    const dockerHost = host === 'localhost' || host === '127.0.0.1' || host === '::1'
      ? 'host.docker.internal'
      : host;

    const containerArgs = [
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
    let lastContainerError: string | undefined;
    let hasContainerRuntime = false;

    for (const runtime of runtimes) {
      callbacks?.onEngineLog?.(`[engine] Executando pg_dump via container runtime '${runtime}' (postgres:${dockerTag})`);
      try {
        await spawnCommandToFile({
          command: runtime,
          args: containerArgs,
          outputFile,
          allowAutoInstall: false,
          callbacks,
        });
        return { extension: '.dump' };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes(`Binario '${runtime}' nao encontrado no PATH`)) {
          continue;
        }
        hasContainerRuntime = true;
        lastContainerError = message;
        callbacks?.onEngineLog?.(`[engine] Runtime '${runtime}' falhou: ${message}`);
      }
    }

    callbacks?.onEngineLog?.('[engine] Nenhum runtime de container utilizavel. Aplicando fallback para pg_dump local compativel.');
    try {
      await spawnCommandToFile({
        command: 'pg_dump',
        args: dumpArgs,
        env: { ...process.env, PGPASSWORD: password },
        outputFile,
        preferredPostgresMajor: serverMajor,
        callbacks,
      });
      return { extension: '.dump' };
    } catch (err) {
      const localError = err instanceof Error ? err.message : String(err);
      throw new Error(buildPostgresDumpRecoveryMessage({
        serverMajor,
        attemptedRuntimes: runtimes,
        lastError: hasContainerRuntime && lastContainerError
          ? `${lastContainerError} | local: ${localError}`
          : localError,
      }));
    }
  }
}
