// ── Tipos ─────────────────────────────────────────────────────────

export type DatasourceType   = 'postgres' | 'mysql' | 'mariadb' | 'mongodb' | 'sqlserver' | 'sqlite';
export type DatasourceStatus = 'healthy' | 'warning' | 'critical' | 'unknown';
export type IndexType        = 'btree' | 'hash' | 'gin' | 'gist' | 'brin';

export interface Column {
  name:         string;
  type:         string;
  nullable:     boolean;
  primaryKey:   boolean;
  unique?:      boolean;
  foreignKey?:  string;      // "schema.table.column"
  defaultValue?: string;
  comment?:     string;
}

export interface TableIndex {
  name:    string;
  type:    IndexType;
  columns: string[];
  unique:  boolean;
  primary: boolean;
  size?:   string;
}

export interface MockTable {
  name:     string;
  rowCount: number;
  size:     string;
  columns:  Column[];
  indexes:  TableIndex[];
  rows:     Record<string, string | number | boolean | null>[];
}

export interface MockSchema {
  name:   string;
  tables: MockTable[];
}

export interface MockDatasource {
  id:          string;
  name:        string;
  type:        DatasourceType;
  status:      DatasourceStatus;
  host:        string;
  port:        number;
  database:    string;
  username:    string;
  lastCheckAt: string;
  latencyMs:   number | null;
  tags:        string[];
  schemas:     MockSchema[];
}

export interface QueryResult {
  columns:       string[];
  rows:          Record<string, string | number | boolean | null>[];
  rowCount:      number;
  executionTime: string;
  message?:      string;
  error?:        string;
}

// ── Mock data ──────────────────────────────────────────────────────

const usersTable: MockTable = {
  name: 'users', rowCount: 15_420, size: '2.3 MB',
  columns: [
    { name: 'id',            type: 'uuid',         nullable: false, primaryKey: true },
    { name: 'name',          type: 'varchar(255)',  nullable: false, primaryKey: false },
    { name: 'email',         type: 'varchar(255)',  nullable: false, primaryKey: false, unique: true },
    { name: 'password_hash', type: 'text',          nullable: false, primaryKey: false },
    { name: 'role',          type: "varchar(50)",   nullable: false, primaryKey: false, defaultValue: "'user'" },
    { name: 'active',        type: 'boolean',       nullable: false, primaryKey: false, defaultValue: 'true' },
    { name: 'created_at',    type: 'timestamptz',   nullable: false, primaryKey: false, defaultValue: 'now()' },
    { name: 'updated_at',    type: 'timestamptz',   nullable: false, primaryKey: false, defaultValue: 'now()' },
  ],
  indexes: [
    { name: 'users_pkey',       type: 'btree', columns: ['id'],    unique: true,  primary: true,  size: '512 KB' },
    { name: 'users_email_key',  type: 'btree', columns: ['email'], unique: true,  primary: false, size: '1.1 MB' },
    { name: 'users_role_idx',   type: 'btree', columns: ['role'],  unique: false, primary: false, size: '256 KB' },
  ],
  rows: [
    { id: 'a1b2-c3d4', name: 'João Silva',    email: 'joao@empresa.com',   role: 'admin', active: true,  created_at: '2024-01-15 10:30:00' },
    { id: 'b2c3-d4e5', name: 'Maria Santos',  email: 'maria@empresa.com',  role: 'user',  active: true,  created_at: '2024-02-20 14:15:00' },
    { id: 'c3d4-e5f6', name: 'Pedro Costa',   email: 'pedro@empresa.com',  role: 'user',  active: false, created_at: '2024-03-10 09:00:00' },
    { id: 'd4e5-f6g7', name: 'Ana Oliveira',  email: 'ana@empresa.com',    role: 'admin', active: true,  created_at: '2024-01-05 16:45:00' },
    { id: 'e5f6-g7h8', name: 'Carlos Lima',   email: 'carlos@empresa.com', role: 'user',  active: true,  created_at: '2024-04-01 11:20:00' },
    { id: 'f6g7-h8i9', name: 'Fernanda Reis', email: 'fe@empresa.com',     role: 'user',  active: true,  created_at: '2024-04-10 08:00:00' },
  ],
};

