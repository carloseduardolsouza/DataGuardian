// ──────────────────────────────────────────
// Configuração centralizada via env vars
// ──────────────────────────────────────────

function buildRedisUrl(rawUrl: string, password?: string) {
  if (!password) return rawUrl;
  try {
    const url = new URL(rawUrl);
    if (!url.password) {
      url.password = password;
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

const redisPassword = process.env.REDIS_PASSWORD?.trim();
const redisUrl = buildRedisUrl(process.env.REDIS_URL ?? 'redis://localhost:6379', redisPassword);

export const config = {
  env: (process.env.NODE_ENV ?? 'development') as 'development' | 'production' | 'test',
  port: parseInt(process.env.PORT ?? '3000', 10),
  logLevel: process.env.LOG_LEVEL ?? 'info',

  database: {
    url: process.env.DATABASE_URL ?? '',
  },

  redis: {
    url: redisUrl,
    password: redisPassword ?? '',
  },

  cors: {
    origins: process.env.ALLOWED_ORIGINS ?? '*',
  },

  workers: {
    maxConcurrentBackups: parseInt(process.env.MAX_CONCURRENT_BACKUPS ?? '3', 10),
    schedulerIntervalMs:  parseInt(process.env.SCHEDULER_INTERVAL_MS ?? '60000', 10),
    healthCheckIntervalMs: parseInt(process.env.HEALTH_CHECK_INTERVAL_MS ?? '300000', 10),
    cleanupCron: process.env.CLEANUP_CRON ?? '0 4 * * *',
    tempDirectory: process.env.TEMP_DIRECTORY ?? '/tmp/dataguardian',
  },
} as const;

// ──────────────────────────────────────────
// Utilitários
// ──────────────────────────────────────────

const SENSITIVE_KEYS = new Set([
  'password',
  'private_key',
  'secret_key',
  'secret_access_key',
  'application_key',
  'access_key',
]);

/**
 * Mascara campos sensíveis em objetos de configuração de conexão.
 * Usado ao retornar datasource/:id e storage-location/:id na API.
 */
export function maskCredentials(obj: Record<string, unknown>): Record<string, unknown> {
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    masked[key] = SENSITIVE_KEYS.has(key) ? '**********' : value;
  }
  return masked;
}

/**
 * Helper de paginação para queries Prisma.
 */
export function getPaginationParams(query: { page?: unknown; limit?: unknown }) {
  const page  = Math.max(1, parseInt(String(query.page  ?? '1'),  10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit ?? '20'), 10) || 20));
  const skip  = (page - 1) * limit;
  return { page, limit, skip };
}

/**
 * Monta o objeto de resposta paginada padrão da API.
 */
export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
) {
  return {
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Converte BigInt para number seguro para JSON.
 * Valores > Number.MAX_SAFE_INTEGER são retornados como string.
 */
export function bigIntToSafe(value: bigint | null | undefined): number | string | null {
  if (value === null || value === undefined) return null;
  if (value <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(value);
  return value.toString();
}
