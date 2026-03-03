import { prisma } from '../../lib/prisma';

export type ScopeSubjectType = 'user' | 'role';
export type ScopeResourceType = 'datasource' | 'storage_location' | 'backup_job' | 'db_sync_job';
export type ScopeEffect = 'allow' | 'deny';

export interface ScopeEntry {
  subject_type: ScopeSubjectType;
  subject_id: string;
  permission_key: string;
  resource_type: ScopeResourceType;
  resource_id: string;
  effect: ScopeEffect;
}

export interface ScopeGroup {
  permission_key: string;
  resource_type: ScopeResourceType;
  resource_ids: string[];
  denied_resource_ids: string[];
}

interface CachedUserScopes {
  ts: number;
  role_ids: string[];
  entries: ScopeEntry[];
}

const CACHE_TTL_MS = 60_000;
const userScopeCache = new Map<string, CachedUserScopes>();
let scopeTableMissing = false;

const prismaAny = prisma as any;

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

function groupScopes(entries: ScopeEntry[]) {
  const grouped = new Map<string, { allow: Set<string>; deny: Set<string>; resource_type: ScopeResourceType; permission_key: string }>();

  for (const scope of entries) {
    const key = `${scope.permission_key}::${scope.resource_type}`;
    const current = grouped.get(key) ?? {
      permission_key: scope.permission_key,
      resource_type: scope.resource_type,
      allow: new Set<string>(),
      deny: new Set<string>(),
    };

    if (scope.effect === 'deny') current.deny.add(scope.resource_id);
    else current.allow.add(scope.resource_id);

    grouped.set(key, current);
  }

  return [...grouped.values()].map((item) => {
    const denied = [...item.deny];
    const allowed = [...item.allow].filter((id) => !item.deny.has(id));
    return {
      permission_key: item.permission_key,
      resource_type: item.resource_type,
      resource_ids: allowed,
      denied_resource_ids: denied,
    } satisfies ScopeGroup;
  });
}

async function readUserRoleIds(userId: string) {
  const rows = await prisma.userRole.findMany({
    where: { userId },
    select: { roleId: true },
  });
  return rows.map((row) => row.roleId);
}

async function readRawEntries(userId: string, roleIds: string[]): Promise<ScopeEntry[]> {
  if (scopeTableMissing) return [];

  const rows = await prismaAny.accessScope.findMany({
    where: {
      OR: [
        { subjectType: 'user', subjectId: userId },
        ...(roleIds.length > 0 ? [{ subjectType: 'role', subjectId: { in: roleIds } }] : []),
      ],
    },
    select: {
      subjectType: true,
      subjectId: true,
      permissionKey: true,
      resourceType: true,
      resourceId: true,
      effect: true,
    },
  });

  return rows.map((row: any) => ({
    subject_type: row.subjectType,
    subject_id: row.subjectId,
    permission_key: row.permissionKey,
    resource_type: row.resourceType,
    resource_id: row.resourceId,
    effect: row.effect,
  }));
}

export async function resolveEffectiveScopes(userId: string) {
  const cached = userScopeCache.get(userId);
  if (cached && Date.now() - cached.ts <= CACHE_TTL_MS) {
    return {
      role_ids: cached.role_ids,
      entries: cached.entries,
      grouped: groupScopes(cached.entries),
      cache_hit: true,
    };
  }

  const roleIds = await readUserRoleIds(userId);
  let entries: ScopeEntry[] = [];
  try {
    entries = await readRawEntries(userId, roleIds);
  } catch (err) {
    const code = (err as { code?: string } | null | undefined)?.code;
    // Prisma P2021: table does not exist (migration not applied yet).
    if (code === 'P2021') {
      scopeTableMissing = true;
      entries = [];
    } else {
      throw err;
    }
  }

  userScopeCache.set(userId, {
    ts: Date.now(),
    role_ids: roleIds,
    entries,
  });

  return {
    role_ids: roleIds,
    entries,
    grouped: groupScopes(entries),
    cache_hit: false,
  };
}

