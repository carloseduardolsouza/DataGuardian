import { Client } from 'pg';

// ── Shared config type ────────────────────────────────────────────

export interface PostgresConfig {
  host:         string;
  port:         number | string;
  database:     string;
  username:     string;
  password:     string;
  ssl_enabled?: boolean;
}

function makeClient(config: PostgresConfig) {
  return new Client({
    host:                    config.host,
    port:                    Number(config.port) || 5432,
    database:                config.database,
    user:                    config.username,
    password:                config.password,
    ssl:                     config.ssl_enabled ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 8000,
  });
}

// ── Test connection ───────────────────────────────────────────────

export async function testPostgresConnection(
  config: PostgresConfig,
): Promise<{ status: string; latency_ms: number }> {
  const client = makeClient(config);
  const start  = Date.now();
  await client.connect();
  try {
    await client.query('SELECT 1');
    return { status: 'ok', latency_ms: Date.now() - start };
  } finally {
    await client.end();
  }
}

// ── Execute query ─────────────────────────────────────────────────

export interface QueryResult {
  columns:       string[];
  rows:          Record<string, unknown>[];
  rowCount:      number;
  executionTime: number;
  message?:      string;
}

export async function executePostgresQuery(
  config: PostgresConfig,
  sql: string,
): Promise<QueryResult> {
  const client = makeClient(config);
  await client.connect();
  try {
    const start  = Date.now();
    const result = await client.query(sql);
    const executionTime = Date.now() - start;

    if (result.fields && result.fields.length > 0) {
      return {
        columns:       result.fields.map((f) => f.name),
        rows:          result.rows as Record<string, unknown>[],
        rowCount:      result.rowCount ?? result.rows.length,
        executionTime,
      };
    }

    return {
      columns:       [],
      rows:          [],
      rowCount:      result.rowCount ?? 0,
      executionTime,
      message:       `${result.rowCount ?? 0} linha(s) afetada(s).`,
    };
  } finally {
    await client.end();
  }
}

// ── Introspect ────────────────────────────────────────────────────

export interface IntrospectColumn {
  name:         string;
  type:         string;
  nullable:     boolean;
  primaryKey:   boolean;
  unique:       boolean;
  foreignKey:   boolean;
  defaultValue: string | null;
}

export interface IntrospectTable {
  name:    string;
  columns: IntrospectColumn[];
}

export interface IntrospectSchema {
  name:   string;
  tables: IntrospectTable[];
}

export async function introspectPostgres(config: PostgresConfig): Promise<IntrospectSchema[]> {
  const client = makeClient(config);

  await client.connect();

  try {
    const schemasRes = await client.query<{ schema_name: string }>(`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name NOT IN (
        'information_schema', 'pg_catalog', 'pg_toast',
        'pg_temp_1', 'pg_toast_temp_1'
      )
        AND schema_name NOT LIKE 'pg_temp_%'
        AND schema_name NOT LIKE 'pg_toast_temp_%'
      ORDER BY schema_name
    `);

    const schemas: IntrospectSchema[] = [];

    for (const schemaRow of schemasRes.rows) {
      const schemaName = schemaRow.schema_name;

      const tablesRes = await client.query<{ table_name: string }>(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = $1
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `, [schemaName]);

      const tables: IntrospectTable[] = [];

      for (const tableRow of tablesRes.rows) {
        const tableName = tableRow.table_name;

        // Primary keys
        const pkRes = await client.query<{ column_name: string }>(`
          SELECT ccu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.constraint_column_usage ccu
            ON tc.constraint_name = ccu.constraint_name
           AND tc.table_schema    = ccu.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY'
            AND tc.table_schema = $1
            AND tc.table_name   = $2
        `, [schemaName, tableName]);
        const pks = new Set(pkRes.rows.map((r) => r.column_name));

        // Unique constraints
        const uqRes = await client.query<{ column_name: string }>(`
          SELECT kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
           AND tc.table_schema    = kcu.table_schema
           AND tc.table_name      = kcu.table_name
          WHERE tc.constraint_type = 'UNIQUE'
            AND tc.table_schema = $1
            AND tc.table_name   = $2
        `, [schemaName, tableName]);
        const uqs = new Set(uqRes.rows.map((r) => r.column_name));

        // Foreign keys
        const fkRes = await client.query<{ column_name: string }>(`
          SELECT kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
           AND tc.table_schema    = kcu.table_schema
           AND tc.table_name      = kcu.table_name
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_schema = $1
            AND tc.table_name   = $2
        `, [schemaName, tableName]);
        const fks = new Set(fkRes.rows.map((r) => r.column_name));

        // Columns
        const colsRes = await client.query<{
          column_name:    string;
          data_type:      string;
          is_nullable:    string;
          column_default: string | null;
        }>(`
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_schema = $1
            AND table_name   = $2
          ORDER BY ordinal_position
        `, [schemaName, tableName]);

        const columns: IntrospectColumn[] = colsRes.rows.map((col) => ({
          name:         col.column_name,
          type:         col.data_type,
          nullable:     col.is_nullable === 'YES',
          primaryKey:   pks.has(col.column_name),
          unique:       uqs.has(col.column_name),
          foreignKey:   fks.has(col.column_name),
          defaultValue: col.column_default,
        }));

        tables.push({ name: tableName, columns });
      }

      schemas.push({ name: schemaName, tables });
    }

    return schemas;
  } finally {
    await client.end();
  }
}
