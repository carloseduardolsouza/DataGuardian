import { Prisma, DatasourceType, DatasourceStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../middlewares/error-handler';
import { maskCredentials } from '../../utils/config';
import {
  introspectPostgres,
  testPostgresConnection,
  executePostgresQuery,
} from '../../core/introspect/postgres-introspect';
import {
  introspectMysql,
  testMysqlConnection,
  executeMysqlQuery,
} from '../../core/introspect/mysql-introspect';

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

type JsonMap = Record<string, unknown>;

function isPlainObject(value: unknown): value is JsonMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asStringField(
  cfg: JsonMap,
  key: string,
  datasourceType: string,
  { required = true, trim = true }: { required?: boolean; trim?: boolean } = {},
) {
  const value = cfg[key];

  if (value === undefined || value === null) {
    if (!required) return '';
    throw new AppError(
      'CONNECTION_CONFIG_INVALID',
      422,
      `Campo obrigatório ausente em connection_config para datasource '${datasourceType}': ${key}`,
      { field: key, datasource_type: datasourceType },
    );
  }

  if (typeof value !== 'string') {
    throw new AppError(
      'CONNECTION_CONFIG_INVALID',
      422,
      `Campo inválido em connection_config para datasource '${datasourceType}': ${key} deve ser string`,
      { field: key, datasource_type: datasourceType, received_type: typeof value },
    );
  }

  const normalized = trim ? value.trim() : value;
  if (required && normalized.length === 0) {
    throw new AppError(
      'CONNECTION_CONFIG_INVALID',
      422,
      `Campo obrigatório vazio em connection_config para datasource '${datasourceType}': ${key}`,
      { field: key, datasource_type: datasourceType },
    );
  }

  return normalized;
}

function asPortField(cfg: JsonMap, datasourceType: string, fallback: number) {
  const raw = cfg.port;
  if (raw === undefined || raw === null || raw === '') return fallback;

  const parsed = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new AppError(
      'CONNECTION_CONFIG_INVALID',
      422,
      `Campo inválido em connection_config para datasource '${datasourceType}': port deve ser número positivo`,
      { field: 'port', datasource_type: datasourceType },
    );
  }

  return Math.trunc(parsed);
}

function normalizeConnectionConfig(value: unknown): JsonMap {
  return isPlainObject(value) ? value : {};
}

function buildPostgresConfig(cfg: JsonMap) {
  return {
    host:        asStringField(cfg, 'host', 'postgres'),
    port:        asPortField(cfg, 'postgres', 5432),
    database:    asStringField(cfg, 'database', 'postgres'),
    username:    asStringField(cfg, 'username', 'postgres'),
    password:    asStringField(cfg, 'password', 'postgres', { trim: false }),
    ssl_enabled: Boolean(cfg.ssl_enabled),
  };
}

function buildMysqlLikeConfig(cfg: JsonMap, datasourceType: string) {
  return {
    host:     asStringField(cfg, 'host', datasourceType),
    port:     asPortField(cfg, datasourceType, 3306),
    database: asStringField(cfg, 'database', datasourceType),
    username: asStringField(cfg, 'username', datasourceType),
    password: asStringField(cfg, 'password', datasourceType, { trim: false }),
  };
}