export async function resolveScopedAccess(input: {
  user_id: string;
  permission_key: string;
  resource_type: ScopeResourceType;
  resource_id?: string | null;
}) {
  const effective = await resolveEffectiveScopes(input.user_id);
  const scoped = effective.grouped.find(
    (item) => item.permission_key === input.permission_key && item.resource_type === input.resource_type,
  );

  if (!scoped) {
    return {
      has_scoped_rules: false,
      unrestricted: true,
      allowed_resource_ids: [] as string[],
      denied_resource_ids: [] as string[],
      allowed: true,
    };
  }

  const allowedSet = new Set(scoped.resource_ids);
  const deniedSet = new Set(scoped.denied_resource_ids);

  if (!input.resource_id) {
    return {
      has_scoped_rules: true,
      unrestricted: false,
      allowed_resource_ids: [...allowedSet],
      denied_resource_ids: [...deniedSet],
      allowed: true,
    };
  }

  const allowed = allowedSet.has(input.resource_id) && !deniedSet.has(input.resource_id);

  return {
    has_scoped_rules: true,
    unrestricted: false,
    allowed_resource_ids: [...allowedSet],
    denied_resource_ids: [...deniedSet],
    allowed,
  };
}

export function invalidateScopeCache(options?: { user_ids?: string[]; all?: boolean }) {
  if (options?.all) {
    userScopeCache.clear();
    return;
  }

  const userIds = uniqueStrings(options?.user_ids ?? []);
  if (userIds.length === 0) return;

  for (const userId of userIds) {
    userScopeCache.delete(userId);
  }
}

export async function invalidateScopeCacheByRoleId(roleId: string) {
  const users = await prisma.userRole.findMany({
    where: { roleId },
    select: { userId: true },
  });
  invalidateScopeCache({ user_ids: users.map((u) => u.userId) });
}

export async function listSubjectScopes(subjectType: ScopeSubjectType, subjectId: string) {
  const rows = await prismaAny.accessScope.findMany({
    where: {
      subjectType,
      subjectId,
    },
    orderBy: [
      { permissionKey: 'asc' },
      { resourceType: 'asc' },
      { effect: 'asc' },
      { resourceId: 'asc' },
    ],
    select: {
      subjectType: true,
      subjectId: true,
      permissionKey: true,
      resourceType: true,
      resourceId: true,
      effect: true,
    },
  });

  const entries: ScopeEntry[] = rows.map((row: any) => ({
    subject_type: row.subjectType,
    subject_id: row.subjectId,
    permission_key: row.permissionKey,
    resource_type: row.resourceType,
    resource_id: row.resourceId,
    effect: row.effect,
  }));

  return {
    subject_type: subjectType,
    subject_id: subjectId,
    entries,
    grouped: groupScopes(entries),
  };
}

export async function replaceSubjectScopes(input: {
  subject_type: ScopeSubjectType;
  subject_id: string;
  scopes: Array<{
    permission_key: string;
    resource_type: ScopeResourceType;
    resource_ids: string[];
    denied_resource_ids?: string[];
  }>;
}) {
  const permissionKeys = uniqueStrings(input.scopes.map((scope) => scope.permission_key));

  if (permissionKeys.length > 0) {
    const existingPermissions = await prisma.permission.findMany({
      where: { key: { in: permissionKeys } },
      select: { key: true },
    });

    const existingSet = new Set(existingPermissions.map((p) => p.key));
    const missing = permissionKeys.filter((key) => !existingSet.has(key));
    if (missing.length > 0) {
      throw new Error(`Permissao(es) nao encontrada(s): ${missing.join(', ')}`);
    }
  }

  const toCreate: Array<{
    subjectType: ScopeSubjectType;
    subjectId: string;
    permissionKey: string;
    resourceType: ScopeResourceType;
    resourceId: string;
    effect: ScopeEffect;
  }> = [];

  for (const scope of input.scopes) {
    const allowIds = uniqueStrings(scope.resource_ids);
    const denyIds = uniqueStrings(scope.denied_resource_ids ?? []);

    for (const resourceId of allowIds) {
      toCreate.push({
        subjectType: input.subject_type,
        subjectId: input.subject_id,
        permissionKey: scope.permission_key,
        resourceType: scope.resource_type,
        resourceId,
        effect: 'allow',
      });
    }

    for (const resourceId of denyIds) {
      toCreate.push({
        subjectType: input.subject_type,
        subjectId: input.subject_id,
        permissionKey: scope.permission_key,
        resourceType: scope.resource_type,
        resourceId,
        effect: 'deny',
      });
    }
  }

  await prisma.$transaction(async (tx) => {
    const txAny = tx as any;
    await txAny.accessScope.deleteMany({
      where: {
        subjectType: input.subject_type,
        subjectId: input.subject_id,
      },
    });

    if (toCreate.length > 0) {
      await txAny.accessScope.createMany({
        data: toCreate,
      });
    }
  });

  if (input.subject_type === 'user') {
    invalidateScopeCache({ user_ids: [input.subject_id] });
  } else {
    await invalidateScopeCacheByRoleId(input.subject_id);
  }

  return listSubjectScopes(input.subject_type, input.subject_id);
}
