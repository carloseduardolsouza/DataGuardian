import { Prisma, StorageLocationType, StorageLocationStatus } from '@prisma/client';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as net from 'node:net';
import { prisma } from '../../lib/prisma';
import { AppError } from '../middlewares/error-handler';
import {
  SENSITIVE_STORAGE_FIELDS,
  StorageTypeValue,
  localConfigSchema,
  sshConfigSchema,
  s3ConfigSchema,
  minioConfigSchema,
  backblazeConfigSchema,
} from '../../types/storage.types';

// Helpers

export function maskStorageConfig(type: StorageLocationType, config: Record<string, unknown>) {
  const sensitiveFields = SENSITIVE_STORAGE_FIELDS[type as StorageTypeValue] ?? [];
  const masked: Record<string, unknown> = { ...config };
  for (const field of sensitiveFields) {
    if (field in masked) masked[field] = '**********';
  }
  return masked;
}

export function formatStorageLocation(sl: {
  id: string;
  name: string;
  type: StorageLocationType;
  isDefault: boolean;
  availableSpaceGb: Prisma.Decimal | null;
  status: StorageLocationStatus;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: sl.id,
    name: sl.name,
    type: sl.type,
    is_default: sl.isDefault,
    available_space_gb: sl.availableSpaceGb ? Number(sl.availableSpaceGb) : null,
    status: sl.status,
    created_at: sl.createdAt.toISOString(),
    updated_at: sl.updatedAt.toISOString(),
  };
}

// Query types

export interface ListStorageFilters {
  type?: string;
  status?: string;
}

export interface CreateStorageLocationData {
  name: string;
  type: string;
  config: Record<string, unknown>;
  is_default: boolean;
}

export interface UpdateStorageLocationData {
  name?: string;
  config?: Record<string, unknown>;
  is_default?: boolean;
}

type JsonMap = Record<string, unknown>;

type ConnectionTestResult = {
  available_space_gb: number | null;
  latency_ms: number;
};

function isPlainObject(value: unknown): value is JsonMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeConfig(value: unknown): JsonMap {
  return isPlainObject(value) ? value : {};
}

function getString(
  cfg: JsonMap,
  key: string,
  storageType: StorageLocationType,
  {
    required = true,
    trim = true,
    fallback,
  }: { required?: boolean; trim?: boolean; fallback?: unknown } = {},
) {
  const raw = cfg[key] ?? fallback;
  if (raw === undefined || raw === null) {
    if (!required) return '';
    throw new AppError(
      'STORAGE_CONFIG_INVALID',
      422,
      `Campo obrigatorio ausente em config para storage '${storageType}': ${key}`,
      { field: key, storage_type: storageType },
    );
  }

  if (typeof raw !== 'string') {
    throw new AppError(
      'STORAGE_CONFIG_INVALID',
      422,
      `Campo invalido em config para storage '${storageType}': ${key} deve ser string`,
      { field: key, storage_type: storageType, received_type: typeof raw },
    );
  }

  const normalized = trim ? raw.trim() : raw;
  if (required && normalized.length === 0) {
    throw new AppError(
      'STORAGE_CONFIG_INVALID',
      422,
      `Campo obrigatorio vazio em config para storage '${storageType}': ${key}`,
      { field: key, storage_type: storageType },
    );
  }

  return normalized;
}

