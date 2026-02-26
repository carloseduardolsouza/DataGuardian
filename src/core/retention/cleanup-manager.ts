import { Prisma, type StorageLocationType } from '@prisma/client';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { prisma } from '../../lib/prisma';
import { resolveLocalStoragePath } from '../../utils/runtime';
import { createStorageAdapter } from '../storage/storage-factory';
import { logger } from '../../utils/logger';

function asNumber(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
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

function shouldAutoDelete(retentionPolicy: Prisma.JsonValue) {
  const policy = retentionPolicy as Record<string, unknown>;
  return Boolean(policy?.auto_delete);
}

function computeKeepCount(retentionPolicy: Prisma.JsonValue) {
  const policy = retentionPolicy as Record<string, unknown>;
  const maxBackups = asNumber(policy?.max_backups, -1);
  if (maxBackups >= 0) {
    return Math.max(0, Math.floor(maxBackups));
  }

  const keepDaily = asNumber(policy?.keep_daily, 7);
  const keepWeekly = asNumber(policy?.keep_weekly, 4);
  const keepMonthly = asNumber(policy?.keep_monthly, 12);
  return Math.max(0, keepDaily + keepWeekly + keepMonthly);
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
    const base = normalizeSlash(resolveLocalStoragePath(localBase)).replace(/\/+$/, '');
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

function parseStorageSuccesses(metadata: Prisma.JsonValue | null) {
  const raw = asObject(metadata).storage_successes;
  if (!Array.isArray(raw)) return [] as Array<{ storage_location_id: string; backup_path: string | null; manifest_path: string | null }>;

  return raw
    .map((item) => {
      const entry = asObject(item);
      const storageId = asString(entry.storage_location_id);
      if (!storageId) return null;
      return {
        storage_location_id: storageId,
        backup_path: asString(entry.backup_path),
        manifest_path: asString(entry.manifest_path),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

async function deleteExecutionArtifacts(execution: {
  id: string;
  storageLocationId: string;
  backupPath: string | null;
  metadata: Prisma.JsonValue | null;
}) {
  const metadataObj = asObject(execution.metadata);
  const uploadCtx = asObject(metadataObj.upload_context);
  const localArtifacts = asObject(metadataObj.local_artifacts);
  const storageSuccesses = parseStorageSuccesses(execution.metadata);

  if (!storageSuccesses.some((item) => item.storage_location_id === execution.storageLocationId)) {
    storageSuccesses.push({
      storage_location_id: execution.storageLocationId,
      backup_path: execution.backupPath,
      manifest_path: null,
    });
  }

  const storageIds = [...new Set(storageSuccesses.map((item) => item.storage_location_id))];
  const storages = await prisma.storageLocation.findMany({
    where: { id: { in: storageIds } },
    select: { id: true, type: true, config: true },
  });
  const storageById = new Map(storages.map((s) => [s.id, s]));

  const errors: string[] = [];

  for (const ref of storageSuccesses) {
    const storage = storageById.get(ref.storage_location_id);
    if (!storage) {
      errors.push(`storage '${ref.storage_location_id}' nao encontrado`);
      continue;
    }

    try {
      const adapter = createStorageAdapter(storage.type, storage.config);
      const relativeCandidates = new Set<string>();
      const folderCandidates = new Set<string>();

      const backupRelativeFromCtx = asString(uploadCtx.backup_relative_path);
      const manifestRelativeFromCtx = asString(uploadCtx.manifest_relative_path);
      const baseRelativeFolder = asString(uploadCtx.base_relative_folder);

      if (backupRelativeFromCtx) relativeCandidates.add(backupRelativeFromCtx);
      if (manifestRelativeFromCtx) relativeCandidates.add(manifestRelativeFromCtx);
      if (backupRelativeFromCtx) folderCandidates.add(path.posix.dirname(backupRelativeFromCtx));
      if (manifestRelativeFromCtx) folderCandidates.add(path.posix.dirname(manifestRelativeFromCtx));

      const backupRelativeFromPath = inferRelativePathFromBackupPath(storage.type, ref.backup_path, storage.config);
      const manifestRelativeFromPath = inferRelativePathFromBackupPath(storage.type, ref.manifest_path, storage.config);
      if (backupRelativeFromPath) relativeCandidates.add(backupRelativeFromPath);
      if (manifestRelativeFromPath) relativeCandidates.add(manifestRelativeFromPath);
      if (backupRelativeFromPath) folderCandidates.add(path.posix.dirname(backupRelativeFromPath));
      if (manifestRelativeFromPath) folderCandidates.add(path.posix.dirname(manifestRelativeFromPath));

      if (baseRelativeFolder) {
        folderCandidates.add(baseRelativeFolder);
        const files = await adapter.list(baseRelativeFolder);
        for (const file of files) {
          if (file.startsWith(`${baseRelativeFolder}/`) || file === baseRelativeFolder) {
            relativeCandidates.add(file);
          }
        }
      }

      if (storage.type === 'local') {
        const localRoot = asString(asObject(storage.config).path);
        if (localRoot) {
          const resolvedRoot = resolveLocalStoragePath(localRoot);
          for (const folder of folderCandidates) {
            const trimmed = folder.trim();
            if (!trimmed || trimmed === '.' || trimmed === '/') continue;
            const absoluteFolder = path.join(resolvedRoot, ...trimmed.split('/').filter(Boolean));
            await fs.rm(absoluteFolder, { recursive: true, force: true });
          }
        }
      }

      for (const relativePath of relativeCandidates) {
        await adapter.delete(relativePath).catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`falha ao remover '${relativePath}': ${msg}`);
        });
      }
    } catch (err) {
      errors.push(
        `storage '${ref.storage_location_id}': ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const tempDir = asString(localArtifacts.temp_dir);
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }

  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }
}

export async function deleteBackupExecutionWithArtifacts(executionId: string) {
  const execution = await prisma.backupExecution.findUnique({
    where: { id: executionId },
    select: {
      id: true,
      storageLocationId: true,
      backupPath: true,
      metadata: true,
    },
  });

  if (!execution) return false;

  await deleteExecutionArtifacts(execution);
  await prisma.$transaction([
    prisma.backupChunk.deleteMany({ where: { executionId } }),
    prisma.backupExecution.delete({ where: { id: executionId } }),
  ]);
  return true;
}

export async function deleteBackupExecutionsWithArtifacts(executionIds: string[]) {
  const uniqueIds = [...new Set(executionIds.map((id) => id.trim()).filter(Boolean))];
  let deleted = 0;
  for (const executionId of uniqueIds) {
    const removed = await deleteBackupExecutionWithArtifacts(executionId);
    if (removed) deleted += 1;
  }
  return deleted;
}

async function cleanupForJobs(
  jobs: Array<{ id: string; name: string; datasourceId: string; retentionPolicy: Prisma.JsonValue }>,
) {
  let deletedExecutions = 0;
  let processedJobs = 0;

  const datasourceKeepRules = new Map<string, { keepCount: number; exampleJob: { id: string; name: string } }>();

  for (const job of jobs) {
    if (!shouldAutoDelete(job.retentionPolicy)) continue;
    processedJobs += 1;

    const keepCount = computeKeepCount(job.retentionPolicy);
    const existing = datasourceKeepRules.get(job.datasourceId);
    if (!existing || keepCount < existing.keepCount) {
      datasourceKeepRules.set(job.datasourceId, {
        keepCount,
        exampleJob: { id: job.id, name: job.name },
      });
    }
  }

  for (const [datasourceId, rule] of datasourceKeepRules.entries()) {
    const completed = await prisma.backupExecution.findMany({
      where: {
        datasourceId,
        status: 'completed',
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, storageLocationId: true, backupPath: true, metadata: true },
    });

    if (completed.length <= rule.keepCount) continue;

    const candidates = completed.slice(rule.keepCount);
    const deletableIds: string[] = [];
    for (const execution of candidates) {
      try {
        await deleteExecutionArtifacts(execution);
        deletableIds.push(execution.id);
      } catch (err) {
        logger.error(
          {
            executionId: execution.id,
            datasourceId,
            err,
          },
          'Cleanup pulou exclusao por falha ao remover artefatos fisicos',
        );
      }
    }

    if (deletableIds.length === 0) continue;

    await prisma.backupChunk.deleteMany({ where: { executionId: { in: deletableIds } } });
    const delResult = await prisma.backupExecution.deleteMany({ where: { id: { in: deletableIds } } });
    deletedExecutions += delResult.count;

    logger.info(
      {
        datasourceId,
        jobId: rule.exampleJob.id,
        deleted: delResult.count,
        keepCount: rule.keepCount,
      },
      `Cleanup aplicado no datasource via job '${rule.exampleJob.name}'`,
    );
  }

  return {
    processed_jobs: processedJobs,
    deleted_executions: deletedExecutions,
  };
}

export async function runCleanupCycle() {
  const jobs = await prisma.backupJob.findMany({
    select: {
      id: true,
      name: true,
      datasourceId: true,
      retentionPolicy: true,
    },
  });

  return cleanupForJobs(jobs);
}

export async function runCleanupForJob(jobId: string) {
  const job = await prisma.backupJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      name: true,
      datasourceId: true,
      retentionPolicy: true,
    },
  });

  if (!job) {
    return {
      processed_jobs: 0,
      deleted_executions: 0,
    };
  }

  return cleanupForJobs([job]);
}
