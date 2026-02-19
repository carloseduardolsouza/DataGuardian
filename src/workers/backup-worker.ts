import { createHash } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { DatasourceType, Prisma } from '@prisma/client';
import { Worker } from 'bullmq';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { testDatasourceConnection } from '../api/models/datasource.model';
import { markWorkerError, markWorkerRunning, markWorkerStopped } from './worker-registry';
import { createStorageAdapter } from '../core/storage/storage-factory';
import { executeBackupDump } from '../core/backup/executor';
import { compressBackupFile } from '../core/backup/compressor';
import {
  QueueName,
  onBackupQueueEvent,
  getBackupWorkerConcurrency,
  type BackupQueueJobData,
} from '../queue/queues';
import { getBullConnection } from '../queue/redis-client';

const processing = new Set<string>();
let worker: Worker<BackupQueueJobData> | null = null;
let eventsBound = false;

type ExecutionLogLevel = 'info' | 'warn' | 'error' | 'debug' | 'success';

interface ExecutionLogEntry {
  ts: string;
  level: ExecutionLogLevel;
  message: string;
}

interface RuntimeMetadata {
  [key: string]: unknown;
  execution_logs: ExecutionLogEntry[];
}

interface StorageTarget {
  storage_location_id: string;
  order: number;
}

interface LocalArtifactsMetadata {
  temp_dir: string;
  compressed_file: string;
  manifest_file: string;
  backup_filename: string;
  compression_extension: string;
}

interface UploadContextMetadata {
  base_relative_folder: string;
  backup_relative_path: string;
  manifest_relative_path: string;
  strategy: 'replicate' | 'fallback';
  targets: StorageTarget[];
}

function sanitizeSegment(value: string) {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120) || 'database';
}

function resolveDatabaseFolderName(datasource: { name: string; connectionConfig: unknown }) {
  const cfg = (datasource.connectionConfig ?? {}) as Record<string, unknown>;
  if (typeof cfg.database === 'string' && cfg.database.trim()) {
    return sanitizeSegment(cfg.database);
  }
  if (typeof cfg.source_path === 'string' && cfg.source_path.trim()) {
    return sanitizeSegment(path.basename(cfg.source_path));
  }
  if (typeof cfg.file_path === 'string' && cfg.file_path.trim()) {
    return sanitizeSegment(path.basename(cfg.file_path));
  }
  return sanitizeSegment(datasource.name);
}

