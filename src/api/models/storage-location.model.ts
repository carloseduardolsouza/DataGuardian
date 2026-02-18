import { Prisma, StorageLocationType, StorageLocationStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../middlewares/error-handler';
import { SENSITIVE_STORAGE_FIELDS, StorageTypeValue } from '../../types/storage.types';

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────

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
    id:                 sl.id,
    name:               sl.name,
    type:               sl.type,
    is_default:         sl.isDefault,
    available_space_gb: sl.availableSpaceGb ? Number(sl.availableSpaceGb) : null,
    status:             sl.status,
    created_at:         sl.createdAt.toISOString(),
    updated_at:         sl.updatedAt.toISOString(),
  };
}

// ──────────────────────────────────────────
// Query types
// ──────────────────────────────────────────

export interface ListStorageFilters {
  type?:   string;
  status?: string;
}

export interface CreateStorageLocationData {
  name:       string;
  type:       string;
  config:     Record<string, unknown>;
  is_default: boolean;
}

export interface UpdateStorageLocationData {
  name?:       string;
  config?:     Record<string, unknown>;
  is_default?: boolean;
}

// ──────────────────────────────────────────
// Model functions
// ──────────────────────────────────────────

export async function listStorageLocations(
  filters: ListStorageFilters,
  skip: number,
  limit: number,
) {
  const where: Prisma.StorageLocationWhereInput = {};
  if (filters.type)   where.type   = filters.type as StorageLocationType;
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
  if (data.is_default) {
    await prisma.storageLocation.updateMany({
      where: { isDefault: true },
      data:  { isDefault: false },
    });
  }

  const storageLocation = await prisma.storageLocation.create({
    data: {
      name:      data.name,
      type:      data.type as StorageLocationType,
      config:    data.config as Prisma.InputJsonValue,
      isDefault: data.is_default ?? false,
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
  await prisma.storageLocation.findUniqueOrThrow({ where: { id } });

  if (data.is_default) {
    await prisma.storageLocation.updateMany({
      where: { isDefault: true, NOT: { id } },
      data:  { isDefault: false },
    });
  }

  const updated = await prisma.storageLocation.update({
    where: { id },
    data: {
      ...(data.name       !== undefined && { name: data.name }),
      ...(data.config     !== undefined && { config: data.config as Prisma.InputJsonValue }),
      ...(data.is_default !== undefined && { isDefault: data.is_default }),
    },
  });

  return formatStorageLocation(updated);
}

export async function deleteStorageLocation(id: string) {
  await prisma.storageLocation.findUniqueOrThrow({ where: { id } });

  const activeJobs = await prisma.backupJob.findMany({
    where:  { storageLocationId: id },
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

  return {
    error:               'NOT_IMPLEMENTED',
    message:             `Teste de conexão para storage do tipo '${sl.type}' ainda não implementado.`,
    storage_location_id: sl.id,
    type:                sl.type,
  };
}