function mapDatasourceRuntimeError(
  err: unknown,
  datasourceType: string,
  operation: 'test' | 'schema' | 'query',
): AppError {
  if (err instanceof AppError) return err;

  const errorLike = err as { code?: string; message?: string };
  const driverCode = errorLike?.code ?? 'UNKNOWN';
  const message = errorLike?.message ?? 'Erro desconhecido';

  const details = {
    datasource_type: datasourceType,
    operation,
    driver_code: driverCode,
  };

  if (
    driverCode === 'ECONNREFUSED'
    || driverCode === 'ETIMEDOUT'
    || driverCode === 'ENOTFOUND'
    || driverCode === 'EHOSTUNREACH'
  ) {
    return new AppError(
      'CONNECTION_FAILED',
      400,
      `Falha de conectividade para datasource '${datasourceType}': ${message}`,
      details,
    );
  }

  if (driverCode === '28P01' || driverCode === '3D000') {
    return new AppError(
      'CONNECTION_FAILED',
      400,
      `Credenciais ou database invalidos para datasource '${datasourceType}': ${message}`,
      details,
    );
  }

  if (operation === 'query') {
    if (driverCode === '42P01') {
      return new AppError(
        'QUERY_EXECUTION_FAILED',
        422,
        `Tabela ou relacao nao encontrada no datasource '${datasourceType}': ${message}`,
        details,
      );
    }

    if (
      driverCode === '42601'
      || driverCode === '42703'
      || driverCode === '42883'
      || driverCode === '42000'
      || driverCode === 'ER_NO_SUCH_TABLE'
      || driverCode === 'ER_BAD_FIELD_ERROR'
      || driverCode === 'ER_PARSE_ERROR'
      || driverCode === 'ER_BAD_DB_ERROR'
    ) {
      return new AppError(
        'QUERY_EXECUTION_FAILED',
        422,
        `Query invalida para datasource '${datasourceType}': ${message}`,
        details,
      );
    }
  }

  if (operation === 'schema') {
    return new AppError(
      'SCHEMA_INTROSPECTION_FAILED',
      400,
      `Erro ao carregar schema do datasource '${datasourceType}': ${message}`,
      details,
    );
  }

  if (operation === 'query') {
    return new AppError(
      'QUERY_EXECUTION_FAILED',
      400,
      `Erro ao executar query no datasource '${datasourceType}': ${message}`,
      details,
    );
  }

  return new AppError(
    'CONNECTION_FAILED',
    400,
    `Falha ao conectar no datasource '${datasourceType}': ${message}`,
    details,
  );
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
  const current = await prisma.datasource.findUniqueOrThrow({ where: { id } });

  let mergedConnectionConfig = normalizeConnectionConfig(current.connectionConfig);

  if (data.connection_config !== undefined) {
    const patch = normalizeConnectionConfig(data.connection_config);
    const merged = { ...mergedConnectionConfig, ...patch };

    // Permite edição sem reenviar segredo mascarado/vazio, mantendo o valor já salvo.
    if (patch.password === '**********' || patch.password === '') {
      merged.password = mergedConnectionConfig.password;
    }

    mergedConnectionConfig = merged;
  }

  const updated = await prisma.datasource.update({
    where: { id },
    data: {
      ...(data.name              !== undefined && { name: data.name }),
      ...(data.connection_config !== undefined && { connectionConfig: mergedConnectionConfig as Prisma.InputJsonValue }),
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
  const cfg = normalizeConnectionConfig(datasource.connectionConfig);
  const datasourceType = String(datasource.type);

  try {
    if (datasourceType === 'postgres') {
      return testPostgresConnection(buildPostgresConfig(cfg));
    }

    if (datasourceType === 'mysql' || datasourceType === 'mariadb') {
      return testMysqlConnection(buildMysqlLikeConfig(cfg, datasourceType));
    }

    throw new AppError(
      'TEST_NOT_SUPPORTED',
      422,
      `Teste de conexao nao suportado para datasources do tipo '${datasourceType}'.`,
    );
  } catch (err) {
    throw mapDatasourceRuntimeError(err, datasourceType, 'test');
  }
}

export async function executeDatasourceQuery(id: string, sql: string) {
  const datasource = await prisma.datasource.findUniqueOrThrow({ where: { id } });
  const cfg = normalizeConnectionConfig(datasource.connectionConfig);
  const datasourceType = String(datasource.type);

  try {
    if (datasourceType === 'postgres') {
      return executePostgresQuery(buildPostgresConfig(cfg), sql);
    }

    if (datasourceType === 'mysql' || datasourceType === 'mariadb') {
      return executeMysqlQuery(buildMysqlLikeConfig(cfg, datasourceType), sql);
    }

    throw new AppError(
      'QUERY_NOT_SUPPORTED',
      422,
      `Execucao de queries nao suportada para datasources do tipo '${datasourceType}'.`,
    );
  } catch (err) {
    throw mapDatasourceRuntimeError(err, datasourceType, 'query');
  }
}

export async function getDatasourceSchema(id: string) {
  const datasource = await prisma.datasource.findUniqueOrThrow({ where: { id } });
  const cfg = normalizeConnectionConfig(datasource.connectionConfig);
  const datasourceType = String(datasource.type);

  try {
    if (datasourceType === 'postgres') {
      return introspectPostgres(buildPostgresConfig(cfg));
    }

    if (datasourceType === 'mysql' || datasourceType === 'mariadb') {
      return introspectMysql(buildMysqlLikeConfig(cfg, datasourceType));
    }

    throw new AppError(
      'SCHEMA_NOT_SUPPORTED',
      422,
      `Introspeccao de schema nao suportada para datasources do tipo '${datasourceType}'.`,
    );
  } catch (err) {
    throw mapDatasourceRuntimeError(err, datasourceType, 'schema');
  }
}