function getNumber(
  cfg: JsonMap,
  key: string,
  storageType: StorageLocationType,
  {
    required = true,
    integer = false,
    positive = false,
    fallback,
  }: {
    required?: boolean;
    integer?: boolean;
    positive?: boolean;
    fallback?: unknown;
  } = {},
) {
  const raw = cfg[key] ?? fallback;
  if (raw === undefined || raw === null || raw === '') {
    if (!required) return undefined;
    throw new AppError(
      'STORAGE_CONFIG_INVALID',
      422,
      `Campo obrigatorio ausente em config para storage '${storageType}': ${key}`,
      { field: key, storage_type: storageType },
    );
  }

  const parsed = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new AppError(
      'STORAGE_CONFIG_INVALID',
      422,
      `Campo invalido em config para storage '${storageType}': ${key} deve ser numero`,
      { field: key, storage_type: storageType },
    );
  }

  if (integer && !Number.isInteger(parsed)) {
    throw new AppError(
      'STORAGE_CONFIG_INVALID',
      422,
      `Campo invalido em config para storage '${storageType}': ${key} deve ser inteiro`,
      { field: key, storage_type: storageType },
    );
  }

  if (positive && parsed <= 0) {
    throw new AppError(
      'STORAGE_CONFIG_INVALID',
      422,
      `Campo invalido em config para storage '${storageType}': ${key} deve ser positivo`,
      { field: key, storage_type: storageType },
    );
  }

  return parsed;
}

function getBoolean(cfg: JsonMap, key: string, fallback = false) {
  const raw = cfg[key];
  if (raw === undefined || raw === null) return fallback;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') return raw.toLowerCase() === 'true';
  return Boolean(raw);
}

function normalizeStorageConfig(
  type: StorageLocationType,
  cfg: JsonMap,
  existing?: JsonMap,
): JsonMap {
  switch (type) {
    case 'local': {
      const normalizedPath = getString(cfg, 'path', type, { fallback: existing?.path });
      const maxSize = getNumber(cfg, 'max_size_gb', type, {
        required: false,
        positive: true,
        fallback: existing?.max_size_gb,
      });
      return {
        path: normalizedPath,
        ...(maxSize !== undefined && { max_size_gb: maxSize }),
      };
    }

    case 'ssh': {
      const host = getString(cfg, 'host', type, { fallback: existing?.host });
      const port = getNumber(cfg, 'port', type, {
        integer: true,
        positive: true,
        fallback: existing?.port ?? 22,
      });
      const username = getString(cfg, 'username', type, { fallback: existing?.username });
      const remotePath = getString(cfg, 'remote_path', type, { fallback: existing?.remote_path });
      const password = getString(cfg, 'password', type, {
        required: false,
        trim: false,
        fallback: existing?.password,
      });
      const privateKey = getString(cfg, 'private_key', type, {
        required: false,
        trim: false,
        fallback: existing?.private_key,
      });

      if (!password && !privateKey) {
        throw new AppError(
          'STORAGE_CONFIG_INVALID',
          422,
          "Informe 'password' ou 'private_key' para autenticacao SSH",
          { storage_type: type },
        );
      }

      return {
        host,
        port,
        username,
        remote_path: remotePath,
        ...(password ? { password } : {}),
        ...(privateKey ? { private_key: privateKey } : {}),
      };
    }

    case 's3': {
      const endpoint = cfg.endpoint ?? existing?.endpoint ?? null;
      const normalizedEndpoint = endpoint === '' ? null : endpoint;
      const bucket = getString(cfg, 'bucket', type, { fallback: existing?.bucket });
      const region = getString(cfg, 'region', type, { fallback: existing?.region });
      const accessKey = getString(cfg, 'access_key_id', type, { fallback: existing?.access_key_id });
      const secretKey = getString(cfg, 'secret_access_key', type, {
        trim: false,
        fallback: existing?.secret_access_key,
      });
      const storageClass = getString(cfg, 'storage_class', type, {
        required: false,
        fallback: existing?.storage_class,
      });
      return {
        endpoint: normalizedEndpoint,
        bucket,
        region,
        access_key_id: accessKey,
        secret_access_key: secretKey,
        ...(storageClass ? { storage_class: storageClass } : {}),
      };
    }

    case 'minio': {
      const endpoint = getString(cfg, 'endpoint', type, { fallback: existing?.endpoint });
      const bucket = getString(cfg, 'bucket', type, { fallback: existing?.bucket });
      const accessKey = getString(cfg, 'access_key', type, { fallback: existing?.access_key });
      const secretKey = getString(cfg, 'secret_key', type, {
        trim: false,
        fallback: existing?.secret_key,
      });
      return {
        endpoint,
        bucket,
        access_key: accessKey,
        secret_key: secretKey,
        use_ssl: getBoolean(cfg, 'use_ssl', Boolean(existing?.use_ssl)),
      };
    }

    case 'backblaze': {
      const bucketId = getString(cfg, 'bucket_id', type, { fallback: existing?.bucket_id });
      const bucketName = getString(cfg, 'bucket_name', type, { fallback: existing?.bucket_name });
      const appKeyId = getString(cfg, 'application_key_id', type, { fallback: existing?.application_key_id });
      const appKey = getString(cfg, 'application_key', type, {
        trim: false,
        fallback: existing?.application_key,
      });
      return {
        bucket_id: bucketId,
        bucket_name: bucketName,
        application_key_id: appKeyId,
        application_key: appKey,
      };
    }

    default:
      return cfg;
  }
}

