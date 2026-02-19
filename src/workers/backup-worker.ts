import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { config } from '../utils/config';
import { testDatasourceConnection } from '../api/models/datasource.model';
import { markWorkerError, markWorkerRunning, markWorkerStopped } from './worker-registry';
import { createStorageAdapter } from '../core/storage/storage-factory';

const processing = new Set<string>();
let timer: NodeJS.Timeout | null = null;
let running = false;

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
  const strategy = String(opts.storage_strategy ?? 'fallback') === 'replicate' ? 'replicate' : 'fallback';
  return { compression, strategy };
}

function getStringConfig(cfg: Record<string, unknown>, key: string) {
  const value = cfg[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Campo de conexao invalido: ${key}`);
  }
  return value;
}

function getNumberConfig(cfg: Record<string, unknown>, key: string, fallback: number) {
  const raw = cfg[key];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Campo de conexao invalido: ${key}`);
  }
  return Math.trunc(parsed);
}

async function existsFile(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveBinaryPath(command: 'pg_dump' | 'mysqldump') {
  if (process.platform !== 'win32') {
    return command;
  }

  const exe = `${command}.exe`;
  const programFiles = [process.env['ProgramFiles'], process.env['ProgramFiles(x86)']]
    .filter((v): v is string => Boolean(v));

  const directCandidates: string[] = [];
  if (command === 'mysqldump') {
    directCandidates.push('C:\\xampp\\mysql\\bin\\mysqldump.exe');
  }

  for (const candidate of directCandidates) {
    if (await existsFile(candidate)) return candidate;
  }

  for (const base of programFiles) {
    if (command === 'pg_dump') {
      const postgresRoot = path.join(base, 'PostgreSQL');
      try {
        const versions = await fs.readdir(postgresRoot, { withFileTypes: true });
        for (const dir of versions) {
          if (!dir.isDirectory()) continue;
          const candidate = path.join(postgresRoot, dir.name, 'bin', exe);
          if (await existsFile(candidate)) return candidate;
        }
      } catch {
        // ignore
      }
    }

    if (command === 'mysqldump') {
      const mysqlRoot = path.join(base, 'MySQL');
      try {
        const installs = await fs.readdir(mysqlRoot, { withFileTypes: true });
        for (const dir of installs) {
          if (!dir.isDirectory()) continue;
          const candidate = path.join(mysqlRoot, dir.name, 'bin', exe);
          if (await existsFile(candidate)) return candidate;
        }
      } catch {
        // ignore
      }
    }
  }

  return command;
}

async function runDumpToFile(params: {
  datasourceType: string;
  connectionConfig: unknown;
  outputFile: string;
  onProgress?: (bytesWritten: number) => void;
  onEngineLog?: (line: string) => void;
}) {
  const cfg = (params.connectionConfig ?? {}) as Record<string, unknown>;

  if (params.datasourceType === 'postgres') {
    const host = getStringConfig(cfg, 'host');
    const port = getNumberConfig(cfg, 'port', 5432);
    const database = getStringConfig(cfg, 'database');
    const username = getStringConfig(cfg, 'username');
    const password = getStringConfig(cfg, 'password');

    const args = ['-h', host, '-p', String(port), '-U', username, '-d', database, '-F', 'c', '--verbose'];
    await spawnToFile('pg_dump', args, { ...process.env, PGPASSWORD: password }, params.outputFile, params.onProgress, params.onEngineLog);
    return { extension: '.dump' as const };
  }

  if (params.datasourceType === 'mysql') {
    const host = getStringConfig(cfg, 'host');
    const port = getNumberConfig(cfg, 'port', 3306);
    const database = getStringConfig(cfg, 'database');
    const username = getStringConfig(cfg, 'username');
    const password = getStringConfig(cfg, 'password');

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
    await spawnToFile('mysqldump', args, { ...process.env, MYSQL_PWD: password }, params.outputFile, params.onProgress, params.onEngineLog);
    return { extension: '.sql' as const };
  }

  throw new Error(`Datasource '${params.datasourceType}' nao suportado para backup real`);
}

async function spawnToFile(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  outputFile: string,
  onProgress?: (bytesWritten: number) => void,
  onEngineLog?: (line: string) => void,
) {
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  const binary = await resolveBinaryPath(command as 'pg_dump' | 'mysqldump');

  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(outputFile);
    const child = spawn(binary, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stderrBuffer = '';
    let progressTimer: NodeJS.Timeout | null = null;

    const tickProgress = async () => {
      try {
        const stat = await fs.stat(outputFile);
        onProgress?.(stat.size);
      } catch {
        // ignore while file is being created
      }
    };

    progressTimer = setInterval(() => {
      void tickProgress();
    }, 1500);

    child.stdout.pipe(out);
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderrBuffer += text;

      const lines = text
        .split(/\r?\n/)
        .map((line: string) => line.trim())
        .filter(Boolean);

      for (const line of lines) {
        onEngineLog?.(line);
      }
    });

    child.once('error', (err) => {
      if (progressTimer) clearInterval(progressTimer);
      out.destroy();
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error(`Binario '${command}' nao encontrado no PATH`));
        return;
      }
      reject(err);
    });

    child.once('close', (code) => {
      if (progressTimer) clearInterval(progressTimer);
      out.end();

      void tickProgress().finally(() => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(stderrBuffer.trim() || `${command} terminou com codigo ${code}`));
      });
    });
  });
}

