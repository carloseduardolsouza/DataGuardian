import IORedis from 'ioredis';
import { config } from '../utils/config';
import { logger } from '../utils/logger';

let probeConnection: IORedis | null = null;
let lastRedisErrorLogAt = 0;
let redisAvailable = false;

function logRedisError(err: unknown) {
  const now = Date.now();
  if (now - lastRedisErrorLogAt < 5000) return;
  lastRedisErrorLogAt = now;
  logger.error({ err }, 'Erro na conexao Redis');
}

export function isRedisAvailable() {
  return redisAvailable;
}

export function getBullConnection() {
  return {
    url: config.redis.url,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectTimeout: 5000,
    retryStrategy: () => null,
  } as const;
}

export async function connectRedis() {
  if (!probeConnection) {
    probeConnection = new IORedis(config.redis.url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      connectTimeout: 5000,
      retryStrategy: () => null,
    });
    probeConnection.on('error', (err) => {
      redisAvailable = false;
      logRedisError(err);
    });
    probeConnection.on('end', () => {
      redisAvailable = false;
    });
  }

  try {
    await probeConnection.connect();
    await probeConnection.ping();
    redisAvailable = true;
  } catch (err) {
    redisAvailable = false;
    await probeConnection.disconnect();
    throw err;
  }

  return probeConnection;
}

export async function ensureRedisAvailable() {
  if (redisAvailable && probeConnection) {
    try {
      await probeConnection.ping();
      return true;
    } catch {
      redisAvailable = false;
    }
  }

  try {
    await connectRedis();
    return true;
  } catch {
    return false;
  }
}

export async function closeRedis() {
  if (!probeConnection) return;
  await probeConnection.quit().catch(async () => {
    await probeConnection?.disconnect();
  });
  probeConnection = null;
  redisAvailable = false;
}