function validateStorageConfig(type: StorageLocationType, cfg: JsonMap) {
  const schemaByType = {
    local: localConfigSchema,
    ssh: sshConfigSchema,
    s3: s3ConfigSchema,
    minio: minioConfigSchema,
    backblaze: backblazeConfigSchema,
  } as const;

  const result = schemaByType[type].safeParse(cfg);
  if (!result.success) {
    throw new AppError(
      'STORAGE_CONFIG_INVALID',
      422,
      `Config invalida para storage '${type}': ${result.error.issues.map((i) => i.message).join(', ')}`,
      { storage_type: type, issues: result.error.issues },
    );
  }
}

function scrubMaskedFields(type: StorageLocationType, patch: JsonMap, current: JsonMap): JsonMap {
  const sensitive = SENSITIVE_STORAGE_FIELDS[type as StorageTypeValue] ?? [];
  const sanitizedPatch: JsonMap = { ...patch };
  for (const field of sensitive) {
    if (sanitizedPatch[field] === '**********' || sanitizedPatch[field] === '') {
      sanitizedPatch[field] = current[field];
    }
  }
  return sanitizedPatch;
}

function parseUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    throw new AppError('STORAGE_CONFIG_INVALID', 422, `Endpoint invalido: ${value}`);
  }
}

async function probeTcp(host: string, port: number, timeoutMs = 5000) {
  const startedAt = Date.now();
  await new Promise<void>((resolve, reject) => {
    const socket = new net.Socket();
    let done = false;

    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish());
    socket.once('timeout', () => finish(new Error(`Timeout ao conectar em ${host}:${port}`)));
    socket.once('error', (err) => finish(err instanceof Error ? err : new Error(String(err))));
    socket.connect(port, host);
  });
  return Date.now() - startedAt;
}

async function probeHttp(url: string, timeoutMs = 7000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const head = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
    });

    if (!head.ok && head.status >= 500) {
      throw new Error(`Endpoint respondeu HTTP ${head.status}`);
    }

    if (head.status === 405) {
      const get = await fetch(url, { method: 'GET', signal: controller.signal });
      if (!get.ok && get.status >= 500) {
        throw new Error(`Endpoint respondeu HTTP ${get.status}`);
      }
    }

    return Date.now() - startedAt;
  } finally {
    clearTimeout(timeout);
  }
}

function mapStorageRuntimeError(err: unknown, type: StorageLocationType, operation: 'test' | 'create' | 'update') {
  if (err instanceof AppError) return err;

  const errorLike = err as { code?: string; message?: string };
  const code = errorLike?.code ?? 'UNKNOWN';
  const message = errorLike?.message ?? 'Erro desconhecido';

  if (
    code === 'ECONNREFUSED'
    || code === 'ETIMEDOUT'
    || code === 'ENOTFOUND'
    || code === 'EHOSTUNREACH'
    || code === 'EAI_AGAIN'
  ) {
    return new AppError(
      'STORAGE_UNREACHABLE',
      400,
      `Falha de conectividade para storage '${type}': ${message}`,
      { storage_type: type, operation, driver_code: code },
    );
  }

  return new AppError(
    'STORAGE_CONNECTION_FAILED',
    400,
    `Falha ao validar storage '${type}': ${message}`,
    { storage_type: type, operation, driver_code: code },
  );
}

