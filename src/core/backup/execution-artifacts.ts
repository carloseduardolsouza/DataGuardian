import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Prisma, StorageLocationType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { createStorageAdapter } from '../storage/storage-factory';
import { normalizeLocalStoragePath } from '../../utils/runtime';
import { applyDeltaArtifact } from './delta';
import { decompressBackupFile } from './compressor';

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

interface StorageRefRaw {
  storage_location_id: string;
  backup_path: string | null;
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

function readArtifactKind(metadata: unknown): 'full' | 'delta' {
  const value = asString(asObject(metadata).backup_artifact_kind)?.toLowerCase();
  return value === 'delta' ? 'delta' : 'full';
}

function readDeltaBaseExecutionId(metadata: unknown) {
  return asString(asObject(metadata).delta_base_execution_id);
}

function buildArtifactRefs(execution: {
  storageLocationId: string;
  backupPath: string | null;
  metadata: Prisma.JsonValue | null;
}) {
  const refs = getMetadataStorageRefs(execution.metadata);
  if (refs.length === 0) {
    refs.push({
      storage_location_id: execution.storageLocationId,
      backup_path: execution.backupPath,
    });
  }
  return refs;
}

async function downloadExecutionArtifact(params: {
  execution: {
    id: string;
    storageLocationId: string;
    backupPath: string | null;
    metadata: Prisma.JsonValue | null;
  };
  outputDir: string;
  preferredStorageIds?: string[];
  onLog?: (line: string) => void;
}) {
  const refs = buildArtifactRefs(params.execution);
  const uploadRelativePath = getUploadContextBackupRelativePath(params.execution.metadata);

  const orderedStorageIds = [
    ...(params.preferredStorageIds ?? []),
    ...refs.map((ref) => ref.storage_location_id),
  ];

  const uniqueStorageIds = [...new Set(orderedStorageIds)];

  for (const storageId of uniqueStorageIds) {
    const storage = await prisma.storageLocation.findUnique({
      where: { id: storageId },
      select: { id: true, name: true, type: true, config: true },
    });
    if (!storage) continue;

    const ref = refs.find((item) => item.storage_location_id === storageId);
    const relativePath =
      uploadRelativePath
      ?? inferRelativePathFromBackupPath(storage.type, ref?.backup_path ?? null, storage.config)
      ?? inferRelativePathFromBackupPath(storage.type, params.execution.backupPath, storage.config);

    if (!relativePath) {
      params.onLog?.(`Storage '${storage.name}' sem caminho relativo para artefato`);
      continue;
    }

    const adapter = createStorageAdapter(storage.type, storage.config);
    const destination = path.join(
      params.outputDir,
      `${params.execution.id}_${path.basename(relativePath)}`,
    );

    try {
      await adapter.download(relativePath, destination);
      params.onLog?.(`Artefato ${params.execution.id} baixado de '${storage.name}'`);
      return {
        downloadedFile: destination,
        storageId: storage.id,
        storageName: storage.name,
        relativePath,
      };
    } catch (err) {
      params.onLog?.(
        `Falha ao baixar artefato ${params.execution.id} de '${storage.name}': ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  throw new Error(`Nao foi possivel baixar artefato da execucao ${params.execution.id} em nenhum storage`);
}

async function ensureUncompressed(filePath: string) {
  return decompressBackupFile(filePath);
}

export async function materializeExecutionRawSnapshot(params: {
  executionId: string;
  outputDir: string;
  preferredStorageIds?: string[];
  onLog?: (line: string) => void;
  visited?: Set<string>;
}): Promise<{
  rawFile: string;
  targetExtension: string;
  sourceStorage?: { id: string; name: string; relativePath: string };
}> {
  const visited = params.visited ?? new Set<string>();
  if (visited.has(params.executionId)) {
    throw new Error(`Ciclo detectado na cadeia de backup: ${params.executionId}`);
  }
  visited.add(params.executionId);

  const execution = await prisma.backupExecution.findUniqueOrThrow({
    where: { id: params.executionId },
    select: {
      id: true,
      storageLocationId: true,
      backupPath: true,
      metadata: true,
      backupType: true,
    },
  });

  await fs.mkdir(params.outputDir, { recursive: true });

  const downloaded = await downloadExecutionArtifact({
    execution,
    outputDir: params.outputDir,
    preferredStorageIds: params.preferredStorageIds,
    onLog: params.onLog,
  });

  const artifactFile = await ensureUncompressed(downloaded.downloadedFile);
  const artifactKind = readArtifactKind(execution.metadata);

  if (artifactKind === 'full') {
    const ext = path.extname(artifactFile);
    return {
      rawFile: artifactFile,
      targetExtension: ext,
      sourceStorage: {
        id: downloaded.storageId,
        name: downloaded.storageName,
        relativePath: downloaded.relativePath,
      },
    };
  }

  const baseExecutionId = readDeltaBaseExecutionId(execution.metadata);
  if (!baseExecutionId) {
    throw new Error(`Execucao ${execution.id} marcada como delta sem base definida`);
  }

  params.onLog?.(`Reconstruindo execucao ${execution.id} a partir da base ${baseExecutionId}`);

  const base = await materializeExecutionRawSnapshot({
    executionId: baseExecutionId,
    outputDir: path.join(params.outputDir, 'base', baseExecutionId),
    preferredStorageIds: params.preferredStorageIds,
    onLog: params.onLog,
    visited,
  });

  const reconstructedOutput = path.join(params.outputDir, `${execution.id}.reconstructed`);
  const applied = await applyDeltaArtifact({
    baseFile: base.rawFile,
    deltaFile: artifactFile,
    outputFile: reconstructedOutput,
  });

  return {
    rawFile: reconstructedOutput,
    targetExtension: applied.targetExtension || base.targetExtension,
    sourceStorage: {
      id: downloaded.storageId,
      name: downloaded.storageName,
      relativePath: downloaded.relativePath,
    },
  };
}

export async function findBaseExecutionForBackupType(params: {
  jobId: string;
  beforeExecutionId: string;
  backupType: 'incremental' | 'differential';
}) {
  const current = await prisma.backupExecution.findUniqueOrThrow({
    where: { id: params.beforeExecutionId },
    select: { createdAt: true },
  });

  if (params.backupType === 'incremental') {
    return prisma.backupExecution.findFirst({
      where: {
        jobId: params.jobId,
        id: { not: params.beforeExecutionId },
        status: 'completed',
        createdAt: { lt: current.createdAt },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, backupType: true, createdAt: true },
    });
  }

  return prisma.backupExecution.findFirst({
    where: {
      jobId: params.jobId,
      id: { not: params.beforeExecutionId },
      status: 'completed',
      backupType: 'full',
      createdAt: { lt: current.createdAt },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, backupType: true, createdAt: true },
  });
}
