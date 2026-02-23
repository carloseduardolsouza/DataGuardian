import { spawn } from 'node:child_process';
import { createReadStream, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { DatasourceType, Prisma, StorageLocationType } from '@prisma/client';
import { Client as PostgresClient } from 'pg';
import { createConnection as createMysqlConnection } from 'mysql2/promise';
import { prisma } from '../../lib/prisma';
import { bigIntToSafe } from '../../utils/config';
import { AppError } from '../middlewares/error-handler';
import { createStorageAdapter } from '../../core/storage/storage-factory';
import { resolveBinaryPath } from '../../core/backup/engines/base-engine';
import { logger } from '../../utils/logger';
import { config } from '../../utils/config';
import { normalizeLocalStoragePath } from '../../utils/runtime';
import { materializeExecutionRawSnapshot } from '../../core/backup/execution-artifacts';
import { ensureRedisAvailable } from '../../queue/redis-client';
import { enqueueRestoreExecution } from '../../queue/queues';
import { prepareStorageFileDownload } from './storage-location.model';

type StorageBackupStatus = 'available' | 'missing' | 'unreachable' | 'unknown';
type ExecutionLogLevel = 'info' | 'warn' | 'error' | 'debug' | 'success';

interface StorageRefRaw {
  storage_location_id: string;
  backup_path: string | null;
}

interface ExecutionLogEntry {
  ts: string;
  level: ExecutionLogLevel;
  message: string;
}

interface StorageSnapshotEntry {
  storage_location_id: string;
  storage_name: string;
  storage_type: StorageLocationType | null;
  configured_status: 'healthy' | 'full' | 'unreachable';
  backup_path: string | null;
  relative_path: string | null;
  status: StorageBackupStatus;
  message: string | null;
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v.length > 0 ? v : null;
}

function getMetadataStorageRefs(metadata: unknown): StorageRefRaw[] {
  const obj = asObject(metadata);
  const raw = obj.storage_successes;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      const entry = asObject(item);
      const storageId = asString(entry.storage_location_id);
      const backupPath = asString(entry.backup_path);
      if (!storageId) return null;
      return {
        storage_location_id: storageId,
        backup_path: backupPath,
      };
    })
    .filter((item): item is StorageRefRaw => item !== null);
}

function getUploadContextBackupRelativePath(metadata: unknown) {
  const obj = asObject(metadata);
  const uploadContext = asObject(obj.upload_context);
  return asString(uploadContext.backup_relative_path);
}

function normalizeSlash(value: string) {
  return value.replace(/\\/g, '/');
}

function looksLikeUri(value: string) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}

function trimLeadingSlash(value: string) {
  return value.replace(/^\/+/, '');
}

function inferRelativePathFromBackupPath(
  storageType: StorageLocationType,
  backupPath: string | null,
  storageConfig: unknown,
): string | null {
  if (!backupPath) return null;

  const normalized = normalizeSlash(backupPath);
  const config = asObject(storageConfig);

  if (!looksLikeUri(normalized) && !path.isAbsolute(backupPath) && !/^[A-Za-z]:[\\/]/.test(backupPath)) {
    return trimLeadingSlash(normalized);
  }

  if (storageType === 'local') {
    const localBase = asString(config.path);
    if (!localBase) return null;

    const base = normalizeSlash(normalizeLocalStoragePath(localBase)).replace(/\/+$/, '');
    if (normalized.startsWith(`${base}/`)) {
      return trimLeadingSlash(normalized.slice(base.length + 1));
    }
    return null;
  }

  if (storageType === 'ssh') {
    const remoteBase = normalizeSlash(asString(config.remote_path) ?? '').replace(/\/+$/, '');
    const sshMatch = normalized.match(/^ssh:\/\/[^/]+(\/.+)$/i);
    const remotePath = sshMatch ? sshMatch[1] : normalized;
    if (!remotePath) return null;
    if (!remoteBase) return trimLeadingSlash(remotePath);
    const prefixed = remoteBase.startsWith('/') ? remoteBase : `/${remoteBase}`;
    if (remotePath.startsWith(`${prefixed}/`)) {
      return trimLeadingSlash(remotePath.slice(prefixed.length + 1));
    }
    return trimLeadingSlash(remotePath);
  }

  if (storageType === 's3' || storageType === 'minio' || storageType === 'backblaze') {
    const uriMatch = normalized.match(/^[a-z][a-z0-9+.-]*:\/\/[^/]+\/(.+)$/i);
    if (uriMatch?.[1]) return trimLeadingSlash(uriMatch[1]);
  }

  return null;
}

function requireConnectionString(cfg: Record<string, unknown>, key: string) {
  const value = asString(cfg[key]);
  if (!value) {
    throw new AppError('INVALID_CONNECTION_CONFIG', 422, `Campo de conexao invalido: ${key}`);
  }
  return value;
}

function requireConnectionNumber(cfg: Record<string, unknown>, key: string, fallback: number) {
  const raw = cfg[key];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new AppError('INVALID_CONNECTION_CONFIG', 422, `Campo de conexao invalido: ${key}`);
  }
  return Math.trunc(parsed);
}