const ordersTable: MockTable = {
  name: 'orders', rowCount: 89_234, size: '12.1 MB',
  columns: [
    { name: 'id',          type: 'bigserial',   nullable: false, primaryKey: true },
    { name: 'user_id',     type: 'uuid',        nullable: false, primaryKey: false, foreignKey: 'public.users.id' },
    { name: 'total',       type: 'numeric(12,2)', nullable: false, primaryKey: false },
    { name: 'status',      type: "varchar(20)", nullable: false, primaryKey: false, defaultValue: "'pending'" },
    { name: 'paid_at',     type: 'timestamptz', nullable: true,  primaryKey: false },
    { name: 'created_at',  type: 'timestamptz', nullable: false, primaryKey: false, defaultValue: 'now()' },
  ],
  indexes: [
    { name: 'orders_pkey',        type: 'btree', columns: ['id'],        unique: true,  primary: true,  size: '3.2 MB' },
    { name: 'orders_user_id_idx', type: 'btree', columns: ['user_id'],   unique: false, primary: false, size: '4.1 MB' },
    { name: 'orders_status_idx',  type: 'btree', columns: ['status'],    unique: false, primary: false, size: '1.8 MB' },
    { name: 'orders_created_idx', type: 'brin',  columns: ['created_at'], unique: false, primary: false, size: '48 KB' },
  ],
  rows: [
    { id: 1001, user_id: 'a1b2-c3d4', total: 299.90,  status: 'paid',     paid_at: '2024-04-20 10:15:00', created_at: '2024-04-20 10:00:00' },
    { id: 1002, user_id: 'b2c3-d4e5', total: 59.99,   status: 'pending',  paid_at: null,                  created_at: '2024-04-21 08:30:00' },
    { id: 1003, user_id: 'd4e5-f6g7', total: 1499.00, status: 'paid',     paid_at: '2024-04-21 11:45:00', created_at: '2024-04-21 11:00:00' },
    { id: 1004, user_id: 'a1b2-c3d4', total: 35.50,   status: 'canceled', paid_at: null,                  created_at: '2024-04-22 09:10:00' },
    { id: 1005, user_id: 'e5f6-g7h8', total: 189.00,  status: 'paid',     paid_at: '2024-04-22 14:00:00', created_at: '2024-04-22 13:50:00' },
  ],
};

const productsTable: MockTable = {
  name: 'products', rowCount: 1_234, size: '456 KB',
  columns: [
    { name: 'id',          type: 'uuid',          nullable: false, primaryKey: true },
    { name: 'name',        type: 'varchar(255)',   nullable: false, primaryKey: false },
    { name: 'sku',         type: 'varchar(100)',   nullable: false, primaryKey: false, unique: true },
    { name: 'price',       type: 'numeric(10,2)',  nullable: false, primaryKey: false },
    { name: 'stock',       type: 'integer',        nullable: false, primaryKey: false, defaultValue: '0' },
    { name: 'category_id', type: 'integer',        nullable: true,  primaryKey: false, foreignKey: 'public.categories.id' },
    { name: 'active',      type: 'boolean',        nullable: false, primaryKey: false, defaultValue: 'true' },
    { name: 'created_at',  type: 'timestamptz',    nullable: false, primaryKey: false, defaultValue: 'now()' },
  ],
  indexes: [
    { name: 'products_pkey',    type: 'btree', columns: ['id'],  unique: true,  primary: true,  size: '64 KB' },
    { name: 'products_sku_key', type: 'btree', columns: ['sku'], unique: true,  primary: false, size: '80 KB' },
  ],
  rows: [
    { id: 'p001', name: 'Teclado Mecânico',  sku: 'TEC-001', price: 349.90, stock: 42, category_id: 2, active: true,  created_at: '2024-01-10 09:00:00' },
    { id: 'p002', name: 'Monitor 27" 4K',    sku: 'MON-002', price: 1899.00, stock: 15, category_id: 1, active: true,  created_at: '2024-01-12 10:00:00' },
    { id: 'p003', name: 'Mouse Sem Fio',     sku: 'MOU-003', price: 129.90, stock: 0,  category_id: 2, active: false, created_at: '2024-02-01 11:00:00' },
    { id: 'p004', name: 'Headset USB',       sku: 'HEA-004', price: 259.00, stock: 28, category_id: 3, active: true,  created_at: '2024-02-15 14:00:00' },
  ],
};

