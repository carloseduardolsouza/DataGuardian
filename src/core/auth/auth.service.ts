import { createHash, randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Prisma, type User } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../api/middlewares/error-handler';
import { DEFAULT_ROLE_NAMES, DEFAULT_ROLE_SEEDS, PERMISSION_SEEDS } from './permissions';

const scrypt = promisify(_scrypt);

const USER_SETTING_KEY = 'auth.user';
const SESSION_SETTING_KEY = 'auth.session';

export const AUTH_COOKIE_NAME = 'dg_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface AuthSessionUser {
  id: string;
  username: string;
  full_name: string | null;
  is_owner: boolean;
  roles: string[];
  permissions: string[];
  session_expires_at: string;
}

interface LegacyStoredUserConfig {
  username: string;
  password_hash: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parseLegacyStoredUser(value: unknown): LegacyStoredUserConfig | null {
  const record = asRecord(value);
  const username = typeof record.username === 'string' ? record.username : '';
  const passwordHash = typeof record.password_hash === 'string' ? record.password_hash : '';
  if (!username || !passwordHash) return null;
  return { username, password_hash: passwordHash };
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function hashPassword(password: string) {
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

export async function verifyUserPassword(userId: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, isActive: true },
  });
  if (!user || !user.isActive) return false;
  return verifyPassword(password, user.passwordHash);
}

export async function verifyAnyAdminPassword(password: string) {
  const adminUsers = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { isOwner: true },
        {
          roles: {
            some: {
              role: {
                name: DEFAULT_ROLE_NAMES.ADMIN,
              },
            },
          },
        },
      ],
    },
    select: {
      id: true,
      passwordHash: true,
    },
  });

  for (const user of adminUsers) {
    const valid = await verifyPassword(password, user.passwordHash);
    if (valid) return user.id;
  }

  return null;
}

export async function userHasPermission(userId: string, permissionKey: string) {
  const count = await prisma.userRole.count({
    where: {
      userId,
      role: {
        permissions: {
          some: {
            permission: {
              key: permissionKey,
            },
          },
        },
      },
    },
  });
  return count > 0;
}

async function getLegacyUserConfig() {
  const setting = await prisma.systemSetting.findUnique({ where: { key: USER_SETTING_KEY } });
  return parseLegacyStoredUser(setting?.value);
}

async function ensureDefaultPermissionsAndRolesTx(tx: Prisma.TransactionClient) {
  for (const permission of PERMISSION_SEEDS) {
    await tx.permission.upsert({
      where: { key: permission.key },
      create: {
        key: permission.key,
        label: permission.label,
        description: permission.description,
      },
      update: {
        label: permission.label,
        description: permission.description,
      },
    });
  }

  const permissions = await tx.permission.findMany({
    select: { id: true, key: true },
  });
  const permissionByKey = new Map(permissions.map((p) => [p.key, p.id]));

  for (const roleSeed of DEFAULT_ROLE_SEEDS) {
    const role = await tx.role.upsert({
      where: { name: roleSeed.name },
      create: {
        name: roleSeed.name,
        description: roleSeed.description,
        isSystem: roleSeed.isSystem,
      },
      update: {
        description: roleSeed.description,
        isSystem: roleSeed.isSystem,
      },
    });

    if (!role.isSystem) continue;
    await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
    for (const permissionKey of roleSeed.permissions) {
      const permissionId = permissionByKey.get(permissionKey);
      if (!permissionId) continue;
      await tx.rolePermission.create({
        data: { roleId: role.id, permissionId },
      });
    }
  }
}

export async function seedAuthDefaults() {
  await prisma.$transaction(async (tx) => {
    await ensureDefaultPermissionsAndRolesTx(tx);
  });
}

async function migrateLegacySingleUserIfNeeded() {
  const usersCount = await prisma.user.count();
  if (usersCount > 0) return;

  const legacy = await getLegacyUserConfig();
  if (!legacy) return;

  await prisma.$transaction(async (tx) => {
    await ensureDefaultPermissionsAndRolesTx(tx);

    const adminRole = await tx.role.findUnique({
      where: { name: DEFAULT_ROLE_NAMES.ADMIN },
      select: { id: true },
    });

    if (!adminRole) {
      throw new AppError('AUTH_BOOTSTRAP_FAILED', 500, 'Role admin nao encontrada para migracao');
    }

    const user = await tx.user.create({
      data: {
        username: legacy.username.trim(),
        passwordHash: legacy.password_hash,
        isOwner: true,
      },
    });

    await tx.userRole.create({
      data: {
        userId: user.id,
        roleId: adminRole.id,
      },
    });

    await tx.systemSetting.deleteMany({
      where: { key: { in: [USER_SETTING_KEY, SESSION_SETTING_KEY] } },
    });
  });
}

async function getUserWithAccessById(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
        },
      },
    },
  });
}

