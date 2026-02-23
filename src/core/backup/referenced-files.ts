import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import SftpClient from 'ssh2-sftp-client';
import { hashFileSha256 } from '../performance/thread-pool';

type MissingFilePolicy = 'warn' | 'fail';
type ReferencedFilesSourceType = 'local' | 'ssh';

interface ReferencedFilesRawConfig {
  enabled?: unknown;
  discovery_query?: unknown;
  path_column?: unknown;
  base_directories?: unknown;
  missing_file_policy?: unknown;
  max_files?: unknown;
  source_type?: unknown;
  source?: unknown;
}

interface BackupOptionsWithReferencedFiles {
  referenced_files?: ReferencedFilesRawConfig;
}

interface SSHSourceConfig {
  host: string;
  port: number;
  username: string;
  password: string | null;
  privateKey: string | null;
}

export interface ReferencedFilesConfig {
  enabled: boolean;
  discoveryQuery: string;
  pathColumn: string | null;
  baseDirectories: string[];
  missingFilePolicy: MissingFilePolicy;
  maxFiles: number;
  sourceType: ReferencedFilesSourceType;
  sourceSsh: SSHSourceConfig | null;
}

interface QueryExecutionResult {
  rows: Record<string, unknown>[];
}

export interface ReferencedFileRecord {
  source_path: string;
  base_directory: string;
  logical_path: string;
  artifact_relative_path: string;
  size_bytes: number;
  checksum: string;
  local_file: string;
}