const sessionsTable: MockTable = {
  name: 'sessions', rowCount: 3_420, size: '890 KB',
  columns: [
    { name: 'token',      type: 'text',        nullable: false, primaryKey: true },
    { name: 'user_id',    type: 'uuid',        nullable: false, primaryKey: false, foreignKey: 'public.users.id' },
    { name: 'ip',         type: 'inet',        nullable: true,  primaryKey: false },
    { name: 'user_agent', type: 'text',        nullable: true,  primaryKey: false },
    { name: 'expires_at', type: 'timestamptz', nullable: false, primaryKey: false },
    { name: 'created_at', type: 'timestamptz', nullable: false, primaryKey: false, defaultValue: 'now()' },
  ],
  indexes: [
    { name: 'sessions_pkey',       type: 'btree', columns: ['token'],      unique: true,  primary: true,  size: '128 KB' },
    { name: 'sessions_user_idx',   type: 'btree', columns: ['user_id'],    unique: false, primary: false, size: '96 KB' },
    { name: 'sessions_expires_idx',type: 'btree', columns: ['expires_at'], unique: false, primary: false, size: '72 KB' },
  ],
  rows: [
    { token: 'tok_abc123', user_id: 'a1b2-c3d4', ip: '192.168.1.10', expires_at: '2024-05-01 00:00:00', created_at: '2024-04-21 09:00:00' },
    { token: 'tok_def456', user_id: 'b2c3-d4e5', ip: '10.0.0.5',    expires_at: '2024-05-02 00:00:00', created_at: '2024-04-22 08:00:00' },
  ],
};

// ── Datasources mockados ──────────────────────────────────────────

export const MOCK_DATASOURCES: MockDatasource[] = [
  {
    id: 'ds-001',
    name: 'Postgres Produção',
    type: 'postgres',
    status: 'healthy',
    host: 'prod.db.empresa.com',
    port: 5432,
    database: 'appdb',
    username: 'app_user',
    lastCheckAt: '2 min atrás',
    latencyMs: 12,
    tags: ['prod', 'principal'],
    schemas: [
      {
        name: 'public',
        tables: [usersTable, ordersTable, productsTable, {
          name: 'categories', rowCount: 48, size: '24 KB',
          columns: [
            { name: 'id',   type: 'serial',       nullable: false, primaryKey: true },
            { name: 'name', type: 'varchar(100)',  nullable: false, primaryKey: false },
            { name: 'slug', type: 'varchar(100)',  nullable: false, primaryKey: false, unique: true },
          ],
          indexes: [
            { name: 'categories_pkey',     type: 'btree', columns: ['id'],   unique: true,  primary: true,  size: '8 KB' },
            { name: 'categories_slug_key', type: 'btree', columns: ['slug'], unique: true,  primary: false, size: '8 KB' },
          ],
          rows: [
            { id: 1, name: 'Monitores',    slug: 'monitores' },
            { id: 2, name: 'Periféricos',  slug: 'perifericos' },
            { id: 3, name: 'Áudio',        slug: 'audio' },
          ],
        }],
      },
      { name: 'auth', tables: [sessionsTable] },
    ],
  },
  {
    id: 'ds-002',
    name: 'MySQL Staging',
    type: 'mysql',
    status: 'warning',
    host: 'staging.db.empresa.com',
    port: 3306,
    database: 'app_staging',
    username: 'staging_user',
    lastCheckAt: '15 min atrás',
    latencyMs: 95,
    tags: ['staging'],
    schemas: [
      {
        name: 'app_staging',
        tables: [
          { ...usersTable, name: 'users',    rowCount: 312  },
          { ...ordersTable, name: 'orders',  rowCount: 1_028 },
        ],
      },
    ],
  },
  {
    id: 'ds-003',
    name: 'SQLite Local',
    type: 'sqlite',
    status: 'critical',
    host: 'localhost',
    port: 0,
    database: '/data/local.db',
    username: '',
    lastCheckAt: '1h atrás',
    latencyMs: null,
    tags: ['local', 'dev'],
    schemas: [],
  },
  {
    id: 'ds-004',
    name: 'MongoDB Atlas',
    type: 'mongodb',
    status: 'unknown',
    host: 'cluster0.abcde.mongodb.net',
    port: 27017,
    database: 'analytics',
    username: 'mongo_user',
    lastCheckAt: 'nunca',
    latencyMs: null,
    tags: ['analytics'],
    schemas: [],
  },
];