async function runSpawnCommand(params: {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  inputFile?: string;
  onLog?: (line: string) => void;
}) {
  const commandPath = await resolveBinaryPath(
    params.command,
    true,
    (line) => params.onLog?.(`[installer] ${line}`),
  );

  await new Promise<void>((resolve, reject) => {
    const child = spawn(commandPath, params.args, {
      env: params.env,
      stdio: params.inputFile ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stderr = '';
    let stdout = '';
    let stderrTail = '';
    let stdoutTail = '';

    const dispatchLines = (raw: string, source: 'stdout' | 'stderr') => {
      const prev = source === 'stdout' ? stdoutTail : stderrTail;
      const merged = `${prev}${raw}`;
      const lines = merged.split(/\r?\n/);
      const tail = lines.pop() ?? '';
      if (source === 'stdout') stdoutTail = tail;
      else stderrTail = tail;

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) params.onLog?.(trimmed);
      }
    };

    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      dispatchLines(text, 'stdout');
    });

    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      dispatchLines(text, 'stderr');
    });

    child.once('error', (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        reject(new Error(`Binario '${params.command}' nao encontrado no PATH`));
        return;
      }
      reject(err);
    });

    if (params.inputFile && child.stdin) {
      const source = createReadStream(params.inputFile);
      void pipeline(source, child.stdin).catch((err) => {
        child.kill('SIGTERM');
        reject(err);
      });
    }

    child.once('close', (code) => {
      if (stdoutTail.trim()) params.onLog?.(stdoutTail.trim());
      if (stderrTail.trim()) params.onLog?.(stderrTail.trim());

      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `${params.command} terminou com codigo ${code}`));
    });
  });
}

async function restorePostgres(
  connectionConfig: unknown,
  dumpFile: string,
  dropExisting: boolean,
  targetDatabase?: string,
  onLog?: (line: string) => void,
) {
  const cfg = asObject(connectionConfig);
  const host = requireConnectionString(cfg, 'host');
  const port = requireConnectionNumber(cfg, 'port', 5432);
  const database = targetDatabase || requireConnectionString(cfg, 'database');
  const username = requireConnectionString(cfg, 'username');
  const password = requireConnectionString(cfg, 'password');

  const args = [
    '--host', host,
    '--port', String(port),
    '--username', username,
    '--dbname', database,
    '--no-owner',
    '--no-privileges',
    '--verbose',
  ];

  if (dropExisting) {
    args.push('--clean', '--if-exists');
  }

  args.push(dumpFile);

  await runSpawnCommand({
    command: 'pg_restore',
    args,
    env: { ...process.env, PGPASSWORD: password },
    onLog,
  });
}

async function restoreMysql(
  connectionConfig: unknown,
  sqlFile: string,
  targetDatabase?: string,
  onLog?: (line: string) => void,
) {
  const cfg = asObject(connectionConfig);
  const host = requireConnectionString(cfg, 'host');
  const port = requireConnectionNumber(cfg, 'port', 3306);
  const database = targetDatabase || requireConnectionString(cfg, 'database');
  const username = requireConnectionString(cfg, 'username');
  const password = requireConnectionString(cfg, 'password');

  const args = ['-h', host, '-P', String(port), '-u', username, database];

  try {
    await runSpawnCommand({
      command: 'mysql',
      args,
      env: { ...process.env, MYSQL_PWD: password },
      inputFile: sqlFile,
      onLog,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/Binario 'mysql' nao encontrado no PATH/i.test(message)) {
      throw err;
    }

    await runSpawnCommand({
      command: 'mariadb',
      args,
      env: { ...process.env, MYSQL_PWD: password },
      inputFile: sqlFile,
      onLog,
    });
  }
}

function sanitizeIdentifier(value: string, fallback: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '');
  return normalized || fallback;
}

function quotePgIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function buildVerificationDatabaseName(baseName: string) {
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const seed = sanitizeIdentifier(baseName, 'database');
  const maxBaseLen = 48;
  const shortSeed = seed.slice(0, maxBaseLen);
  return `dg_verify_${shortSeed}_${timestamp}`;
}

async function createPostgresVerificationDatabase(connectionConfig: unknown, onLog?: (line: string) => void) {
  const cfg = asObject(connectionConfig);
  const host = requireConnectionString(cfg, 'host');
  const port = requireConnectionNumber(cfg, 'port', 5432);
  const username = requireConnectionString(cfg, 'username');
  const password = requireConnectionString(cfg, 'password');
  const sourceDatabase = requireConnectionString(cfg, 'database');
  const maintenanceDatabase = asString(cfg.maintenance_database) || 'postgres';
  const tempDatabaseName = buildVerificationDatabaseName(sourceDatabase);

  const client = new PostgresClient({
    host,
    port,
    user: username,
    password,
    database: maintenanceDatabase,
  });

  await client.connect();
  try {
    onLog?.(`Criando banco temporario '${tempDatabaseName}' para validacao`);
    await client.query(`CREATE DATABASE ${quotePgIdentifier(tempDatabaseName)}`);
    return {
      tempDatabaseName,
      async dropDatabase() {
        await client.query(
          'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
          [tempDatabaseName],
        );
        await client.query(`DROP DATABASE IF EXISTS ${quotePgIdentifier(tempDatabaseName)}`);
      },
      async close() {
        await client.end().catch(() => undefined);
      },
    };
  } catch (err) {
    await client.end().catch(() => undefined);
    throw err;
  }
}

