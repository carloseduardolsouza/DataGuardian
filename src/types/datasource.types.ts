import { z } from 'zod';

// ──────────────────────────────────────────
// Connection Config schemas por tipo
// ──────────────────────────────────────────

export const postgresConfigSchema = z.object({
  host:        z.string().min(1),
  port:        z.number().int().min(1).max(65535).default(5432),
  database:    z.string().min(1),
  username:    z.string().min(1),
  password:    z.string().min(1),
  ssl_enabled: z.boolean().default(false),
});

export const mysqlConfigSchema = z.object({
  host:        z.string().min(1),
  port:        z.number().int().min(1).max(65535).default(3306),
  database:    z.string().min(1),
  username:    z.string().min(1),
  password:    z.string().min(1),
  ssl_enabled: z.boolean().default(false),
});

export const mongodbConfigSchema = z.object({
  host:        z.string().min(1),
  port:        z.number().int().min(1).max(65535).default(27017),
  database:    z.string().min(1),
  username:    z.string().min(1),
  password:    z.string().min(1),
  ssl_enabled: z.boolean().default(false),
});

export const sqlserverConfigSchema = z.object({
  host:        z.string().min(1),
  port:        z.number().int().min(1).max(65535).default(1433),
  database:    z.string().min(1),
  username:    z.string().min(1),
  password:    z.string().min(1),
  ssl_enabled: z.boolean().default(false),
});

export const sqliteConfigSchema = z.object({
  file_path: z.string().min(1),
});

export const filesConfigSchema = z.object({
  source_path:      z.string().min(1),
  include_patterns: z.array(z.string()).optional(),
  exclude_patterns: z.array(z.string()).optional(),
});

// ──────────────────────────────────────────
// Tipos inferidos
// ──────────────────────────────────────────

export type PostgresConfig  = z.infer<typeof postgresConfigSchema>;
export type MySQLConfig     = z.infer<typeof mysqlConfigSchema>;
export type MongoDBConfig   = z.infer<typeof mongodbConfigSchema>;
export type SQLServerConfig = z.infer<typeof sqlserverConfigSchema>;
export type SQLiteConfig    = z.infer<typeof sqliteConfigSchema>;
export type FilesConfig     = z.infer<typeof filesConfigSchema>;

export type ConnectionConfig =
  | PostgresConfig
  | MySQLConfig
  | MongoDBConfig
  | SQLServerConfig
  | SQLiteConfig
  | FilesConfig;

export const datasourceTypeValues = [
  'postgres',
  'mysql',
  'mongodb',
  'sqlserver',
  'sqlite',
  'files',
] as const;

export type DatasourceTypeValue = (typeof datasourceTypeValues)[number];

// ──────────────────────────────────────────
// Schemas da API
// ──────────────────────────────────────────

const connectionSchemaByType: Record<DatasourceTypeValue, z.ZodTypeAny> = {
  postgres:  postgresConfigSchema,
  mysql:     mysqlConfigSchema,
  mongodb:   mongodbConfigSchema,
  sqlserver: sqlserverConfigSchema,
  sqlite:    sqliteConfigSchema,
  files:     filesConfigSchema,
};

export const createDatasourceSchema = z
  .object({
    name:              z.string().min(1).max(255),
    type:              z.enum(datasourceTypeValues),
    connection_config: z.record(z.unknown()),
    enabled:           z.boolean().default(true),
    tags:              z.array(z.string()).default([]),
  })
  .superRefine((data, ctx) => {
    const result = connectionSchemaByType[data.type].safeParse(data.connection_config);
    if (!result.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['connection_config'],
        message: `connection_config inválida para o tipo '${data.type}': ${result.error.issues.map((i) => i.message).join(', ')}`,
      });
    }
  });

export const updateDatasourceSchema = z.object({
  name:              z.string().min(1).max(255).optional(),
  connection_config: z.record(z.unknown()).optional(),
  enabled:           z.boolean().optional(),
  tags:              z.array(z.string()).optional(),
});

export type CreateDatasourceInput = z.infer<typeof createDatasourceSchema>;
export type UpdateDatasourceInput = z.infer<typeof updateDatasourceSchema>;
