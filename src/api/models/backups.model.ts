import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { DatasourceType, Prisma, StorageLocationType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { bigIntToSafe } from '../../utils/config';
import { AppError } from '../middlewares/error-handler';
import { createStorageAdapter } from '../../core/storage/storage-factory';
import { resolveBinaryPath } from '../../core/backup/engines/base-engine';
import { logger } from '../../utils/logger';
import { config } from '../../utils/config';
import { normalizeLocalStoragePath } from '../../utils/runtime';

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
  onLog?: (line: string) => void,
) {
  const cfg = asObject(connectionConfig);
  const host = requireConnectionString(cfg, 'host');
  const port = requireConnectionNumber(cfg, 'port', 5432);
  const database = requireConnectionString(cfg, 'database');
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

async function restoreMysql(connectionConfig: unknown, sqlFile: string, onLog?: (line: string) => void) {
  const cfg = asObject(connectionConfig);
  const host = requireConnectionString(cfg, 'host');
  const port = requireConnectionNumber(cfg, 'port', 3306);
  const database = requireConnectionString(cfg, 'database');
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
  sourceExecutionId: string;
  datasource: {
    id: string;
    name: string;
    type: DatasourceType;
    connectionConfig: Prisma.JsonValue;
  };
  candidates: StorageSnapshotEntry[];
  dropExisting: boolean;
}) {
  const startedAtMs = Date.now();
  const executionLogs: ExecutionLogEntry[] = [];
  const runtimeMetadata: Record<string, unknown> = {
    operation: 'restore',
    source_execution_id: params.sourceExecutionId,
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
  let downloadedFile = '';
  let restoreInputFile = '';
  let chosenStorage: StorageSnapshotEntry | null = null;

  try {
    await fs.mkdir(restoreRoot, { recursive: true });
    currentPhase = 'preparando ambiente';
    pushLog('info', `Restore iniciado para datasource '${params.datasource.name}'`, true);

    let lastError: string | null = null;
    for (const candidate of params.candidates) {
      if (!candidate.relative_path) {
        lastError = `Storage '${candidate.storage_name}' sem caminho relativo valido`;
        pushLog('warn', lastError, true);
        continue;
      }

      const storage = await prisma.storageLocation.findUnique({
        where: { id: candidate.storage_location_id },
        select: { id: true, name: true, type: true, config: true },
      });

      if (!storage) {
        lastError = `Storage '${candidate.storage_location_id}' nao encontrado`;
        pushLog('warn', lastError, true);
        continue;
      }

      const fileName = path.basename(candidate.relative_path);
      const destination = path.join(restoreRoot, fileName);

      try {
        pushLog('info', `Baixando backup do storage '${storage.name}'`, true);
        currentPhase = `baixando dump de ${storage.name}`;
        const adapter = createStorageAdapter(storage.type, storage.config);
        await adapter.download(candidate.relative_path, destination);
        downloadedFile = destination;
        chosenStorage = candidate;
        pushLog('success', `Download concluido: ${fileName}`, true);
        break;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        pushLog('warn', `Falha no storage '${storage.name}': ${lastError}`, true);
      }
    }

    if (!downloadedFile || !chosenStorage) {
      throw new AppError(
        'BACKUP_DOWNLOAD_FAILED',
        503,
        `Nao foi possivel baixar backup de nenhum storage${lastError ? `: ${lastError}` : ''}`,
      );
    }

    if (downloadedFile.endsWith('.gz')) {
      restoreInputFile = downloadedFile.slice(0, -3);
      pushLog('info', 'Descompactando arquivo .gz para restore', true);
      currentPhase = 'descompactando dump';
      await pipeline(
        createReadStream(downloadedFile),
        createGunzip(),
        createWriteStream(restoreInputFile),
      );
      pushLog('success', 'Descompactacao concluida', true);
    } else {
      restoreInputFile = downloadedFile;
    }

    const datasourceType = String(params.datasource.type);
    pushLog('info', `Executando restore ${datasourceType}`, true);
    currentPhase = `restaurando ${datasourceType}`;
    const engineLogger = (line: string) => pushLog('debug', `[engine] ${line}`, true);
    if (datasourceType === 'postgres') {
      await restorePostgres(params.datasource.connectionConfig, restoreInputFile, params.dropExisting, engineLogger);
    } else if (datasourceType === 'mysql' || datasourceType === 'mariadb') {
      await restoreMysql(params.datasource.connectionConfig, restoreInputFile, engineLogger);
    } else {
      throw new AppError('RESTORE_NOT_SUPPORTED', 422, `Restore nao suportado para datasource '${datasourceType}'`);
    }

    const durationSeconds = Math.max(1, Math.floor((Date.now() - startedAtMs) / 1000));
    runtimeMetadata.source_storage = {
      id: chosenStorage.storage_location_id,
      name: chosenStorage.storage_name,
      type: chosenStorage.storage_type,
    };
    runtimeMetadata.drop_existing = params.dropExisting;
    pushLog('success', `Restore concluido em ${durationSeconds}s`, true);
    await persistLogs(true);

    await prisma.backupExecution.update({
      where: { id: params.restoreExecutionId },
      data: {
        status: 'completed',
        finishedAt: new Date(),
        durationSeconds,
        storageLocationId: chosenStorage.storage_location_id,
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

export async function restoreBackupExecution(params: {
  executionId: string;
  storageLocationId?: string;
  dropExisting?: boolean;
}) {
  const execution = await prisma.backupExecution.findUniqueOrThrow({
    where: { id: params.executionId },
    include: {
      job: {
        select: { id: true },
      },
      datasource: {
        select: {
          id: true,
          name: true,
          type: true,
          connectionConfig: true,
        },
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
    throw new AppError(
      'RESTORE_NOT_SUPPORTED',
      422,
      `Restore nao suportado para datasource '${datasourceType}'`,
    );
  }

  const storageSnapshot = await getStorageSnapshot(execution);
  const candidates = params.storageLocationId
    ? storageSnapshot.filter((item) => item.storage_location_id === params.storageLocationId)
    : storageSnapshot;

  if (params.storageLocationId && candidates.length === 0) {
    throw new AppError(
      'STORAGE_NOT_FOUND_FOR_BACKUP',
      404,
      `Storage '${params.storageLocationId}' nao possui referencia para este backup`,
    );
  }

  const orderedCandidates = candidates.sort((a, b) => {
    const score = (value: StorageBackupStatus) => {
      if (value === 'available') return 0;
      if (value === 'unknown') return 1;
      if (value === 'missing') return 2;
      return 3;
    };
    return score(a.status) - score(b.status);
  });

  if (orderedCandidates.length === 0) {
    throw new AppError('BACKUP_STORAGE_UNAVAILABLE', 503, 'Nenhum storage disponivel para restore');
  }

  const startedAt = new Date();
  const dropExisting = params.dropExisting ?? true;

  const restoreExecution = await prisma.backupExecution.create({
    data: {
      jobId: execution.job.id,
      datasourceId: execution.datasource.id,
      storageLocationId: params.storageLocationId ?? execution.storageLocationId,
      status: 'running',
      backupType: execution.backupType,
      startedAt,
      metadata: {
        operation: 'restore',
        source_execution_id: execution.id,
        execution_logs: [
          {
            ts: startedAt.toISOString(),
            level: 'info',
            message: 'Restore enfileirado e iniciado',
          },
        ],
      } as unknown as Prisma.InputJsonValue,
    },
  });

  void runRestoreExecutionInBackground({
    restoreExecutionId: restoreExecution.id,
    sourceExecutionId: execution.id,
    datasource: {
      id: execution.datasource.id,
      name: execution.datasource.name,
      type: execution.datasource.type,
      connectionConfig: execution.datasource.connectionConfig as Prisma.JsonValue,
    },
    candidates: orderedCandidates,
    dropExisting,
  });

  return {
    message: 'Restore iniciado com sucesso',
    execution_id: restoreExecution.id,
    source_execution_id: execution.id,
    datasource_id: execution.datasource.id,
    datasource_name: execution.datasource.name,
    datasource_type: execution.datasource.type as DatasourceType,
    status: 'running',
    started_at: startedAt.toISOString(),
  };
}
