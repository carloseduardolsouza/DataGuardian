import { Prisma, DatasourceType, DatasourceStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../middlewares/error-handler';
import { maskCredentials, bigIntToSafe } from '../../utils/config';
import {
  normalizeDatasourceTags,
  resolveDatasourceClassification,
} from '../../core/datasource/classification';
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
  const normalizedTags = normalizeDatasourceTags(ds.tags);
  return {
    id:                   ds.id,
    name:                 ds.name,
    type:                 ds.type,
    status:               ds.status,
    enabled:              ds.enabled,
    tags:                 normalizedTags,
    classification:       resolveDatasourceClassification(normalizedTags),
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

export interface CreateDatasourceTableColumnData {
  name: string;
  type: string;
  nullable?: boolean;
  primary_key?: boolean;
  unique?: boolean;
  auto_increment?: boolean;
}

export interface CreateDatasourceTableData {
  table_name: string;
  schema_name?: string;
  if_not_exists?: boolean;
  columns: CreateDatasourceTableColumnData[];
}

type JsonMap = Record<string, unknown>;
type QueryResponse = {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTime: number;
  message?: string;
};

function isPlainObject(value: unknown): value is JsonMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toJsonSafeValue(value: unknown): unknown {
  if (typeof value === 'bigint') return bigIntToSafe(value);
  if (Array.isArray(value)) return value.map((item) => toJsonSafeValue(item));
  if (value && typeof value === 'object') {
    const mapped: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      mapped[key] = toJsonSafeValue(nested);
    }
    return mapped;
  }
  return value;
}

function normalizeQueryResponse(result: QueryResponse): QueryResponse {
  return {
    ...result,
    rows: result.rows.map((row) => toJsonSafeValue(row) as Record<string, unknown>),
  };
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

function isValidIdentifier(value: string) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function quoteIdentifier(identifier: string, datasourceType: string) {
  if (!isValidIdentifier(identifier)) {
    throw new AppError(
      'INVALID_IDENTIFIER',
      422,
      `Identificador invalido: '${identifier}'. Use apenas letras, numeros e underscore, iniciando por letra/underscore.`,
    );
  }

  if (datasourceType === 'postgres') {
    return `"${identifier}"`;
  }

  return `\`${identifier}\``;
}

function normalizeColumnType(rawType: string) {
  const normalized = rawType.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    throw new AppError('INVALID_COLUMN_TYPE', 422, 'Tipo de coluna nao pode ser vazio');
  }

  if (!/^[A-Za-z][A-Za-z0-9_]*(?:\s+[A-Za-z][A-Za-z0-9_]*)*(?:\(\s*\d+\s*(?:,\s*\d+\s*)?\))?$/.test(normalized)) {
    throw new AppError(
      'INVALID_COLUMN_TYPE',
      422,
      `Tipo de coluna invalido: '${rawType}'. Exemplo valido: VARCHAR(255), INT, TIMESTAMP.`,
    );
  }

  return normalized.toUpperCase();
}

function supportsAutoIncrement(datasourceType: string, type: string) {
  const numericTypes = ['INT', 'INTEGER', 'BIGINT', 'SMALLINT'];
  return numericTypes.includes(type);
}

function buildCreateTableSql(
  datasourceType: string,
  payload: CreateDatasourceTableData,
) {
  const tableName = payload.table_name.trim();
  if (!tableName) {
    throw new AppError('INVALID_TABLE_NAME', 422, 'Nome da tabela nao pode ser vazio');
  }

  if (!Array.isArray(payload.columns) || payload.columns.length === 0) {
    throw new AppError('INVALID_COLUMNS', 422, 'A tabela deve possuir ao menos uma coluna');
  }

  const dedupe = new Set<string>();
  const primaryKeys: string[] = [];
  const columnSql: string[] = [];

  for (const rawColumn of payload.columns) {
    const columnName = String(rawColumn.name ?? '').trim();
    if (!columnName) {
      throw new AppError('INVALID_COLUMN_NAME', 422, 'Nome de coluna nao pode ser vazio');
    }

    if (!isValidIdentifier(columnName)) {
      throw new AppError(
        'INVALID_COLUMN_NAME',
        422,
        `Nome de coluna invalido: '${columnName}'. Use apenas letras, numeros e underscore.`,
      );
    }

    const key = columnName.toLowerCase();
    if (dedupe.has(key)) {
      throw new AppError('DUPLICATE_COLUMN', 422, `Coluna duplicada: '${columnName}'`);
    }
    dedupe.add(key);

    const quotedName = quoteIdentifier(columnName, datasourceType);
    const type = normalizeColumnType(String(rawColumn.type ?? ''));
    const nullable = rawColumn.nullable !== false;
    const unique = Boolean(rawColumn.unique);
    const primaryKey = Boolean(rawColumn.primary_key);
    const autoIncrement = Boolean(rawColumn.auto_increment);

    let definition = `${quotedName} ${type}`;

    if (autoIncrement) {
      if (!supportsAutoIncrement(datasourceType, type)) {
        throw new AppError(
          'INVALID_AUTO_INCREMENT_TYPE',
          422,
          `Auto incremento so e suportado para tipos numericos inteiros. Coluna '${columnName}'.`,
        );
      }

      if (datasourceType === 'postgres') {
        definition += ' GENERATED BY DEFAULT AS IDENTITY';
      } else {
        definition += ' AUTO_INCREMENT';
      }
    }

    if (!nullable || primaryKey) {
      definition += ' NOT NULL';
    }

    if (unique && !primaryKey) {
      definition += ' UNIQUE';
    }

    if (primaryKey) {
      primaryKeys.push(quotedName);
    }

    columnSql.push(definition);
  }

  if (primaryKeys.length > 0) {
    columnSql.push(`PRIMARY KEY (${primaryKeys.join(', ')})`);
  }

  const ifNotExists = payload.if_not_exists !== false;
  let qualifiedTableName = quoteIdentifier(tableName, datasourceType);
  if (payload.schema_name && payload.schema_name.trim()) {
    if (datasourceType !== 'postgres') {
      throw new AppError(
        'SCHEMA_NOT_SUPPORTED',
        422,
        'schema_name so e suportado para datasource postgres',
      );
    }
    qualifiedTableName = `${quoteIdentifier(payload.schema_name.trim(), datasourceType)}.${qualifiedTableName}`;
  }

  return `CREATE TABLE${ifNotExists ? ' IF NOT EXISTS' : ''} ${qualifiedTableName} (${columnSql.join(', ')});`;
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
  const normalizedTags = normalizeDatasourceTags(data.tags ?? []);
  const datasource = await prisma.datasource.create({
    data: {
      name:             data.name,
      type:             data.type as DatasourceType,
      connectionConfig: data.connection_config as Prisma.InputJsonValue,
      status:           'unknown',
      enabled:          data.enabled,
      tags:             normalizedTags,
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
      ...(data.tags              !== undefined && { tags: normalizeDatasourceTags(data.tags) }),
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

  const linkedSyncJobs = await prisma.databaseSyncJob.findMany({
    where: {
      OR: [
        { sourceDatasourceId: id },
        { targetDatasourceId: id },
      ],
    },
    select: { id: true },
  });
  if (linkedSyncJobs.length > 0) {
    throw new AppError(
      'DATASOURCE_IS_SYNC_PAIR',
      409,
      `Datasource usada em ${linkedSyncJobs.length} sync job(s). Atualize/remova essas sincronizacoes primeiro.`,
      { sync_job_ids: linkedSyncJobs.map((j) => j.id) },
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
      const result = await executePostgresQuery(buildPostgresConfig(cfg), sql);
      return normalizeQueryResponse(result);
    }

    if (datasourceType === 'mysql' || datasourceType === 'mariadb') {
      const result = await executeMysqlQuery(buildMysqlLikeConfig(cfg, datasourceType), sql);
      return normalizeQueryResponse(result);
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

export async function createDatasourceTable(id: string, data: CreateDatasourceTableData) {
  const datasource = await prisma.datasource.findUniqueOrThrow({ where: { id } });
  const datasourceType = String(datasource.type);

  if (datasourceType !== 'postgres' && datasourceType !== 'mysql' && datasourceType !== 'mariadb') {
    throw new AppError(
      'TABLE_CREATE_NOT_SUPPORTED',
      422,
      `Criacao de tabelas nao suportada para datasource '${datasourceType}'.`,
    );
  }

  const sql = buildCreateTableSql(datasourceType, data);

  try {
    await executeDatasourceQuery(id, sql);
  } catch (err) {
    throw mapDatasourceRuntimeError(err, datasourceType, 'query');
  }

  return {
    message: `Tabela '${data.table_name}' criada com sucesso`,
    sql,
  };
}
