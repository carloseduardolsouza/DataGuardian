import { Prisma, DatasourceType, DatasourceStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../middlewares/error-handler';
import { maskCredentials } from '../../utils/config';

// ──────────────────────────────────────────
// Formatter
// ──────────────────────────────────────────

export function formatDatasource(ds: {
  id: string;
  name: string;
  type: DatasourceType;
  status: DatasourceStatus;
  enabled: boolean;
  tags: string[];
  lastHealthCheckAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id:                   ds.id,
    name:                 ds.name,
    type:                 ds.type,
    status:               ds.status,
    enabled:              ds.enabled,
    tags:                 ds.tags,
    last_health_check_at: ds.lastHealthCheckAt?.toISOString() ?? null,
    created_at:           ds.createdAt.toISOString(),
    updated_at:           ds.updatedAt.toISOString(),
  };
}

// ──────────────────────────────────────────
// Query types
// ──────────────────────────────────────────

export interface ListDatasourcesFilters {
  type?:    string;
  status?:  string;
  enabled?: string;
  tag?:     string;
}

export interface CreateDatasourceData {
  name:              string;
  type:              string;
  connection_config: Record<string, unknown>;
  enabled:           boolean;
  tags:              string[];
}

export interface UpdateDatasourceData {
  name?:              string;
  connection_config?: Record<string, unknown>;
  enabled?:           boolean;
  tags?:              string[];
}

// ──────────────────────────────────────────
// Model functions
// ──────────────────────────────────────────

export async function listDatasources(
  filters: ListDatasourcesFilters,
  skip: number,
  limit: number,
) {
  const where: Prisma.DatasourceWhereInput = {};
  if (filters.type)    where.type    = filters.type as DatasourceType;
  if (filters.status)  where.status  = filters.status as DatasourceStatus;
  if (filters.enabled !== undefined) where.enabled = filters.enabled === 'true';
  if (filters.tag)     where.tags    = { has: filters.tag };

  const [items, total] = await Promise.all([
    prisma.datasource.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, type: true, status: true,
        enabled: true, tags: true, lastHealthCheckAt: true,
        createdAt: true, updatedAt: true,
      },
    }),
    prisma.datasource.count({ where }),
  ]);

  return { items: items.map(formatDatasource), total };
}

export async function createDatasource(data: CreateDatasourceData) {
  const datasource = await prisma.datasource.create({
    data: {
      name:             data.name,
      type:             data.type as DatasourceType,
      connectionConfig: data.connection_config as Prisma.InputJsonValue,
      status:           'unknown',
      enabled:          data.enabled,
      tags:             data.tags,
    },
  });

  return formatDatasource(datasource);
}

export async function findDatasourceById(id: string) {
  const datasource = await prisma.datasource.findUniqueOrThrow({ where: { id } });
  return {
    ...formatDatasource(datasource),
    connection_config: maskCredentials(datasource.connectionConfig as Record<string, unknown>),
  };
}

export async function updateDatasource(id: string, data: UpdateDatasourceData) {
  await prisma.datasource.findUniqueOrThrow({ where: { id } });

  const updated = await prisma.datasource.update({
    where: { id },
    data: {
      ...(data.name              !== undefined && { name: data.name }),
      ...(data.connection_config !== undefined && { connectionConfig: data.connection_config as Prisma.InputJsonValue }),
      ...(data.enabled           !== undefined && { enabled: data.enabled }),
      ...(data.tags              !== undefined && { tags: data.tags }),
    },
  });

  return formatDatasource(updated);
}

export async function deleteDatasource(id: string) {
  await prisma.datasource.findUniqueOrThrow({ where: { id } });

  const activeJobs = await prisma.backupJob.findMany({
    where:  { datasourceId: id },
    select: { id: true },
  });

  if (activeJobs.length > 0) {
    throw new AppError(
      'DATASOURCE_HAS_ACTIVE_JOBS',
      409,
      `Existem ${activeJobs.length} backup job(s) associados a este datasource. Remova-os primeiro.`,
      { job_ids: activeJobs.map((j) => j.id) },
    );
  }

  await prisma.datasource.delete({ where: { id } });
}

export async function testDatasourceConnection(id: string) {
  const datasource = await prisma.datasource.findUniqueOrThrow({ where: { id } });

  return {
    error:         'NOT_IMPLEMENTED',
    message:       `Teste de conexão para datasources do tipo '${datasource.type}' ainda não implementado. O health-checker será ativado junto com os workers.`,
    datasource_id: datasource.id,
    type:          datasource.type,
  };
}