async function runStorageConnectionTest(type: StorageLocationType, cfg: JsonMap): Promise<ConnectionTestResult> {
  switch (type) {
    case 'local': {
      const startedAt = Date.now();
      const storagePath = String(cfg.path);
      if (!path.isAbsolute(storagePath)) {
        throw new AppError(
          'STORAGE_CONFIG_INVALID',
          422,
          `Caminho local deve ser absoluto: ${storagePath}`,
          { field: 'path', storage_type: type },
        );
      }

      const stat = await fs.stat(storagePath);
      if (!stat.isDirectory()) {
        throw new AppError(
          'STORAGE_CONFIG_INVALID',
          422,
          `Caminho local nao e um diretorio: ${storagePath}`,
          { field: 'path', storage_type: type },
        );
      }

      return { available_space_gb: null, latency_ms: Date.now() - startedAt };
    }

    case 'ssh': {
      const host = String(cfg.host);
      const port = Number(cfg.port);
      const latency = await probeTcp(host, port);
      return { available_space_gb: null, latency_ms: latency };
    }

    case 's3': {
      const endpoint = cfg.endpoint
        ? String(cfg.endpoint)
        : `https://s3.${String(cfg.region)}.amazonaws.com`;
      const parsed = parseUrl(endpoint);
      const latency = await probeHttp(`${parsed.origin}/`);
      return { available_space_gb: null, latency_ms: latency };
    }

    case 'minio': {
      const parsed = parseUrl(String(cfg.endpoint));
      const latency = await probeHttp(`${parsed.origin}/`);
      return { available_space_gb: null, latency_ms: latency };
    }

    case 'backblaze': {
      const latency = await probeHttp('https://api.backblazeb2.com/b2api/v2/b2_authorize_account');
      return { available_space_gb: null, latency_ms: latency };
    }

    default:
      throw new AppError('TEST_NOT_SUPPORTED', 422, `Teste nao suportado para storage '${type}'.`);
  }
}

function deriveStorageStatus(testResult: ConnectionTestResult): StorageLocationStatus {
  if (testResult.available_space_gb !== null && testResult.available_space_gb <= 0) return 'full';
  return 'healthy';
}

// Model functions

export async function listStorageLocations(
  filters: ListStorageFilters,
  skip: number,
  limit: number,
) {
  const where: Prisma.StorageLocationWhereInput = {};
  if (filters.type) where.type = filters.type as StorageLocationType;
  if (filters.status) where.status = filters.status as StorageLocationStatus;

  const [items, total] = await Promise.all([
    prisma.storageLocation.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, type: true, isDefault: true,
        availableSpaceGb: true, status: true, createdAt: true, updatedAt: true,
      },
    }),
    prisma.storageLocation.count({ where }),
  ]);

  return { items: items.map(formatStorageLocation), total };
}

export async function createStorageLocation(data: CreateStorageLocationData) {
  const type = data.type as StorageLocationType;
  const config = normalizeStorageConfig(type, normalizeConfig(data.config));
  validateStorageConfig(type, config);

  let testResult: ConnectionTestResult;
  try {
    testResult = await runStorageConnectionTest(type, config);
  } catch (err) {
    throw mapStorageRuntimeError(err, type, 'create');
  }

  if (data.is_default) {
    await prisma.storageLocation.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    });
  }

  const storageLocation = await prisma.storageLocation.create({
    data: {
      name: data.name,
      type,
      config: config as Prisma.InputJsonValue,
      isDefault: data.is_default ?? false,
      status: deriveStorageStatus(testResult),
      availableSpaceGb: testResult.available_space_gb,
    },
  });

  return formatStorageLocation(storageLocation);
}