async function validatePostgresVerificationDatabase(connectionConfig: unknown, databaseName: string, onLog?: (line: string) => void) {
  const cfg = asObject(connectionConfig);
  const host = requireConnectionString(cfg, 'host');
  const port = requireConnectionNumber(cfg, 'port', 5432);
  const username = requireConnectionString(cfg, 'username');
  const password = requireConnectionString(cfg, 'password');
  const client = new PostgresClient({
    host,
    port,
    user: username,
    password,
    database: databaseName,
  });

  await client.connect();
  try {
    const tableCountResult = await client.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema')",
    );
    const tableCount = Number(tableCountResult.rows[0]?.count || 0);
    onLog?.(`Validacao concluida no banco temporario: ${tableCount} tabela(s) encontradas`);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function createMysqlVerificationDatabase(connectionConfig: unknown, onLog?: (line: string) => void) {
  const cfg = asObject(connectionConfig);
  const host = requireConnectionString(cfg, 'host');
  const port = requireConnectionNumber(cfg, 'port', 3306);
  const username = requireConnectionString(cfg, 'username');
  const password = requireConnectionString(cfg, 'password');
  const sourceDatabase = requireConnectionString(cfg, 'database');
  const tempDatabaseName = buildVerificationDatabaseName(sourceDatabase);
  const connection = await createMysqlConnection({
    host,
    port,
    user: username,
    password,
  });

  try {
    onLog?.(`Criando banco temporario '${tempDatabaseName}' para validacao`);
    await connection.query(`CREATE DATABASE \`${tempDatabaseName.replace(/`/g, '``')}\``);
    return {
      tempDatabaseName,
      async dropDatabase() {
        await connection.query(`DROP DATABASE IF EXISTS \`${tempDatabaseName.replace(/`/g, '``')}\``);
      },
      async close() {
        await connection.end().catch(() => undefined);
      },
    };
  } catch (err) {
    await connection.end().catch(() => undefined);
    throw err;
  }
}

async function validateMysqlVerificationDatabase(connectionConfig: unknown, databaseName: string, onLog?: (line: string) => void) {
  const cfg = asObject(connectionConfig);
  const host = requireConnectionString(cfg, 'host');
  const port = requireConnectionNumber(cfg, 'port', 3306);
  const username = requireConnectionString(cfg, 'username');
  const password = requireConnectionString(cfg, 'password');
  const connection = await createMysqlConnection({
    host,
    port,
    user: username,
    password,
    database: databaseName,
  });

  try {
    const [rows] = await connection.query('SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = ?', [databaseName]);
    const first = Array.isArray(rows) ? (rows[0] as { count?: number | string } | undefined) : undefined;
    const count = Number(first?.count || 0);
    onLog?.(`Validacao concluida no banco temporario: ${count} tabela(s) encontradas`);
  } finally {
    await connection.end().catch(() => undefined);
  }
}