async function compressArtifact(inputFile: string, compression: 'none' | 'gzip') {
  if (compression === 'none') {
    const stat = await fs.stat(inputFile);
    return { outputFile: inputFile, compressedSizeBytes: stat.size, compressionExtension: '' };
  }

  const outputFile = `${inputFile}.gz`;
  await pipeline(createReadStream(inputFile), createGzip({ level: 6 }), createWriteStream(outputFile));
  const stat = await fs.stat(outputFile);
  return { outputFile, compressedSizeBytes: stat.size, compressionExtension: '.gz' };
}

async function computeSha256(filePath: string) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(filePath), async function* (source) {
    for await (const chunk of source) {
      hash.update(chunk as Buffer);
      yield chunk;
    }
  });
  return hash.digest('hex');
}

async function processExecution(executionId: string) {
  if (processing.has(executionId)) return;
  processing.add(executionId);

  const executionLogs: ExecutionLogEntry[] = [];
  const runtimeMetadata: RuntimeMetadata = { execution_logs: executionLogs };
  let lastPersistAt = 0;

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

  try {
    const execution = await prisma.backupExecution.findUniqueOrThrow({
      where: { id: executionId },
      include: {
        job: { select: { id: true, name: true, backupOptions: true } },
        datasource: { select: { type: true, name: true, connectionConfig: true } },
      },
    });

    pushLog('info', `Job '${execution.job.name}' iniciado para datasource '${execution.datasource.name}'`, true);

    const dsTest = execution.datasource.type === 'postgres' || execution.datasource.type === 'mysql'
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

    const dumpInfo = await runDumpToFile({
      datasourceType: execution.datasource.type,
      connectionConfig: execution.datasource.connectionConfig,
      outputFile: rawDumpFile,
      onProgress: (bytes) => {
        const now = Date.now();
        if (now - lastDumpProgressLogAt >= 4000 && bytes !== lastDumpBytes) {
          lastDumpProgressLogAt = now;
          lastDumpBytes = bytes;
          const mb = (bytes / (1024 * 1024)).toFixed(1);
          pushLog('info', `Progresso dump: ${mb} MB gerados`, true);
        }
      },
      onEngineLog: (line: string) => {
        pushLog('debug', `[engine] ${line}`);
      },
    });

    pushLog('success', `Dump concluido (${dumpInfo.extension})`, true);

    const rawStat = await fs.stat(rawDumpFile);
    const compressed = await compressArtifact(rawDumpFile, compression);
    const checksum = await computeSha256(compressed.outputFile);

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

    pushLog('info', `Backup pronto para envio (${compressed.compressedSizeBytes} bytes)`, true);

    const successes: Array<{
      storage_location_id: string;
      backup_path: string;
      manifest_path: string;
      latency_ms: number | null;
    }> = [];
    const failures: Array<{ storage_location_id: string; error: string }> = [];

    for (const target of targets) {
      const storage = await prisma.storageLocation.findUnique({
        where: { id: target.storage_location_id },
        select: { id: true, name: true, type: true, config: true },
      });

      if (!storage) {
        const error = 'Storage nao encontrado';
        failures.push({ storage_location_id: target.storage_location_id, error });
        pushLog('error', `Falha no destino ${target.storage_location_id}: ${error}`, true);
        continue;
      }

      try {
        const adapter = createStorageAdapter(storage.type, storage.config);

        pushLog('info', `Conectando ao storage '${storage.name}' (${storage.type})`, true);
        const slTest = await adapter.testConnection();

        let lastUploadPercent = -1;
        const savedBackup = await adapter.upload(compressed.outputFile, backupRelativePath, {
          onProgress: (progress) => {
            const rounded = Math.floor(progress.percent / 10) * 10;
            if (rounded > lastUploadPercent && rounded % 10 === 0) {
              lastUploadPercent = rounded;
              pushLog('info', `Upload ${storage.name}: ${rounded}%`, true);
            }
          },
        });

        const manifestRelativePath = path.posix.join(baseRelativeFolder, 'manifest.json');
        const savedManifest = await adapter.upload(manifestFile, manifestRelativePath);

        successes.push({
          storage_location_id: storage.id,
          backup_path: savedBackup.backupPath,
          manifest_path: savedManifest.backupPath,
          latency_ms: slTest.latencyMs,
        });

        pushLog('success', `Backup salvo em '${savedBackup.backupPath}'`, true);

        if (strategy === 'fallback') break;
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        failures.push({ storage_location_id: storage.id, error });
        pushLog('error', `Falha ao gravar no storage '${storage.name}': ${error}`, true);
      }
    }

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
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
    processing.delete(executionId);
  }
}

export async function triggerBackupExecutionNow(executionId: string) {
  await processExecution(executionId);
}

async function executeBackupCycle() {
  if (running) return;
  running = true;

  try {
    const currentlyRunning = processing.size;
    const remainingSlots = Math.max(0, config.workers.maxConcurrentBackups - currentlyRunning);
    if (remainingSlots <= 0) return;

    const queued = await prisma.backupExecution.findMany({
      where: { status: 'queued' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
      take: remainingSlots,
    });

    await Promise.all(queued.map((q) => processExecution(q.id)));
  } catch (err) {
    markWorkerError('backup', err);
    logger.error({ err }, 'Erro no backup worker');
  } finally {
    running = false;
  }
}

export function startBackupWorker() {
  if (timer) return;

  markWorkerRunning('backup');
  void executeBackupCycle();

  timer = setInterval(() => {
    void executeBackupCycle();
  }, 3000);

  logger.info(
    { concurrency: config.workers.maxConcurrentBackups },
    'Backup worker inicializado',
  );
}

export function stopBackupWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  markWorkerStopped('backup');
  logger.info('Backup worker finalizado');
}