// ── Simulação de query ─────────────────────────────────────────────

export function runMockQuery(sql: string, datasource: MockDatasource): QueryResult {
  const q = sql.trim().toLowerCase();

  if (!q) return { columns: [], rows: [], rowCount: 0, executionTime: '0ms', error: 'Query vazia.' };

  const time = `${Math.floor(Math.random() * 80 + 5)}ms`;

  // Procura o nome da tabela em FROM/INTO/UPDATE
  const tableMatch = q.match(/(?:from|into|update|join)\s+["'`]?(\w+)["'`]?/);
  const tableName  = tableMatch?.[1];

  let found: MockTable | undefined;
  for (const schema of datasource.schemas) {
    found = schema.tables.find((t) => t.name === tableName);
    if (found) break;
  }

  // SELECT
  if (q.startsWith('select')) {
    if (!found) {
      if (!tableName) {
        // SELECT sem FROM → expressão simples
        return { columns: ['result'], rows: [{ result: 1 }], rowCount: 1, executionTime: time };
      }
      return { columns: [], rows: [], rowCount: 0, executionTime: time, error: `Tabela "${tableName}" não encontrada.` };
    }

    // Colunas do SELECT
    const colMatch = q.match(/select\s+(.*?)\s+from/);
    const colStr   = colMatch?.[1] ?? '*';
    const cols     = colStr === '*'
      ? found.columns.map((c) => c.name)
      : colStr.split(',').map((c) => c.trim());

    const rows = found.rows.map((r) => {
      const row: Record<string, string | number | boolean | null> = {};
      cols.forEach((c) => { row[c] = r[c] ?? null; });
      return row;
    });

    // LIMIT
    const limitMatch = q.match(/limit\s+(\d+)/);
    const limit = limitMatch ? parseInt(limitMatch[1]) : rows.length;

    return { columns: cols, rows: rows.slice(0, limit), rowCount: rows.slice(0, limit).length, executionTime: time };
  }

  // DML
  if (q.startsWith('insert')) return { columns: [], rows: [], rowCount: 1, executionTime: time, message: '1 row inserted.' };
  if (q.startsWith('update')) {
    const n = Math.floor(Math.random() * 5 + 1);
    return { columns: [], rows: [], rowCount: n, executionTime: time, message: `${n} row(s) updated.` };
  }
  if (q.startsWith('delete')) {
    const n = Math.floor(Math.random() * 3 + 1);
    return { columns: [], rows: [], rowCount: n, executionTime: time, message: `${n} row(s) deleted.` };
  }

  // DDL
  if (q.startsWith('create') || q.startsWith('drop') || q.startsWith('alter')) {
    return { columns: [], rows: [], rowCount: 0, executionTime: time, message: 'Query executed successfully.' };
  }

  return { columns: [], rows: [], rowCount: 0, executionTime: time, error: `Sintaxe desconhecida: "${sql.slice(0, 30)}..."` };
}