function formatExecutionFolder(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
  ].join('-') + `_${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}

function getStorageTargets(backupOptions: unknown, fallbackStorageLocationId: string) {
  const opts = (backupOptions ?? {}) as Record<string, unknown>;
  const rawTargets = Array.isArray(opts.storage_targets)
    ? rawTargetsFrom(opts.storage_targets)
    : [];

  return rawTargets.length > 0
    ? rawTargets
    : [{ storage_location_id: fallbackStorageLocationId, order: 1 }];
}

function rawTargetsFrom(raw: unknown[]) {
  return raw
    .map((t) => {
      const target = (t ?? {}) as Record<string, unknown>;
      return {
        storage_location_id: String(target.storage_location_id ?? ''),
        order: Number(target.order ?? 0),
      };
    })
    .filter((t) => t.storage_location_id && Number.isFinite(t.order) && t.order > 0)
    .sort((a, b) => a.order - b.order);
}

function getBackupOptions(backupOptions: unknown) {
  const opts = (backupOptions ?? {}) as Record<string, unknown>;
  const compressionRaw = String(opts.compression ?? 'gzip').toLowerCase();
  const compression: 'none' | 'gzip' = compressionRaw === 'none' ? 'none' : 'gzip';
  const storageStrategy: 'replicate' | 'fallback' =
    String(opts.storage_strategy ?? 'fallback') === 'replicate' ? 'replicate' : 'fallback';
  return { compression, strategy: storageStrategy };
}

function toMetadataObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readExecutionLogs(value: unknown): ExecutionLogEntry[] {
  const obj = toMetadataObject(value);
  const raw = obj.execution_logs;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
      const e = entry as Record<string, unknown>;
      const message = String(e.message ?? '').trim();
      if (!message) return null;
      const levelRaw = String(e.level ?? 'info');
      const level: ExecutionLogLevel = ['info', 'warn', 'error', 'debug', 'success'].includes(levelRaw)
        ? levelRaw as ExecutionLogLevel
        : 'info';
      const tsRaw = String(e.ts ?? '');
      const ts = Number.isNaN(Date.parse(tsRaw)) ? new Date().toISOString() : new Date(tsRaw).toISOString();
      return { ts, level, message };
    })
    .filter((entry): entry is ExecutionLogEntry => entry !== null);
}

async function computeSha256(filePath: string) {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}

async function uploadBackupArtifacts(params: {
  compressedFile: string;
  manifestFile: string;
  backupRelativePath: string;
  manifestRelativePath: string;
  targets: StorageTarget[];
  strategy: 'replicate' | 'fallback';
  pushLog: (level: ExecutionLogLevel, message: string, logToTerminal?: boolean) => void;
}) {
  const successes: Array<{
    storage_location_id: string;
    backup_path: string;
    manifest_path: string;
    latency_ms: number | null;
  }> = [];
  const failures: Array<{ storage_location_id: string; error: string }> = [];

  for (const target of params.targets) {
    const storage = await prisma.storageLocation.findUnique({
      where: { id: target.storage_location_id },
      select: { id: true, name: true, type: true, config: true },
    });

    if (!storage) {
      const error = 'Storage nao encontrado';
      failures.push({ storage_location_id: target.storage_location_id, error });
      params.pushLog('error', `Falha no destino ${target.storage_location_id}: ${error}`, true);
      continue;
    }

    try {
      const adapter = createStorageAdapter(storage.type, storage.config);

      params.pushLog('info', `Conectando ao storage '${storage.name}' (${storage.type})`, true);
      const slTest = await adapter.testConnection();

      let lastUploadPercent = -1;
      params.pushLog('info', `Enviando dump para '${storage.name}'`, true);
      const savedBackup = await adapter.upload(params.compressedFile, params.backupRelativePath, {
        onProgress: (progress) => {
          const rounded = Math.floor(progress.percent / 10) * 10;
          if (rounded > lastUploadPercent && rounded % 10 === 0) {
            lastUploadPercent = rounded;
            params.pushLog('info', `Upload ${storage.name}: ${rounded}%`, true);
          }
        },
      });

      params.pushLog('info', `Enviando manifest para '${storage.name}'`, true);
      const savedManifest = await adapter.upload(params.manifestFile, params.manifestRelativePath);

      successes.push({
        storage_location_id: storage.id,
        backup_path: savedBackup.backupPath,
        manifest_path: savedManifest.backupPath,
        latency_ms: slTest.latencyMs,
      });

      params.pushLog('success', `Backup salvo em '${savedBackup.backupPath}'`, true);

      if (params.strategy === 'fallback') break;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      failures.push({ storage_location_id: storage.id, error });
      params.pushLog('error', `Falha ao gravar no storage '${storage.name}': ${error}`, true);
    }
  }

  return { successes, failures };
}

async function processExecution(executionId: string) {
  if (processing.has(executionId)) return;
  processing.add(executionId);

  let executionLogs: ExecutionLogEntry[] = [];
  const runtimeMetadata: RuntimeMetadata = { execution_logs: executionLogs };
  let lastPersistAt = 0;
  let shouldCleanupTempDir = true;

  const persistLogs = async (force = false) => {
    const now = Date.now();
    if (!force && now - lastPersistAt < 1200) return;
    lastPersistAt = now;

    await prisma.backupExecution.updateMany({
      where: {
        id: executionId,
        status: { in: ['queued', 'running'] },
      },
      data: {
        metadata: runtimeMetadata as unknown as Prisma.InputJsonValue,
      },
    });
  };

  const pushLog = (level: ExecutionLogLevel, message: string, logToTerminal = false) => {
    executionLogs.push({ ts: new Date().toISOString(), level, message });

    if (logToTerminal) {
      if (level === 'error') {
        logger.error({ executionId }, `[BACKUP] ${message}`);
      } else {
        logger.info({ executionId }, `[BACKUP] ${message}`);
      }
    }

    void persistLogs();
  };

  const claimed = await prisma.backupExecution.updateMany({
    where: { id: executionId, status: 'queued' },
    data: {
      status: 'running',
      startedAt: new Date(),
    },
  });

  if (claimed.count === 0) {
    processing.delete(executionId);
    return;
  }

  pushLog('info', 'Execucao iniciada', true);

  const startedAt = Date.now();
  let tempDir: string | null = null;
  let artifactFilesReady = false;

  try {
    const execution = await prisma.backupExecution.findUniqueOrThrow({
      where: { id: executionId },
      include: {
        job: { select: { id: true, name: true, backupOptions: true, datasourceId: true, storageLocationId: true } },
        datasource: { select: { type: true, name: true, connectionConfig: true } },
      },
    });

    const existingMetadata = toMetadataObject(execution.metadata);
    executionLogs = readExecutionLogs(execution.metadata);
    for (const [key, value] of Object.entries(existingMetadata)) {
      if (key !== 'execution_logs') {
        runtimeMetadata[key] = value;
      }
    }
    runtimeMetadata.execution_logs = executionLogs;

    pushLog('info', `Job '${execution.job.name}' iniciado para datasource '${execution.datasource.name}'`, true);

    const dsType = execution.datasource.type as DatasourceType;
    const dsTest = dsType === 'postgres' || dsType === 'mysql'
      ? await testDatasourceConnection(execution.datasourceId)
      : { status: 'ok', latency_ms: null as number | null };

    runtimeMetadata.datasource_latency_ms = dsTest.latency_ms;
    pushLog('success', `Conexao com datasource validada (${execution.datasource.type})`, true);

    const targets = getStorageTargets(execution.job.backupOptions, execution.storageLocationId);
    const { compression, strategy } = getBackupOptions(execution.job.backupOptions);

    runtimeMetadata.compression = compression;
    runtimeMetadata.storage_strategy = strategy;

    pushLog('info', `Estrategia de storage '${strategy}' com ${targets.length} destino(s)`, true);
    pushLog('info', `Compressao configurada: ${compression}`, true);

    tempDir = path.join(os.tmpdir(), 'dataguardian', execution.id);
    await fs.mkdir(tempDir, { recursive: true });

    const rawDumpFile = path.join(tempDir, 'backup.raw');
    let lastDumpProgressLogAt = 0;
    let lastDumpBytes = 0;

    pushLog('info', `Gerando dump (${execution.datasource.type})`, true);

    const dumpInfo = await executeBackupDump({
      datasourceType: dsType,
      connectionConfig: execution.datasource.connectionConfig,
      outputFile: rawDumpFile,
      callbacks: {
        onProgress: (bytes) => {
          const now = Date.now();
          if (now - lastDumpProgressLogAt >= 4000 && bytes !== lastDumpBytes) {
            lastDumpProgressLogAt = now;
            lastDumpBytes = bytes;
            const mb = (bytes / (1024 * 1024)).toFixed(1);
            pushLog('info', `Progresso dump: ${mb} MB gerados`, true);
          }
        },
        onEngineLog: (line) => {
          pushLog('debug', `[engine] ${line}`);
        },
      },
    });

    pushLog('success', `Dump concluido (${dumpInfo.extension})`, true);
    pushLog('info', 'Iniciando compactacao do dump', true);

    const rawStat = await fs.stat(rawDumpFile);
    const compressed = await compressBackupFile(rawDumpFile, compression);
    pushLog('success', `Compactacao concluida (${compressed.compressedSizeBytes} bytes)`, true);
    pushLog('info', 'Calculando checksum do arquivo compactado', true);
    const checksum = await computeSha256(compressed.outputFile);
    pushLog('success', 'Checksum calculado com sucesso', true);

    runtimeMetadata.compression_ratio = rawStat.size > 0
      ? Number((compressed.compressedSizeBytes / rawStat.size).toFixed(4))
      : 1;
    runtimeMetadata.checksum = `sha256:${checksum}`;

    const datasourceFolder = resolveDatabaseFolderName(execution.datasource);
    const executionFolder = formatExecutionFolder(new Date(execution.createdAt));
    const baseRelativeFolder = path.posix.join(datasourceFolder, executionFolder);
    const backupFilename = `backup${dumpInfo.extension}${compressed.compressionExtension}`;
    const backupRelativePath = path.posix.join(baseRelativeFolder, backupFilename);

    const manifest = {
      version: '1.0',
      created_at: new Date().toISOString(),
      execution_id: execution.id,
      job_id: execution.jobId,
      datasource_type: execution.datasource.type,
      backup_type: execution.backupType,
      compression,
      total_size_bytes: rawStat.size,
      compressed_size_bytes: compressed.compressedSizeBytes,
      compression_ratio: runtimeMetadata.compression_ratio,
      checksum: `sha256:${checksum}`,
      chunks: [{ number: 1, file: backupFilename, checksum: `sha256:${checksum}` }],
      metadata: {
        datasource_latency_ms: dsTest.latency_ms,
      },
    };

    const manifestFile = path.join(tempDir, 'manifest.json');
    await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 2), 'utf8');
    artifactFilesReady = true;

    const manifestRelativePath = path.posix.join(baseRelativeFolder, 'manifest.json');
    runtimeMetadata.local_artifacts = {
      temp_dir: tempDir,
      compressed_file: compressed.outputFile,
      manifest_file: manifestFile,
      backup_filename: backupFilename,
      compression_extension: compressed.compressionExtension,
    } as unknown as Prisma.InputJsonValue;
    runtimeMetadata.upload_context = {
      base_relative_folder: baseRelativeFolder,
      backup_relative_path: backupRelativePath,
      manifest_relative_path: manifestRelativePath,
      strategy,
      targets,
    } as unknown as Prisma.InputJsonValue;
    await persistLogs(true);

    pushLog('info', `Backup pronto para envio (${compressed.compressedSizeBytes} bytes)`, true);
    const { successes, failures } = await uploadBackupArtifacts({
      compressedFile: compressed.outputFile,
      manifestFile,
      backupRelativePath,
      manifestRelativePath,
      targets,
      strategy,
      pushLog,
    });

    runtimeMetadata.storage_successes = successes;
    runtimeMetadata.storage_failures = failures;

    if (successes.length === 0) {
      throw new Error(`Nenhum storage disponivel para salvar backup (${strategy})`);
    }

    const durationSeconds = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
    const finishedAt = new Date();
    const primarySuccess = successes[0];

    const fresh = await prisma.backupExecution.findUniqueOrThrow({ where: { id: executionId } });
    if (fresh.status === 'cancelled') {
      pushLog('warn', 'Execucao foi cancelada antes da finalizacao', true);
      await persistLogs(true);
      processing.delete(executionId);
      return;
    }

    pushLog('success', `Execucao concluida em ${durationSeconds}s`, true);
    await persistLogs(true);

    await prisma.$transaction([
      prisma.backupExecution.update({
        where: { id: executionId },
        data: {
          status: 'completed',
          storageLocationId: primarySuccess.storage_location_id,
          finishedAt,
          durationSeconds,
          sizeBytes: BigInt(rawStat.size),
          compressedSizeBytes: BigInt(compressed.compressedSizeBytes),
          backupPath: primarySuccess.backup_path,
          metadata: runtimeMetadata as unknown as Prisma.InputJsonValue,
        },
      }),
      prisma.backupChunk.deleteMany({ where: { executionId } }),
      prisma.backupChunk.create({
        data: {
          executionId,
          chunkNumber: 1,
          filePath: primarySuccess.backup_path,
          sizeBytes: BigInt(compressed.compressedSizeBytes),
          checksum,
        },
      }),
      prisma.backupJob.update({
        where: { id: execution.jobId },
        data: { lastExecutionAt: finishedAt },
      }),
    ]);
  } catch (err) {
    const durationSeconds = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
    const message = err instanceof Error ? err.message : String(err);
    pushLog('error', `Falha na execucao: ${message}`, true);

    await persistLogs(true);

    await prisma.backupExecution.updateMany({
      where: {
        id: executionId,
        status: { in: ['queued', 'running'] },
      },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        durationSeconds,
        errorMessage: message,
        metadata: runtimeMetadata as unknown as Prisma.InputJsonValue,
      },
    });

    logger.error({ err, executionId }, 'Falha ao processar execucao de backup');
    if (artifactFilesReady) {
      shouldCleanupTempDir = false;
    }
  } finally {
    if (tempDir && shouldCleanupTempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
    processing.delete(executionId);
  }
}

export async function triggerBackupExecutionNow(executionId: string) {
  await processExecution(executionId);
}

export async function retryExecutionUploadNow(executionId: string) {
  if (processing.has(executionId)) {
    throw new Error('Execucao ja esta em processamento');
  }
  processing.add(executionId);

  let lastPersistAt = 0;
  let shouldCleanupTempDir = false;

  try {
    const execution = await prisma.backupExecution.findUniqueOrThrow({
      where: { id: executionId },
      include: {
        job: { select: { id: true, name: true, backupOptions: true, datasourceId: true, storageLocationId: true } },
      },
    });

    if (execution.status !== 'failed') {
      throw new Error(`Execucao ${executionId} nao esta em status failed`);
    }

    const metadataObj = toMetadataObject(execution.metadata);
    const artifacts = toMetadataObject(metadataObj.local_artifacts) as unknown as Partial<LocalArtifactsMetadata>;
    const uploadContext = toMetadataObject(metadataObj.upload_context) as unknown as Partial<UploadContextMetadata>;

    if (!artifacts.compressed_file || !artifacts.manifest_file || !artifacts.temp_dir) {
      throw new Error('Nao ha artefatos locais para retomar envio');
    }
    if (!uploadContext.backup_relative_path || !uploadContext.manifest_relative_path) {
      throw new Error('Contexto de upload ausente para retomar envio');
    }

    const targets = Array.isArray(uploadContext.targets)
      ? rawTargetsFrom(uploadContext.targets as unknown[])
      : getStorageTargets(execution.job.backupOptions, execution.storageLocationId);
    const strategy: 'replicate' | 'fallback' =
      uploadContext.strategy === 'replicate' ? 'replicate' : 'fallback';

    const claimed = await prisma.backupExecution.updateMany({
      where: { id: executionId, status: 'failed' },
      data: {
        status: 'running',
        startedAt: new Date(),
        finishedAt: null,
        errorMessage: null,
      },
    });

    if (claimed.count === 0) {
      throw new Error('Nao foi possivel retomar a execucao');
    }

    const executionLogs = readExecutionLogs(execution.metadata);
    const runtimeMetadata: RuntimeMetadata = {
      ...metadataObj,
      execution_logs: executionLogs,
    };

    const persistLogs = async (force = false) => {
      const now = Date.now();
      if (!force && now - lastPersistAt < 1200) return;
      lastPersistAt = now;
      await prisma.backupExecution.updateMany({
        where: { id: executionId, status: 'running' },
        data: { metadata: runtimeMetadata as unknown as Prisma.InputJsonValue },
      });
    };

    const pushLog = (level: ExecutionLogLevel, message: string, logToTerminal = false) => {
      executionLogs.push({ ts: new Date().toISOString(), level, message });
      if (logToTerminal) {
        if (level === 'error') logger.error({ executionId }, `[BACKUP] ${message}`);
        else logger.info({ executionId }, `[BACKUP] ${message}`);
      }
      void persistLogs();
    };

    await fs.access(artifacts.compressed_file);
    await fs.access(artifacts.manifest_file);

    pushLog('info', 'Retomando envio do dump ja gerado', true);
    pushLog('info', `Estrategia de storage '${strategy}' com ${targets.length} destino(s)`, true);

    const { successes, failures } = await uploadBackupArtifacts({
      compressedFile: artifacts.compressed_file,
      manifestFile: artifacts.manifest_file,
      backupRelativePath: String(uploadContext.backup_relative_path),
      manifestRelativePath: String(uploadContext.manifest_relative_path),
      targets,
      strategy,
      pushLog,
    });

    runtimeMetadata.storage_successes = successes;
    runtimeMetadata.storage_failures = failures;

    if (successes.length === 0) {
      throw new Error(`Nenhum storage disponivel para salvar backup (${strategy})`);
    }

    const compressedStat = await fs.stat(artifacts.compressed_file);
    const checksumValue =
      String(runtimeMetadata.checksum ?? '').replace(/^sha256:/, '')
      || await computeSha256(artifacts.compressed_file);
    const rawSize = Number(runtimeMetadata.total_size_bytes ?? execution.sizeBytes ?? 0);
    const durationSeconds = 1;
    const finishedAt = new Date();
    const primarySuccess = successes[0];

    pushLog('success', 'Retomada de upload concluida com sucesso', true);
    await persistLogs(true);

    await prisma.$transaction([
      prisma.backupExecution.update({
        where: { id: executionId },
        data: {
          status: 'completed',
          storageLocationId: primarySuccess.storage_location_id,
          finishedAt,
          durationSeconds,
          sizeBytes: BigInt(Math.max(0, rawSize)),
          compressedSizeBytes: BigInt(compressedStat.size),
          backupPath: primarySuccess.backup_path,
          metadata: runtimeMetadata as unknown as Prisma.InputJsonValue,
        },
      }),
      prisma.backupChunk.deleteMany({ where: { executionId } }),
      prisma.backupChunk.create({
        data: {
          executionId,
          chunkNumber: 1,
          filePath: primarySuccess.backup_path,
          sizeBytes: BigInt(compressedStat.size),
          checksum: checksumValue,
        },
      }),
    ]);

    shouldCleanupTempDir = true;
    return {
      execution_id: executionId,
      status: 'completed',
      message: 'Upload retomado e concluido com sucesso',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.backupExecution.updateMany({
      where: { id: executionId, status: 'running' },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        errorMessage: message,
      },
    });
    throw err;
  } finally {
    if (shouldCleanupTempDir) {
      const execution = await prisma.backupExecution.findUnique({
        where: { id: executionId },
        select: { metadata: true },
      });
      const metadataObj = toMetadataObject(execution?.metadata);
      const artifacts = toMetadataObject(metadataObj.local_artifacts) as unknown as Partial<LocalArtifactsMetadata>;
      if (artifacts.temp_dir) {
        await fs.rm(artifacts.temp_dir, { recursive: true, force: true }).catch(() => undefined);
      }
    }
    processing.delete(executionId);
  }
}

function bindQueueEvents() {
  if (eventsBound) return;
  eventsBound = true;

  onBackupQueueEvent('error', (err) => {
    markWorkerError('backup', err);
    logger.error({ err }, 'Erro nos eventos da backup-queue');
  });

  onBackupQueueEvent('failed', ({ jobId, failedReason }) => {
    logger.error({ executionId: jobId, reason: failedReason }, '[BACKUP] Job falhou na fila');
  });
}

export function startBackupWorker() {
  if (worker) return;

  markWorkerRunning('backup');
  bindQueueEvents();

  worker = new Worker<BackupQueueJobData>(
    QueueName.backup,
    async (job) => {
      await processExecution(job.data.executionId);
    },
    {
      connection: getBullConnection(),
      concurrency: getBackupWorkerConcurrency(),
    },
  );

  worker.on('error', (err) => {
    markWorkerError('backup', err);
    logger.error({ err }, 'Erro no backup worker');
  });

  worker.on('active', (job) => {
    logger.info({ executionId: job.id }, '[BACKUP] Job iniciado na fila');
  });

  worker.on('completed', (job) => {
    logger.info({ executionId: job.id }, '[BACKUP] Job concluido na fila');
  });

  logger.info(
    { concurrency: getBackupWorkerConcurrency() },
    'Backup worker inicializado',
  );
}

export async function stopBackupWorker() {
  if (worker) {
    const runningWorker = worker;
    worker = null;
    await runningWorker.close();
  }

  markWorkerStopped('backup');
  logger.info('Backup worker finalizado');
}