export interface ReferencedFilesCollection {
  manifestFilePath: string;
  uploadManifestRelativePath: string;
  uploadFiles: Array<{ local_file: string; relative_path: string }>;
  summary: {
    enabled: true;
    total_references: number;
    processed_files: number;
    missing_files: string[];
    invalid_references: string[];
    total_size_bytes: number;
  };
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toPosixRelative(value: string) {
  return value.replace(/\\/g, '/');
}

function sanitizeArtifactName(value: string) {
  const cleaned = value
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_');
  return cleaned || 'file.bin';
}

function isSubPath(baseDir: string, targetPath: string) {
  const relative = path.relative(baseDir, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function fileExists(filePath: string) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

function isRemoteFileType(type: false | '-' | 'd' | 'l') {
  return type === '-' || type === 'l';
}

function isSubPathPosix(baseDir: string, targetPath: string) {
  const relative = path.posix.relative(baseDir, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.posix.isAbsolute(relative));
}

function normalizeRemote(value: string) {
  return path.posix.normalize(value.replace(/\\/g, '/'));
}

function firstStringValue(row: Record<string, unknown>) {
  for (const value of Object.values(row)) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

async function resolveReferencePath(refPath: string, baseDirectories: string[]) {
  if (path.isAbsolute(refPath)) {
    const absolute = path.resolve(refPath);
    const base = baseDirectories.find((candidate) => isSubPath(candidate, absolute));
    if (!base) return null;
    return {
      absolute,
      baseDirectory: base,
      logicalPath: toPosixRelative(path.relative(base, absolute)),
    };
  }

  for (const base of baseDirectories) {
    const absolute = path.resolve(base, refPath);
    if (!isSubPath(base, absolute)) continue;
    if (await fileExists(absolute)) {
      return {
        absolute,
        baseDirectory: base,
        logicalPath: toPosixRelative(path.relative(base, absolute)),
      };
    }
  }

  const fallbackBase = baseDirectories[0];
  const fallbackAbsolute = path.resolve(fallbackBase, refPath);
  if (!isSubPath(fallbackBase, fallbackAbsolute)) return null;
  return {
    absolute: fallbackAbsolute,
    baseDirectory: fallbackBase,
    logicalPath: toPosixRelative(path.relative(fallbackBase, fallbackAbsolute)),
  };
}

async function resolveRemoteReferencePath(
  client: SftpClient,
  refPath: string,
  baseDirectories: string[],
) {
  const normalizedRef = normalizeRemote(refPath);

  if (path.posix.isAbsolute(normalizedRef)) {
    const absolute = normalizedRef;
    const base = baseDirectories.find((candidate) => isSubPathPosix(candidate, absolute));
    if (!base) return null;
    return {
      absolute,
      baseDirectory: base,
      logicalPath: toPosixRelative(path.posix.relative(base, absolute)),
    };
  }

  for (const base of baseDirectories) {
    const absolute = path.posix.join(base, normalizedRef);
    if (!isSubPathPosix(base, absolute)) continue;
    const exists = await client.exists(absolute);
    if (isRemoteFileType(exists)) {
      return {
        absolute,
        baseDirectory: base,
        logicalPath: toPosixRelative(path.posix.relative(base, absolute)),
      };
    }
  }

  const fallbackBase = baseDirectories[0];
  const fallbackAbsolute = path.posix.join(fallbackBase, normalizedRef);
  if (!isSubPathPosix(fallbackBase, fallbackAbsolute)) return null;
  return {
    absolute: fallbackAbsolute,
    baseDirectory: fallbackBase,
    logicalPath: toPosixRelative(path.posix.relative(fallbackBase, fallbackAbsolute)),
  };
}

async function withSftpClient<T>(config: SSHSourceConfig, runner: (client: SftpClient) => Promise<T>) {
  const client = new SftpClient();
  try {
    await client.connect({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password ?? undefined,
      privateKey: config.privateKey ?? undefined,
      readyTimeout: 15000,
    });
    return await runner(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

export function parseReferencedFilesConfig(backupOptions: unknown): ReferencedFilesConfig | null {
  const options = asObject(backupOptions) as BackupOptionsWithReferencedFiles;
  const raw = asObject(options.referenced_files);
  const enabled = Boolean(raw.enabled);
  if (!enabled) return null;

  const discoveryQuery = String(raw.discovery_query ?? '').trim();
  if (!discoveryQuery) {
    throw new Error('referenced_files.discovery_query obrigatorio quando referenced_files.enabled=true');
  }

  const sourceTypeRaw = String(raw.source_type ?? 'local').trim().toLowerCase();
  const sourceType: ReferencedFilesSourceType = sourceTypeRaw === 'ssh' ? 'ssh' : 'local';
  const source = asObject(raw.source);

  let sourceSsh: SSHSourceConfig | null = null;
  if (sourceType === 'ssh') {
    const host = String(source.host ?? '').trim();
    const username = String(source.username ?? '').trim();
    const password = String(source.password ?? '').trim();
    const privateKey = String(source.private_key ?? '').trim();
    const portRaw = Number(source.port ?? 22);
    const port = Number.isFinite(portRaw) ? Math.max(1, Math.min(65535, Math.trunc(portRaw))) : 22;

    if (!host || !username || (!password && !privateKey)) {
      throw new Error('referenced_files.source (ssh) requer host, username e password ou private_key');
    }

    sourceSsh = {
      host,
      port,
      username,
      password: password || null,
      privateKey: privateKey || null,
    };
  }

  const baseDirectories = Array.isArray(raw.base_directories)
    ? raw.base_directories
      .map((value) => String(value ?? '').trim())
      .filter((value) => value.length > 0)
      .map((value) => sourceType === 'ssh' ? normalizeRemote(value) : path.resolve(value))
    : [];

  if (baseDirectories.length === 0) {
    throw new Error('referenced_files.base_directories precisa ter ao menos um diretorio');
  }

  const pathColumnRaw = String(raw.path_column ?? '').trim();
  const pathColumn = pathColumnRaw.length > 0 ? pathColumnRaw : null;
  const policyRaw = String(raw.missing_file_policy ?? 'warn').toLowerCase();
  const missingFilePolicy: MissingFilePolicy = policyRaw === 'fail' ? 'fail' : 'warn';
  const maxFilesRaw = Number(raw.max_files ?? 2000);
  const maxFiles = Number.isFinite(maxFilesRaw)
    ? Math.max(1, Math.min(20000, Math.trunc(maxFilesRaw)))
    : 2000;

  return {
    enabled: true,
    discoveryQuery,
    pathColumn,
    baseDirectories,
    missingFilePolicy,
    maxFiles,
    sourceType,
    sourceSsh,
  };
}

export async function collectReferencedFilesArtifacts(params: {
  config: ReferencedFilesConfig;
  tempDir: string;
  runQuery: (sql: string) => Promise<QueryExecutionResult>;
  pushLog: (level: 'info' | 'warn' | 'error' | 'debug' | 'success', message: string, logToTerminal?: boolean) => void;
}) {
  const { config, tempDir, runQuery, pushLog } = params;
  const referencedRootDir = path.join(tempDir, 'referenced-files');
  const referencedDataDir = path.join(referencedRootDir, 'data');
  await fs.mkdir(referencedDataDir, { recursive: true });

  pushLog('info', 'Coletando referencias de arquivos via query configurada', true);
  const queryResult = await runQuery(config.discoveryQuery);
  const rows = Array.isArray(queryResult.rows) ? queryResult.rows : [];
  const references: string[] = [];

  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const map = row as Record<string, unknown>;
    const fromPathColumn = config.pathColumn ? map[config.pathColumn] : undefined;
    const ref = typeof fromPathColumn === 'string' && fromPathColumn.trim()
      ? fromPathColumn.trim()
      : firstStringValue(map);
    if (ref) references.push(ref);
  }

  const missingFiles: string[] = [];
  const invalidReferences: string[] = [];
  const stagedFiles: ReferencedFileRecord[] = [];
  const seenSourcePaths = new Set<string>();
  let totalSizeBytes = 0;

  const collectOne = async (
    refPath: string,
    resolved: { absolute: string; baseDirectory: string; logicalPath: string },
    fetchRemoteToLocal?: (remotePath: string, localPath: string) => Promise<void>,
  ) => {
    if (seenSourcePaths.has(resolved.absolute)) return;
    seenSourcePaths.add(resolved.absolute);

    if (stagedFiles.length >= config.maxFiles) {
      throw new Error(`Limite de arquivos referenciados excedido (${config.maxFiles})`);
    }

    const extension = path.extname(resolved.absolute).slice(0, 24);
    const stagedName = `${String(stagedFiles.length + 1).padStart(6, '0')}_${sanitizeArtifactName(path.basename(resolved.absolute, extension))}${extension}`;
    const artifactRelativePath = toPosixRelative(path.posix.join('data', stagedName));
    const stagedFile = path.join(referencedRootDir, artifactRelativePath);

    await fs.mkdir(path.dirname(stagedFile), { recursive: true });
    if (fetchRemoteToLocal) {
      await fetchRemoteToLocal(resolved.absolute, stagedFile);
    } else {
      await fs.copyFile(resolved.absolute, stagedFile);
    }

    const stat = await fs.stat(stagedFile);
    const checksum = await hashFileSha256(stagedFile);
    totalSizeBytes += stat.size;

    stagedFiles.push({
      source_path: refPath,
      base_directory: resolved.baseDirectory,
      logical_path: resolved.logicalPath,
      artifact_relative_path: artifactRelativePath,
      size_bytes: stat.size,
      checksum: `sha256:${checksum}`,
      local_file: stagedFile,
    });
  };

  if (config.sourceType === 'ssh') {
    if (!config.sourceSsh) {
      throw new Error('Configuracao ssh ausente para coleta de arquivos referenciados');
    }

    pushLog(
      'info',
      `Conectando no servidor remoto de arquivos (${config.sourceSsh.host}:${config.sourceSsh.port})`,
      true,
    );

    await withSftpClient(config.sourceSsh, async (client) => {
      for (const refPath of references) {
        const resolved = await resolveRemoteReferencePath(client, refPath, config.baseDirectories);
        if (!resolved) {
          invalidReferences.push(refPath);
          continue;
        }

        const exists = await client.exists(resolved.absolute);
        if (!isRemoteFileType(exists)) {
          missingFiles.push(refPath);
          if (config.missingFilePolicy === 'fail') {
            throw new Error(`Arquivo remoto referenciado nao encontrado: ${refPath}`);
          }
          continue;
        }

        await collectOne(refPath, resolved, async (remotePath, localPath) => {
          await client.fastGet(remotePath, localPath);
        });
      }
    });
  } else {
    for (const refPath of references) {
      const resolved = await resolveReferencePath(refPath, config.baseDirectories);
      if (!resolved) {
        invalidReferences.push(refPath);
        continue;
      }

      if (!await fileExists(resolved.absolute)) {
        missingFiles.push(refPath);
        if (config.missingFilePolicy === 'fail') {
          throw new Error(`Arquivo referenciado nao encontrado: ${refPath}`);
        }
        continue;
      }

      await collectOne(refPath, resolved);
    }
  }

  const manifestData = {
    version: '1.0',
    created_at: new Date().toISOString(),
    query: config.discoveryQuery,
    source_type: config.sourceType,
    path_column: config.pathColumn,
    base_directories: config.baseDirectories,
    missing_file_policy: config.missingFilePolicy,
    max_files: config.maxFiles,
    total_references: references.length,
    processed_files: stagedFiles.length,
    missing_files: missingFiles,
    invalid_references: invalidReferences,
    total_size_bytes: totalSizeBytes,
    files: stagedFiles.map((file) => ({
      source_path: file.source_path,
      base_directory: file.base_directory,
      logical_path: file.logical_path,
      artifact_relative_path: file.artifact_relative_path,
      size_bytes: file.size_bytes,
      checksum: file.checksum,
    })),
  };

  const manifestFilePath = path.join(referencedRootDir, 'manifest.json');
  await fs.writeFile(manifestFilePath, JSON.stringify(manifestData, null, 2), 'utf8');

  pushLog(
    'success',
    `Arquivos referenciados coletados: ${stagedFiles.length} arquivo(s), ${totalSizeBytes} bytes`,
    true,
  );

  return {
    manifestFilePath,
    uploadManifestRelativePath: path.posix.join('referenced-files', 'manifest.json'),
    uploadFiles: stagedFiles.map((file) => ({
      local_file: file.local_file,
      relative_path: path.posix.join('referenced-files', file.artifact_relative_path),
    })),
    summary: {
      enabled: true as const,
      total_references: references.length,
      processed_files: stagedFiles.length,
      missing_files: missingFiles,
      invalid_references: invalidReferences,
      total_size_bytes: totalSizeBytes,
    },
  };
}
