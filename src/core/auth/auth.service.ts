import { createHash, randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../api/middlewares/error-handler';

const scrypt = promisify(_scrypt);

const USER_SETTING_KEY = 'auth.user';
const SESSION_SETTING_KEY = 'auth.session';

export const AUTH_COOKIE_NAME = 'dg_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface StoredUserConfig {
  username: string;
  password_hash: string;
  created_at: string;
}

interface StoredSessionConfig {
  token_hash: string;
  username: string;
  expires_at: string;
  created_at: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parseStoredUser(value: unknown): StoredUserConfig | null {
  const record = asRecord(value);
  const username = typeof record.username === 'string' ? record.username : '';
  const passwordHash = typeof record.password_hash === 'string' ? record.password_hash : '';
  const createdAt = typeof record.created_at === 'string' ? record.created_at : '';
  if (!username || !passwordHash || !createdAt) return null;
  return { username, password_hash: passwordHash, created_at: createdAt };
}

function parseStoredSession(value: unknown): StoredSessionConfig | null {
  const record = asRecord(value);
  const tokenHash = typeof record.token_hash === 'string' ? record.token_hash : '';
  const username = typeof record.username === 'string' ? record.username : '';
  const expiresAt = typeof record.expires_at === 'string' ? record.expires_at : '';
  const createdAt = typeof record.created_at === 'string' ? record.created_at : '';
  if (!tokenHash || !username || !expiresAt || !createdAt) return null;
  return { token_hash: tokenHash, username, expires_at: expiresAt, created_at: createdAt };
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

async function verifyPassword(password: string, storedHash: string) {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;

  const salt = parts[1];
  const expected = Buffer.from(parts[2], 'hex');
  const derived = await scrypt(password, salt, expected.length) as Buffer;

  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

async function getUserConfig() {
  const setting = await prisma.systemSetting.findUnique({ where: { key: USER_SETTING_KEY } });
  return parseStoredUser(setting?.value);
}

async function getSessionConfig() {
  const setting = await prisma.systemSetting.findUnique({ where: { key: SESSION_SETTING_KEY } });
  return parseStoredSession(setting?.value);
}

export async function hasConfiguredUser() {
  const user = await getUserConfig();
  return user !== null;
}

export async function setupInitialUser(params: { username: string; password: string }) {
  const existing = await getUserConfig();
  if (existing) {
    throw new AppError('USER_ALREADY_CONFIGURED', 409, 'Usuario ja configurado');
  }

  const username = params.username.trim();
  if (!username) {
    throw new AppError('INVALID_USERNAME', 422, 'Nome de usuario invalido');
  }

  const passwordHash = await hashPassword(params.password);

  await prisma.systemSetting.upsert({
    where: { key: USER_SETTING_KEY },
    create: {
      key: USER_SETTING_KEY,
      value: {
        username,
        password_hash: passwordHash,
        created_at: new Date().toISOString(),
      },
      description: 'Single-user authentication config',
    },
    update: {
      value: {
        username,
        password_hash: passwordHash,
        created_at: new Date().toISOString(),
      },
      description: 'Single-user authentication config',
    },
  });

  return createSession(username);
}

async function createSession(username: string) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  await prisma.systemSetting.upsert({
    where: { key: SESSION_SETTING_KEY },
    create: {
      key: SESSION_SETTING_KEY,
      value: {
        token_hash: hashToken(token),
        username,
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
      },
      description: 'Current active auth session',
    },
    update: {
      value: {
        token_hash: hashToken(token),
        username,
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
      },
      description: 'Current active auth session',
    },
  });

  return { token, expiresAt, username };
}

export async function loginWithPassword(params: { username: string; password: string }) {
  const user = await getUserConfig();
  if (!user) {
    throw new AppError('USER_NOT_CONFIGURED', 404, 'Nenhum usuario configurado');
  }

  if (user.username !== params.username.trim()) {
    throw new AppError('INVALID_CREDENTIALS', 401, 'Usuario ou senha invalidos');
  }

  const valid = await verifyPassword(params.password, user.password_hash);
  if (!valid) {
    throw new AppError('INVALID_CREDENTIALS', 401, 'Usuario ou senha invalidos');
  }

  return createSession(user.username);
}

export async function clearAuthSession() {
  await prisma.systemSetting.deleteMany({ where: { key: SESSION_SETTING_KEY } });
}

export async function getSessionUserByToken(token: string | null | undefined) {
  if (!token) return null;

  const [session, user] = await Promise.all([getSessionConfig(), getUserConfig()]);
  if (!session || !user) return null;

  const expiresAt = new Date(session.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    await clearAuthSession();
    return null;
  }

  const incomingHash = hashToken(token);
  const expectedHash = session.token_hash;

  const incomingBuffer = Buffer.from(incomingHash, 'hex');
  const expectedBuffer = Buffer.from(expectedHash, 'hex');

  if (incomingBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(incomingBuffer, expectedBuffer)) return null;

  if (session.username !== user.username) return null;

  return { username: user.username, sessionExpiresAt: session.expires_at };
}