function normalizeUserAccess(user: Awaited<ReturnType<typeof getUserWithAccessById>>): Omit<AuthSessionUser, 'session_expires_at'> | null {
  if (!user) return null;
  const roles = user.roles.map((ur) => ur.role.name);
  const permissions = [...new Set(user.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.key)))];

  return {
    id: user.id,
    username: user.username,
    full_name: user.fullName ?? null,
    is_owner: user.isOwner,
    roles,
    permissions,
  };
}

export async function hasConfiguredUser() {
  await migrateLegacySingleUserIfNeeded();
  const count = await prisma.user.count();
  return count > 0;
}

async function createSession(user: User, meta?: { ip?: string | null; userAgent?: string | null }) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.authSession.create({
    data: {
      tokenHash: hashToken(token),
      userId: user.id,
      expiresAt,
      ip: meta?.ip ?? null,
      userAgent: meta?.userAgent ?? null,
    },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return { token, expiresAt: expiresAt.toISOString() };
}

async function ensureAnyRoleForUserTx(tx: Prisma.TransactionClient, userId: string) {
  const hasRole = await tx.userRole.count({ where: { userId } });
  if (hasRole > 0) return;

  const role = await tx.role.findUnique({
    where: { name: DEFAULT_ROLE_NAMES.ADMIN },
    select: { id: true },
  });
  if (!role) {
    throw new AppError('ROLE_NOT_FOUND', 500, 'Role admin nao encontrada');
  }

  await tx.userRole.create({
    data: { userId, roleId: role.id },
  });
}

export async function setupInitialUser(params: { username: string; password: string }, meta?: { ip?: string | null; userAgent?: string | null }) {
  await migrateLegacySingleUserIfNeeded();

  const existingCount = await prisma.user.count();
  if (existingCount > 0) {
    throw new AppError('USER_ALREADY_CONFIGURED', 409, 'Usuario ja configurado');
  }

  const username = params.username.trim();
  if (!username) {
    throw new AppError('INVALID_USERNAME', 422, 'Nome de usuario invalido');
  }

  const passwordHash = await hashPassword(params.password);
  const createdUser = await prisma.$transaction(async (tx) => {
    await ensureDefaultPermissionsAndRolesTx(tx);

    const user = await tx.user.create({
      data: {
        username,
        passwordHash,
        isOwner: true,
      },
    });

    await ensureAnyRoleForUserTx(tx, user.id);
    return user;
  });

  const session = await createSession(createdUser, meta);
  const accessUser = await getUserWithAccessById(createdUser.id);
  const normalized = normalizeUserAccess(accessUser);
  if (!normalized) {
    throw new AppError('USER_NOT_FOUND', 404, 'Usuario nao encontrado');
  }

  return {
    ...session,
    user: {
      ...normalized,
      session_expires_at: session.expiresAt,
    },
  };
}

export async function loginWithPassword(
  params: { username: string; password: string },
  meta?: { ip?: string | null; userAgent?: string | null },
) {
  await migrateLegacySingleUserIfNeeded();

  const user = await prisma.user.findUnique({
    where: { username: params.username.trim() },
  });

  if (!user || !user.isActive) {
    throw new AppError('INVALID_CREDENTIALS', 401, 'Usuario ou senha invalidos');
  }

  const valid = await verifyPassword(params.password, user.passwordHash);
  if (!valid) {
    throw new AppError('INVALID_CREDENTIALS', 401, 'Usuario ou senha invalidos');
  }

  await prisma.$transaction(async (tx) => {
    await ensureAnyRoleForUserTx(tx, user.id);
  });

  const session = await createSession(user, meta);
  const accessUser = await getUserWithAccessById(user.id);
  const normalized = normalizeUserAccess(accessUser);
  if (!normalized) {
    throw new AppError('USER_NOT_FOUND', 404, 'Usuario nao encontrado');
  }

  return {
    ...session,
    user: {
      ...normalized,
      session_expires_at: session.expiresAt,
    },
  };
}

export async function clearAuthSession(token: string | null | undefined) {
  if (!token) return;
  await prisma.authSession.deleteMany({
    where: { tokenHash: hashToken(token) },
  });
}

export async function clearExpiredAuthSessions() {
  await prisma.authSession.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
}

export async function getSessionUserByToken(token: string | null | undefined) {
  if (!token) return null;

  await migrateLegacySingleUserIfNeeded();

  const tokenHash = hashToken(token);
  const session = await prisma.authSession.findUnique({
    where: { tokenHash },
    select: {
      userId: true,
      expiresAt: true,
    },
  });

  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.authSession.deleteMany({ where: { tokenHash } });
    return null;
  }

  const user = await getUserWithAccessById(session.userId);
  if (!user || !user.isActive) return null;

  const normalized = normalizeUserAccess(user);
  if (!normalized) return null;

  return {
    ...normalized,
    session_expires_at: session.expiresAt.toISOString(),
  } satisfies AuthSessionUser;
}
