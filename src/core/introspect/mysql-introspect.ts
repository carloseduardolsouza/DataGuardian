import mysql from 'mysql2/promise';
import type { IntrospectColumn, IntrospectSchema, IntrospectTable, QueryResult } from './postgres-introspect';

export interface MysqlConfig {
  host:     string;
  port:     number | string;
  database: string;
  username: string;
  password: string;
}

function makeConnection(config: MysqlConfig) {
  return mysql.createConnection({
    host:           config.host,
    port:           Number(config.port) || 3306,
    database:       config.database,
    user:           config.username,
    password:       config.password,
    connectTimeout: 8000,
  });
}

// ── Test connection ───────────────────────────────────────────────

export async function testMysqlConnection(
  config: MysqlConfig,
): Promise<{ status: string; latency_ms: number }> {
  const start      = Date.now();
  const connection = await makeConnection(config);
  try {
    await connection.query('SELECT 1');
    return { status: 'ok', latency_ms: Date.now() - start };
  } finally {
    await connection.end();
  }
}

// ── Execute query ─────────────────────────────────────────────────

export async function executeMysqlQuery(
  config: MysqlConfig,
  sql: string,
): Promise<QueryResult> {
  const connection = await makeConnection(config);
  try {
    const start = Date.now();
    const [rows, fields] = await connection.query(sql);
    const executionTime  = Date.now() - start;

    if (Array.isArray(rows) && fields && Array.isArray(fields) && fields.length > 0) {
      return {
        columns:       (fields as mysql.FieldPacket[]).map((f) => f.name!),
        rows:          rows as Record<string, unknown>[],
        rowCount:      rows.length,
        executionTime,
      };
    }

    const affected = (rows as mysql.ResultSetHeader).affectedRows ?? 0;
    return {
      columns:       [],
      rows:          [],
      rowCount:      affected,
      executionTime,
      message:       `${affected} linha(s) afetada(s).`,
    };
  } finally {
    await connection.end();
  }
}

// ── Introspect ────────────────────────────────────────────────────

export async function introspectMysql(config: MysqlConfig): Promise<IntrospectSchema[]> {
  const connection = await makeConnection(config);
  try {
    // MySQL uses databases instead of schemas; expose the single database as one schema
    const schemaName = config.database;

    // Tables
    const [tableRows] = await connection.query<mysql.RowDataPacket[]>(`
      SELECT TABLE_NAME AS table_name
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ?
        AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `, [schemaName]);

    const tables: IntrospectTable[] = [];

    for (const tableRow of tableRows) {
      const tableName = tableRow['table_name'] as string;

      // Primary keys
      const [pkRows] = await connection.query<mysql.RowDataPacket[]>(`
        SELECT COLUMN_NAME AS column_name
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA    = ?
          AND TABLE_NAME      = ?
          AND CONSTRAINT_NAME = 'PRIMARY'
      `, [schemaName, tableName]);
      const pks = new Set(pkRows.map((r) => r['column_name'] as string));

      // Unique keys (from statistics)
      const [uqRows] = await connection.query<mysql.RowDataPacket[]>(`
        SELECT DISTINCT COLUMN_NAME AS column_name
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME   = ?
          AND NON_UNIQUE   = 0
          AND INDEX_NAME  != 'PRIMARY'
      `, [schemaName, tableName]);
      const uqs = new Set(uqRows.map((r) => r['column_name'] as string));

      // Foreign keys
      const [fkRows] = await connection.query<mysql.RowDataPacket[]>(`
        SELECT COLUMN_NAME AS column_name
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA        = ?
          AND TABLE_NAME          = ?
          AND REFERENCED_TABLE_NAME IS NOT NULL
      `, [schemaName, tableName]);
      const fks = new Set(fkRows.map((r) => r['column_name'] as string));

      // Columns
      const [colRows] = await connection.query<mysql.RowDataPacket[]>(`
        SELECT COLUMN_NAME    AS column_name,
               DATA_TYPE      AS data_type,
               IS_NULLABLE    AS is_nullable,
               COLUMN_DEFAULT AS column_default
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME   = ?
        ORDER BY ORDINAL_POSITION
      `, [schemaName, tableName]);

      const columns: IntrospectColumn[] = colRows.map((col) => ({
        name:         col['column_name'] as string,
        type:         col['data_type'] as string,
        nullable:     col['is_nullable'] === 'YES',
        primaryKey:   pks.has(col['column_name'] as string),
        unique:       uqs.has(col['column_name'] as string),
        foreignKey:   fks.has(col['column_name'] as string),
        defaultValue: col['column_default'] as string | null,
      }));

      tables.push({ name: tableName, columns });
    }

    return [{ name: schemaName, tables }];
  } finally {
    await connection.end();
  }
}