async function getStorageSnapshot(execution: {
  id: string;
  storageLocationId: string;
  backupPath: string | null;
  metadata: Prisma.JsonValue | null;
}): Promise<StorageSnapshotEntry[]> {
  const refs = getMetadataStorageRefs(execution.metadata);
  if (refs.length === 0) {
    refs.push({
      storage_location_id: execution.storageLocationId,
      backup_path: execution.backupPath,
    });
  }

  const uniqueStorageIds = [...new Set(refs.map((item) => item.storage_location_id))];
  const storages = await prisma.storageLocation.findMany({
    where: { id: { in: uniqueStorageIds } },
    select: { id: true, name: true, type: true, status: true, config: true },
  });
  const storageMap = new Map(storages.map((item) => [item.id, item]));

  const uploadRelativePath = getUploadContextBackupRelativePath(execution.metadata);

  const entries: StorageSnapshotEntry[] = await Promise.all(refs.map(async (ref) => {
    const storage = storageMap.get(ref.storage_location_id);
    if (!storage) {
      return {
        storage_location_id: ref.storage_location_id,
        storage_name: 'Storage removido',
        storage_type: null,
        configured_status: 'unreachable',
        backup_path: ref.backup_path,
        relative_path: null,
        status: 'unknown' as StorageBackupStatus,
        message: 'Storage nao encontrado no sistema',
      };
    }

    const relativePath =
      uploadRelativePath
      ?? inferRelativePathFromBackupPath(storage.type, ref.backup_path, storage.config)
      ?? inferRelativePathFromBackupPath(storage.type, execution.backupPath, storage.config);

    if (!relativePath) {
      return {
        storage_location_id: storage.id,
        storage_name: storage.name,
        storage_type: storage.type,
        configured_status: storage.status,
        backup_path: ref.backup_path,
        relative_path: null,
        status: 'unknown' as StorageBackupStatus,
        message: 'Nao foi possivel resolver o caminho relativo do backup',
      };
    }

    try {
      const adapter = createStorageAdapter(storage.type, storage.config);
      const exists = await adapter.exists(relativePath);
      return {
        storage_location_id: storage.id,
        storage_name: storage.name,
        storage_type: storage.type,
        configured_status: storage.status,
        backup_path: ref.backup_path,
        relative_path: relativePath,
        status: exists ? 'available' as StorageBackupStatus : 'missing' as StorageBackupStatus,
        message: exists ? null : 'Arquivo nao encontrado neste storage',
      };
    } catch (err) {
      return {
        storage_location_id: storage.id,
        storage_name: storage.name,
        storage_type: storage.type,
        configured_status: storage.status,
        backup_path: ref.backup_path,
        relative_path: relativePath,
        status: 'unreachable' as StorageBackupStatus,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }));

  const dedup = new Map<string, typeof entries[number]>();
  for (const entry of entries) {
    if (!dedup.has(entry.storage_location_id)) {
      dedup.set(entry.storage_location_id, entry);
    }
  }
  return [...dedup.values()];
}

async function runRestoreExecutionInBackground(params: {
  restoreExecutionId: string;
  sourceExecutionId?: string | null;
  importedFilePath?: string | null;
  importedFileName?: string | null;
  datasource: {
    id: string;
    name: string;
    type: DatasourceType;
    connectionConfig: Prisma.JsonValue;
  };
  candidates: StorageSnapshotEntry[];
  dropExisting: boolean;
  verificationMode: boolean;
  keepVerificationDatabase: boolean;
}) {
  const startedAtMs = Date.now();
  const executionLogs: ExecutionLogEntry[] = [];
  const runtimeMetadata: Record<string, unknown> = {
    operation: 'restore',
    source_execution_id: params.sourceExecutionId ?? null,
    imported_file_name: params.importedFileName ?? null,
    verification_mode: params.verificationMode,
    execution_logs: executionLogs,
  };
  let lastPersistAt = 0;
  let currentPhase = 'inicializando';
  let heartbeat: NodeJS.Timeout | null = null;

  const persistLogs = async (force = false) => {
    const now = Date.now();
    if (!force && now - lastPersistAt < 250) return;
    lastPersistAt = now;
    await prisma.backupExecution.updateMany({
      where: { id: params.restoreExecutionId, status: 'running' },
      data: { metadata: runtimeMetadata as unknown as Prisma.InputJsonValue },
    });
  };

  const pushLog = (level: ExecutionLogLevel, message: string, printTerminal = false) => {
    executionLogs.push({ ts: new Date().toISOString(), level, message });
    if (printTerminal) {
      if (level === 'error') logger.error({ executionId: params.restoreExecutionId }, `[RESTORE] ${message}`);
      else logger.info({ executionId: params.restoreExecutionId }, `[RESTORE] ${message}`);
    }
    void persistLogs();
  };

  heartbeat = setInterval(() => {
    pushLog('info', `Progresso restore: ${currentPhase}...`, true);
  }, 5000);

  const restoreRoot = path.join(
    config.workers.tempDirectory,
    'restore',
    params.restoreExecutionId,
    Date.now().toString(),
  );
  let chosenStorage: StorageSnapshotEntry | null = null;
  let restoreInputFile = '';
  let verificationDbDropper: (() => Promise<void>) | null = null;
  let verificationDbCloser: (() => Promise<void>) | null = null;
  let verificationDatabaseName: string | null = null;
  let shouldDeleteImportedFile = false;

  try {
    await fs.mkdir(restoreRoot, { recursive: true });
    currentPhase = 'preparando ambiente';
    pushLog('info', `Restore iniciado para datasource '${params.datasource.name}'`, true);

    if (params.importedFilePath) {
      currentPhase = 'carregando arquivo importado';
      restoreInputFile = params.importedFilePath;
      shouldDeleteImportedFile = true;
      pushLog('info', `Arquivo importado recebido: ${params.importedFileName ?? path.basename(params.importedFilePath)}`, true);
    } else if (params.sourceExecutionId) {
      const preferredStorageIds = params.candidates.map((item) => item.storage_location_id);
      currentPhase = 'baixando e reconstruindo cadeia de backup';
      const materialized = await materializeExecutionRawSnapshot({
        executionId: params.sourceExecutionId,
        outputDir: restoreRoot,
        preferredStorageIds,
        onLog: (line) => pushLog('debug', `[artifact] ${line}`, true),
      });
      restoreInputFile = materialized.rawFile;
      if (materialized.sourceStorage) {
        chosenStorage =
          params.candidates.find((item) => item.storage_location_id === materialized.sourceStorage?.id)
          ?? {
            storage_location_id: materialized.sourceStorage.id,
            storage_name: materialized.sourceStorage.name,
            storage_type: null,
            configured_status: 'healthy',
            backup_path: null,
            relative_path: materialized.sourceStorage.relativePath,
            status: 'available',
            message: null,
          };
      }
    } else {
      throw new AppError('RESTORE_INVALID_METADATA', 422, 'Restore sem origem valida (backup ou arquivo importado)');
    }

    const datasourceType = String(params.datasource.type);
    pushLog(
      'info',
      params.verificationMode
        ? `Executando restore verification mode (${datasourceType})`
        : `Executando restore ${datasourceType}`,
      true,
    );
    currentPhase = `restaurando ${datasourceType}`;
    const engineLogger = (line: string) => pushLog('debug', `[engine] ${line}`, true);
    if (params.verificationMode) {
      if (datasourceType === 'postgres') {
        const verificationDb = await createPostgresVerificationDatabase(params.datasource.connectionConfig, (line) => pushLog('info', line, true));
        verificationDbDropper = verificationDb.dropDatabase;
        verificationDbCloser = verificationDb.close;
        verificationDatabaseName = verificationDb.tempDatabaseName;
        runtimeMetadata.verification_database = verificationDatabaseName;
        pushLog('info', `Banco temporario criado: ${verificationDatabaseName}`, true);
        await restorePostgres(
          params.datasource.connectionConfig,
          restoreInputFile,
          false,
          verificationDatabaseName,
          engineLogger,
        );
        await validatePostgresVerificationDatabase(
          params.datasource.connectionConfig,
          verificationDatabaseName,
          (line) => pushLog('info', line, true),
        );
      } else if (datasourceType === 'mysql' || datasourceType === 'mariadb') {
        const verificationDb = await createMysqlVerificationDatabase(params.datasource.connectionConfig, (line) => pushLog('info', line, true));
        verificationDbDropper = verificationDb.dropDatabase;
        verificationDbCloser = verificationDb.close;
        verificationDatabaseName = verificationDb.tempDatabaseName;
        runtimeMetadata.verification_database = verificationDatabaseName;
        pushLog('info', `Banco temporario criado: ${verificationDatabaseName}`, true);
        await restoreMysql(
          params.datasource.connectionConfig,
          restoreInputFile,
          verificationDatabaseName,
          engineLogger,
        );
        await validateMysqlVerificationDatabase(
          params.datasource.connectionConfig,
          verificationDatabaseName,
          (line) => pushLog('info', line, true),
        );
      } else {
        throw new AppError('RESTORE_NOT_SUPPORTED', 422, `Restore nao suportado para datasource '${datasourceType}'`);
      }
    } else if (datasourceType === 'postgres') {
      await restorePostgres(params.datasource.connectionConfig, restoreInputFile, params.dropExisting, undefined, engineLogger);
    } else if (datasourceType === 'mysql' || datasourceType === 'mariadb') {
      await restoreMysql(params.datasource.connectionConfig, restoreInputFile, undefined, engineLogger);
    } else {
      throw new AppError('RESTORE_NOT_SUPPORTED', 422, `Restore nao suportado para datasource '${datasourceType}'`);
    }

    const durationSeconds = Math.max(1, Math.floor((Date.now() - startedAtMs) / 1000));
    const resolvedStorage = chosenStorage ?? params.candidates[0];
    if (!resolvedStorage && !params.importedFilePath) {
      throw new AppError('BACKUP_STORAGE_UNAVAILABLE', 503, 'Nenhum storage disponivel para concluir restore');
    }
    runtimeMetadata.source_storage = resolvedStorage
      ? {
          id: resolvedStorage.storage_location_id,
          name: resolvedStorage.storage_name,
          type: resolvedStorage.storage_type,
        }
      : {
          id: null,
          name: 'upload',
          type: null,
        };
    runtimeMetadata.drop_existing = params.dropExisting;
    runtimeMetadata.keep_verification_database = params.keepVerificationDatabase;
    if (params.verificationMode && verificationDatabaseName) {
      if (!params.keepVerificationDatabase && verificationDbDropper) {
        await verificationDbDropper();
        pushLog('info', `Banco temporario removido: ${verificationDatabaseName}`, true);
      } else {
        pushLog('warn', `Banco temporario mantido: ${verificationDatabaseName}`, true);
      }
    }
    pushLog(
      'success',
      params.verificationMode
        ? `Restore verification concluido em ${durationSeconds}s`
        : `Restore concluido em ${durationSeconds}s`,
      true,
    );
    await persistLogs(true);

    await prisma.backupExecution.update({
      where: { id: params.restoreExecutionId },
      data: {
        status: 'completed',
        finishedAt: new Date(),
        durationSeconds,
        ...(resolvedStorage && { storageLocationId: resolvedStorage.storage_location_id }),
        metadata: runtimeMetadata as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    pushLog('error', `Falha no restore: ${message}`, true);
    await persistLogs(true);
    await prisma.backupExecution.updateMany({
      where: { id: params.restoreExecutionId, status: 'running' },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        durationSeconds: Math.max(1, Math.floor((Date.now() - startedAtMs) / 1000)),
        errorMessage: message,
        metadata: runtimeMetadata as unknown as Prisma.InputJsonValue,
      },
    });
  } finally {
    if (params.verificationMode && !params.keepVerificationDatabase && verificationDbDropper) {
      await verificationDbDropper().catch(() => undefined);
    }
    if (verificationDbCloser) {
      await verificationDbCloser().catch(() => undefined);
    }
    if (shouldDeleteImportedFile && params.importedFilePath) {
      await fs.rm(params.importedFilePath, { force: true }).catch(() => undefined);
    }
    if (heartbeat) clearInterval(heartbeat);
    await fs.rm(restoreRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function listBackupDatasources() {
  const grouped = await prisma.backupExecution.groupBy({
    by: ['datasourceId'],
    where: { status: 'completed' },
    _count: { _all: true },
    _max: { createdAt: true },
    orderBy: { _max: { createdAt: 'desc' } },
  });

  if (grouped.length === 0) return [];

  const ids = grouped.map((item) => item.datasourceId);
  const datasources = await prisma.datasource.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, type: true, status: true, enabled: true, updatedAt: true },
  });
  const datasourceMap = new Map(datasources.map((item) => [item.id, item]));

  return grouped
    .map((item) => {
      const datasource = datasourceMap.get(item.datasourceId);
      if (!datasource) return null;
      return {
        datasource_id: datasource.id,
        datasource_name: datasource.name,
        datasource_type: datasource.type,
        datasource_status: datasource.status,
        datasource_enabled: datasource.enabled,
        backups_count: item._count._all,
        last_backup_at: item._max.createdAt?.toISOString() ?? null,
        updated_at: datasource.updatedAt.toISOString(),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

export async function listRestoreTargetDatasources() {
  const datasources = await prisma.datasource.findMany({
    where: {
      type: { in: ['postgres', 'mysql', 'mariadb'] },
    },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
      enabled: true,
      updatedAt: true,
    },
  });

  return datasources.map((item) => ({
    datasource_id: item.id,
    datasource_name: item.name,
    datasource_type: item.type,
    datasource_status: item.status,
    datasource_enabled: item.enabled,
    updated_at: item.updatedAt.toISOString(),
  }));
}

export async function listBackupsByDatasource(datasourceId: string) {
  await prisma.datasource.findUniqueOrThrow({
    where: { id: datasourceId },
    select: { id: true },
  });

  const executions = await prisma.backupExecution.findMany({
    where: {
      datasourceId,
      status: 'completed',
      backupPath: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      datasource: {
        select: { id: true, name: true, type: true },
      },
      job: {
        select: { id: true, name: true },
      },
      storageLocation: {
        select: { id: true, name: true, type: true, status: true },
      },
    },
  });

  const backups = await Promise.all(executions.map(async (execution) => {
    const storageLocations = await getStorageSnapshot(execution);

    return {
      execution_id: execution.id,
      status: execution.status,
      backup_type: execution.backupType,
      created_at: execution.createdAt.toISOString(),
      started_at: execution.startedAt?.toISOString() ?? null,
      finished_at: execution.finishedAt?.toISOString() ?? null,
      duration_seconds: execution.durationSeconds,
      size_bytes: bigIntToSafe(execution.sizeBytes),
      compressed_size_bytes: bigIntToSafe(execution.compressedSizeBytes),
      backup_path: execution.backupPath,
      datasource: {
        id: execution.datasource.id,
        name: execution.datasource.name,
        type: execution.datasource.type,
      },
      job: {
        id: execution.job.id,
        name: execution.job.name,
      },
      primary_storage: {
        id: execution.storageLocation.id,
        name: execution.storageLocation.name,
        type: execution.storageLocation.type,
        status: execution.storageLocation.status,
      },
      storage_locations: storageLocations,
    };
  }));

  return {
    datasource_id: datasourceId,
    total_backups: backups.length,
    backups,
  };
}

export async function prepareBackupExecutionDownload(params: {
  executionId: string;
  storageLocationId?: string;
}) {
  const execution = await prisma.backupExecution.findUniqueOrThrow({
    where: { id: params.executionId },
    select: {
      id: true,
      status: true,
      storageLocationId: true,
      backupPath: true,
      metadata: true,
    },
  });

  if (execution.status !== 'completed') {
    throw new AppError(
      'BACKUP_NOT_DOWNLOADABLE',
      409,
      `Execucao '${execution.id}' com status '${execution.status}' nao pode ser baixada`,
    );
  }

  const snapshot = await getStorageSnapshot(execution);
  const requestedStorageId = params.storageLocationId?.trim();
  const availableCandidates = snapshot.filter((item) => item.status === 'available' && Boolean(item.relative_path));

  const selected =
    requestedStorageId
      ? availableCandidates.find((item) => item.storage_location_id === requestedStorageId)
      : availableCandidates[0];

  if (!selected || !selected.relative_path) {
    throw new AppError(
      'BACKUP_STORAGE_UNAVAILABLE',
      503,
      requestedStorageId
        ? `Backup indisponivel no storage '${requestedStorageId}'`
        : 'Nenhum storage disponivel para download deste backup',
    );
  }

  return prepareStorageFileDownload(selected.storage_location_id, selected.relative_path);
}

function orderStorageCandidates(candidates: StorageSnapshotEntry[]) {
  const score = (value: StorageBackupStatus) => {
    if (value === 'available') return 0;
    if (value === 'unknown') return 1;
    if (value === 'missing') return 2;
    return 3;
  };
  return [...candidates].sort((a, b) => score(a.status) - score(b.status));
}

export async function processRestoreExecutionNow(restoreExecutionId: string) {
  const startedAt = new Date();
  const locked = await prisma.backupExecution.updateMany({
    where: { id: restoreExecutionId, status: 'queued' },
    data: { status: 'running', startedAt, finishedAt: null, errorMessage: null },
  });

  if (locked.count === 0) {
    const existing = await prisma.backupExecution.findUnique({
      where: { id: restoreExecutionId },
      select: { status: true },
    });
    if (!existing) throw new AppError('NOT_FOUND', 404, 'Execucao de restore nao encontrada');
    if (existing.status === 'running' || existing.status === 'completed') return;
    throw new AppError(
      'RESTORE_NOT_PROCESSABLE',
      409,
      `Execucao '${restoreExecutionId}' com status '${existing.status}' nao pode ser processada`,
    );
  }

  try {
    const restoreExecution = await prisma.backupExecution.findUniqueOrThrow({
      where: { id: restoreExecutionId },
      include: {
        datasource: {
          select: {
            id: true,
            name: true,
            type: true,
            connectionConfig: true,
          },
        },
      },
    });

    const metadata = asObject(restoreExecution.metadata);
    const restoreReq = asObject(metadata.restore_request);
    const sourceExecutionId = asString(restoreReq.source_execution_id);
    const importedFilePath = asString(restoreReq.imported_file_path);
    const importedFileName = asString(restoreReq.imported_file_name);
    if (!sourceExecutionId && !importedFilePath) {
      throw new AppError('RESTORE_INVALID_METADATA', 422, 'Restore sem origem valida');
    }

    const requestedStorageId = asString(restoreReq.storage_location_id) ?? undefined;
    const verificationMode = restoreReq.verification_mode === true;
    const keepVerificationDatabase = restoreReq.keep_verification_database === true;
    const dropExisting = verificationMode ? false : restoreReq.drop_existing === true;

    let orderedCandidates: StorageSnapshotEntry[] = [];
    if (sourceExecutionId) {
      const sourceExecution = await prisma.backupExecution.findUniqueOrThrow({
        where: { id: sourceExecutionId },
        include: {
          datasource: {
            select: { id: true, name: true, type: true },
          },
          job: {
            select: { id: true, name: true },
          },
          storageLocation: {
            select: { id: true, name: true, type: true, status: true },
          },
        },
      });

      const snapshot = await getStorageSnapshot(sourceExecution);
      const filtered = requestedStorageId
        ? snapshot.filter((item) => item.storage_location_id === requestedStorageId)
        : snapshot;
      orderedCandidates = orderStorageCandidates(filtered);
      if (orderedCandidates.length === 0) {
        throw new AppError('BACKUP_STORAGE_UNAVAILABLE', 503, 'Nenhum storage disponivel para restore');
      }
    }

    await runRestoreExecutionInBackground({
      restoreExecutionId,
      sourceExecutionId,
      importedFilePath,
      importedFileName,
      datasource: {
        id: restoreExecution.datasource.id,
        name: restoreExecution.datasource.name,
        type: restoreExecution.datasource.type,
        connectionConfig: restoreExecution.datasource.connectionConfig as Prisma.JsonValue,
      },
      candidates: orderedCandidates,
      dropExisting,
      verificationMode,
      keepVerificationDatabase,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.backupExecution.updateMany({
      where: { id: restoreExecutionId, status: 'running' },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        errorMessage: message,
      },
    });
    throw err;
  }
}

export async function restoreBackupExecution(params: {
  executionId: string;
  storageLocationId?: string;
  targetDatasourceId?: string;
  dropExisting?: boolean;
  verificationMode?: boolean;
  keepVerificationDatabase?: boolean;
}) {
  const execution = await prisma.backupExecution.findUniqueOrThrow({
    where: { id: params.executionId },
    include: {
      job: { select: { id: true } },
      datasource: {
        select: { id: true, name: true, type: true, connectionConfig: true },
      },
      storageLocation: {
        select: { id: true, name: true, type: true, config: true },
      },
    },
  });

  if (execution.status !== 'completed') {
    throw new AppError(
      'BACKUP_NOT_RESTORABLE',
      409,
      `Execucao '${execution.id}' com status '${execution.status}' nao pode ser restaurada`,
      { status: execution.status },
    );
  }

  const datasourceType = String(execution.datasource.type);
  if (datasourceType !== 'postgres' && datasourceType !== 'mysql' && datasourceType !== 'mariadb') {
    throw new AppError('RESTORE_NOT_SUPPORTED', 422, `Restore nao suportado para datasource '${datasourceType}'`);
  }

  const targetDatasourceId = params.targetDatasourceId ?? execution.datasource.id;
  const targetDatasource = await prisma.datasource.findUnique({
    where: { id: targetDatasourceId },
    select: { id: true, name: true, type: true },
  });
  if (!targetDatasource) {
    throw new AppError('NOT_FOUND', 404, `Datasource de destino '${targetDatasourceId}' nao encontrado`);
  }

  if (targetDatasource.type !== execution.datasource.type) {
    throw new AppError(
      'RESTORE_TARGET_TYPE_MISMATCH',
      422,
      `Datasource de destino '${targetDatasource.name}' possui tipo '${targetDatasource.type}', incompativel com o backup '${execution.datasource.type}'`,
    );
  }

  const storageSnapshot = await getStorageSnapshot(execution);
  if (params.storageLocationId && !storageSnapshot.some((item) => item.storage_location_id === params.storageLocationId)) {
    throw new AppError(
      'STORAGE_NOT_FOUND_FOR_BACKUP',
      404,
      `Storage '${params.storageLocationId}' nao possui referencia para este backup`,
    );
  }

  const verificationMode = params.verificationMode ?? false;
  const keepVerificationDatabase = params.keepVerificationDatabase ?? false;
  const dropExisting = verificationMode ? false : (params.dropExisting ?? true);

  const redisReady = await ensureRedisAvailable();
  if (!redisReady) {
    throw new AppError(
      'SERVICE_UNAVAILABLE',
      503,
      'Redis indisponivel: restores estao temporariamente desativados',
      { warning: 'Inicie/restaure o Redis para executar restores.' },
    );
  }

  const createdAt = new Date();
  const restoreExecution = await prisma.backupExecution.create({
    data: {
      jobId: execution.job.id,
      datasourceId: targetDatasource.id,
      storageLocationId: params.storageLocationId ?? execution.storageLocationId,
      status: 'queued',
      backupType: execution.backupType,
      metadata: {
        operation: 'restore',
        source_execution_id: execution.id,
        restore_request: {
          source_execution_id: execution.id,
          storage_location_id: params.storageLocationId ?? null,
          target_datasource_id: targetDatasource.id,
          drop_existing: dropExisting,
          verification_mode: verificationMode,
          keep_verification_database: keepVerificationDatabase,
        },
        execution_logs: [
          {
            ts: createdAt.toISOString(),
            level: 'info',
            message: verificationMode
              ? 'Restore verification enfileirado'
              : 'Restore enfileirado',
          },
        ],
      } as unknown as Prisma.InputJsonValue,
    },
  });

  try {
    await enqueueRestoreExecution(restoreExecution.id, 'manual');
  } catch (err) {
    await prisma.backupExecution.update({
      where: { id: restoreExecution.id },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        errorMessage: 'Falha ao enfileirar restore no Redis',
      },
    });
    logger.error({ err, executionId: restoreExecution.id }, 'Falha no enqueue de restore');
    throw new AppError('SERVICE_UNAVAILABLE', 503, 'Falha ao iniciar restore no momento');
  }

  return {
    message: verificationMode ? 'Restore verification enfileirado com sucesso' : 'Restore enfileirado com sucesso',
    execution_id: restoreExecution.id,
    source_execution_id: execution.id,
    datasource_id: targetDatasource.id,
    datasource_name: targetDatasource.name,
    datasource_type: targetDatasource.type as DatasourceType,
    verification_mode: verificationMode,
    status: 'queued',
    started_at: createdAt.toISOString(),
  };
}

export async function importAndRestoreBackupFile(params: {
  fileBuffer: Buffer;
  fileName: string;
  targetDatasourceId: string;
  dropExisting?: boolean;
  verificationMode?: boolean;
  keepVerificationDatabase?: boolean;
}) {
  const targetDatasource = await prisma.datasource.findUnique({
    where: { id: params.targetDatasourceId },
    select: { id: true, name: true, type: true },
  });
  if (!targetDatasource) {
    throw new AppError('NOT_FOUND', 404, `Datasource de destino '${params.targetDatasourceId}' nao encontrado`);
  }

  const datasourceType = String(targetDatasource.type);
  if (datasourceType !== 'postgres' && datasourceType !== 'mysql' && datasourceType !== 'mariadb') {
    throw new AppError('RESTORE_NOT_SUPPORTED', 422, `Restore nao suportado para datasource '${datasourceType}'`);
  }

  const relatedJob = await prisma.backupJob.findFirst({
    where: { datasourceId: targetDatasource.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, storageLocationId: true },
  });
  if (!relatedJob) {
    throw new AppError(
      'BACKUP_JOB_REQUIRED',
      422,
      'Para importar restore, crie ao menos um Backup Job para o datasource de destino',
    );
  }

  const redisReady = await ensureRedisAvailable();
  if (!redisReady) {
    throw new AppError(
      'SERVICE_UNAVAILABLE',
      503,
      'Redis indisponivel: restores estao temporariamente desativados',
      { warning: 'Inicie/restaure o Redis para executar restores.' },
    );
  }

  const safeName = path.basename(params.fileName || 'restore-import.bin').replace(/[^\w.\-]/g, '_');
  const importRoot = path.join(
    config.workers.tempDirectory,
    'restore-import',
    targetDatasource.id,
    Date.now().toString(),
  );
  await fs.mkdir(importRoot, { recursive: true });
  const importFilePath = path.join(importRoot, safeName || 'restore-import.bin');
  await fs.writeFile(importFilePath, params.fileBuffer);

  const verificationMode = params.verificationMode ?? false;
  const keepVerificationDatabase = params.keepVerificationDatabase ?? false;
  const dropExisting = verificationMode ? false : (params.dropExisting ?? true);
  const createdAt = new Date();

  const restoreExecution = await prisma.backupExecution.create({
    data: {
      jobId: relatedJob.id,
      datasourceId: targetDatasource.id,
      storageLocationId: relatedJob.storageLocationId,
      status: 'queued',
      backupType: 'full',
      metadata: {
        operation: 'restore',
        source_execution_id: null,
        restore_request: {
          source_execution_id: null,
          imported_file_path: importFilePath,
          imported_file_name: safeName,
          target_datasource_id: targetDatasource.id,
          storage_location_id: null,
          drop_existing: dropExisting,
          verification_mode: verificationMode,
          keep_verification_database: keepVerificationDatabase,
        },
        execution_logs: [
          {
            ts: createdAt.toISOString(),
            level: 'info',
            message: verificationMode
              ? 'Restore verification por arquivo importado enfileirado'
              : 'Restore por arquivo importado enfileirado',
          },
        ],
      } as unknown as Prisma.InputJsonValue,
    },
  });

  try {
    await enqueueRestoreExecution(restoreExecution.id, 'manual');
  } catch (err) {
    await prisma.backupExecution.update({
      where: { id: restoreExecution.id },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        errorMessage: 'Falha ao enfileirar restore no Redis',
      },
    });
    await fs.rm(importFilePath, { force: true }).catch(() => undefined);
    logger.error({ err, executionId: restoreExecution.id }, 'Falha no enqueue de restore por arquivo importado');
    throw new AppError('SERVICE_UNAVAILABLE', 503, 'Falha ao iniciar restore no momento');
  }

  return {
    message: verificationMode
      ? 'Restore verification por arquivo importado enfileirado com sucesso'
      : 'Restore por arquivo importado enfileirado com sucesso',
    execution_id: restoreExecution.id,
    source_execution_id: null,
    datasource_id: targetDatasource.id,
    datasource_name: targetDatasource.name,
    datasource_type: targetDatasource.type as DatasourceType,
    verification_mode: verificationMode,
    status: 'queued' as const,
    started_at: createdAt.toISOString(),
  };
}