export async function findStorageLocationById(id: string) {
  const sl = await prisma.storageLocation.findUniqueOrThrow({ where: { id } });
  return {
    ...formatStorageLocation(sl),
    config: maskStorageConfig(sl.type, sl.config as Record<string, unknown>),
  };
}

export async function updateStorageLocation(id: string, data: UpdateStorageLocationData) {
  const current = await prisma.storageLocation.findUniqueOrThrow({ where: { id } });

  const currentConfig = normalizeConfig(current.config);
  let mergedConfig = currentConfig;
  let statusToSave: StorageLocationStatus | undefined;
  let availableSpaceToSave: number | null | undefined;

  if (data.config !== undefined) {
    const sanitizedPatch = scrubMaskedFields(current.type, normalizeConfig(data.config), currentConfig);
    mergedConfig = normalizeStorageConfig(current.type, { ...currentConfig, ...sanitizedPatch }, currentConfig);
    validateStorageConfig(current.type, mergedConfig);

    try {
      const testResult = await runStorageConnectionTest(current.type, mergedConfig);
      statusToSave = deriveStorageStatus(testResult);
      availableSpaceToSave = testResult.available_space_gb;
    } catch (err) {
      throw mapStorageRuntimeError(err, current.type, 'update');
    }
  }

  if (data.is_default) {
    await prisma.storageLocation.updateMany({
      where: { isDefault: true, NOT: { id } },
      data: { isDefault: false },
    });
  }

  const updated = await prisma.storageLocation.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.config !== undefined && { config: mergedConfig as Prisma.InputJsonValue }),
      ...(data.is_default !== undefined && { isDefault: data.is_default }),
      ...(statusToSave !== undefined && { status: statusToSave }),
      ...(availableSpaceToSave !== undefined && { availableSpaceGb: availableSpaceToSave }),
    },
  });

  return formatStorageLocation(updated);
}

export async function deleteStorageLocation(id: string) {
  await prisma.storageLocation.findUniqueOrThrow({ where: { id } });

  const activeJobs = await prisma.backupJob.findMany({
    where: { storageLocationId: id },
    select: { id: true },
  });

  if (activeJobs.length > 0) {
    throw new AppError(
      'STORAGE_HAS_ACTIVE_JOBS',
      409,
      `Existem ${activeJobs.length} backup job(s) usando este storage. Remova-os primeiro.`,
      { job_ids: activeJobs.map((j) => j.id) },
    );
  }

  await prisma.storageLocation.delete({ where: { id } });
}

export async function testStorageConnection(id: string) {
  const sl = await prisma.storageLocation.findUniqueOrThrow({ where: { id } });

  try {
    const normalizedConfig = normalizeStorageConfig(sl.type, normalizeConfig(sl.config));
    validateStorageConfig(sl.type, normalizedConfig);
    const testResult = await runStorageConnectionTest(sl.type, normalizedConfig);
    const status = deriveStorageStatus(testResult);

    await prisma.storageLocation.update({
      where: { id: sl.id },
      data: {
        status,
        availableSpaceGb: testResult.available_space_gb,
      },
    });

    return {
      status: 'ok',
      available_space_gb: testResult.available_space_gb,
      latency_ms: testResult.latency_ms,
    };
  } catch (err) {
    await prisma.storageLocation.update({
      where: { id: sl.id },
      data: {
        status: 'unreachable',
        availableSpaceGb: null,
      },
    });
    throw mapStorageRuntimeError(err, sl.type, 'test');
  }
}

export async function testStorageConfig(type: StorageLocationType, config: Record<string, unknown>) {
  const normalizedConfig = normalizeStorageConfig(type, normalizeConfig(config));
  validateStorageConfig(type, normalizedConfig);

  try {
    const result = await runStorageConnectionTest(type, normalizedConfig);
    return {
      status: 'ok',
      available_space_gb: result.available_space_gb,
      latency_ms: result.latency_ms,
    };
  } catch (err) {
    throw mapStorageRuntimeError(err, type, 'test');
  }
}
