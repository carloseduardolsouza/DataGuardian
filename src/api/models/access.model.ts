import { prisma } from '../../lib/prisma';
import { AppError } from '../middlewares/error-handler';
import { DEFAULT_ROLE_NAMES } from '../../core/auth/permissions';
import { hashPassword } from '../../core/auth/auth.service';

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

async function resolveRoleIds(roleIds: string[]) {
  const ids = uniqueStrings(roleIds);
  if (ids.length === 0) return [];

  const roles = await prisma.role.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  if (roles.length !== ids.length) {
    throw new AppError('VALIDATION_ERROR', 422, 'Um ou mais roles informados nao existem');
  }
  return ids;
}

async function resolvePermissionIds(permissionIds: string[]) {
  const ids = uniqueStrings(permissionIds);
  if (ids.length === 0) return [];

  const permissions = await prisma.permission.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  if (permissions.length !== ids.length) {
    throw new AppError('VALIDATION_ERROR', 422, 'Uma ou mais permissoes informadas nao existem');
  }
  return ids;
}

function mapPermission(permission: {
  id: string;
  key: string;
  label: string;
  description: string | null;
}) {
  return {
    id: permission.id,
    key: permission.key,
    label: permission.label,
    description: permission.description,
  };
}

function mapRole(role: {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
  permissions: Array<{ permission: { id: string; key: string; label: string; description: string | null } }>;
  users?: Array<{ userId: string }>;
}) {
  const permissions = role.permissions.map((rp) => mapPermission(rp.permission));
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    is_system: role.isSystem,
    permissions,
    users_count: role.users?.length ?? 0,
    created_at: role.createdAt.toISOString(),
    updated_at: role.updatedAt.toISOString(),
  };
}

function mapUser(user: {
  id: string;
  username: string;
  fullName: string | null;
  email: string | null;
  isActive: boolean;
  isOwner: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  roles: Array<{
    role: {
      id: string;
      name: string;
      description: string | null;
      isSystem: boolean;
      permissions: Array<{ permission: { id: string; key: string; label: string; description: string | null } }>;
    };
  }>;
}) {
  const roles = user.roles.map((ur) => ({
    id: ur.role.id,
    name: ur.role.name,
    description: ur.role.description,
    is_system: ur.role.isSystem,
  }));

  const permissions = [
    ...new Set(user.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.key))),
  ];

  return {
    id: user.id,
    username: user.username,
    full_name: user.fullName,
    email: user.email,
    is_active: user.isActive,
    is_owner: user.isOwner,
    last_login_at: user.lastLoginAt?.toISOString() ?? null,
    created_at: user.createdAt.toISOString(),
    updated_at: user.updatedAt.toISOString(),
    roles,
    permissions,
  };
}

export async function listAccessPermissions() {
  const permissions = await prisma.permission.findMany({
    orderBy: { key: 'asc' },
  });
  return permissions.map(mapPermission);
}

export async function listAccessRoles() {
  const roles = await prisma.role.findMany({
    include: {
      permissions: {
        include: { permission: true },
      },
      users: {
        select: { userId: true },
      },
    },
    orderBy: { name: 'asc' },
  });

  return roles.map(mapRole);
}

export async function createAccessRole(input: {
  name: string;
  description?: string | null;
  permission_ids?: string[];
}) {
  const name = input.name.trim().toLowerCase();
  if (!name) {
    throw new AppError('VALIDATION_ERROR', 422, 'Nome da role obrigatorio');
  }

  const permissionIds = await resolvePermissionIds(input.permission_ids ?? []);
  const created = await prisma.$transaction(async (tx) => {
    const role = await tx.role.create({
      data: {
        name,
        description: input.description?.trim() || null,
        isSystem: false,
      },
    });

    if (permissionIds.length > 0) {
      await tx.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
      });
    }

    return tx.role.findUniqueOrThrow({
      where: { id: role.id },
      include: {
        permissions: { include: { permission: true } },
        users: { select: { userId: true } },
      },
    });
  });

  return mapRole(created);
}

export async function updateAccessRole(roleId: string, input: {
  name?: string;
  description?: string | null;
  permission_ids?: string[];
}) {
  const existing = await prisma.role.findUnique({ where: { id: roleId } });
  if (!existing) {
    throw new AppError('NOT_FOUND', 404, 'Role nao encontrada');
  }

  const permissionIds = input.permission_ids ? await resolvePermissionIds(input.permission_ids) : null;
  const updated = await prisma.$transaction(async (tx) => {
    await tx.role.update({
      where: { id: roleId },
      data: {
        ...(input.name !== undefined && { name: input.name.trim().toLowerCase() }),
        ...(input.description !== undefined && { description: input.description?.trim() || null }),
      },
    });

    if (permissionIds) {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
        });
      }
    }

    return tx.role.findUniqueOrThrow({
      where: { id: roleId },
      include: {
        permissions: { include: { permission: true } },
        users: { select: { userId: true } },
      },
    });
  });

  return mapRole(updated);
}

export async function deleteAccessRole(roleId: string) {
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: {
      users: { select: { userId: true } },
    },
  });
  if (!role) {
    throw new AppError('NOT_FOUND', 404, 'Role nao encontrada');
  }

  if (role.isSystem) {
    throw new AppError('VALIDATION_ERROR', 422, 'Roles de sistema nao podem ser removidas');
  }

  if (role.users.length > 0) {
    throw new AppError('VALIDATION_ERROR', 422, 'Role possui usuarios vinculados');
  }

  await prisma.role.delete({ where: { id: roleId } });
}

async function getFallbackRoleId() {
  const role = await prisma.role.findUnique({
    where: { name: DEFAULT_ROLE_NAMES.OPERATOR },
    select: { id: true },
  });
  if (!role) {
    throw new AppError('ROLE_NOT_FOUND', 500, 'Role padrao operator nao encontrada');
  }
  return role.id;
}

export async function listAccessUsers() {
  const users = await prisma.user.findMany({
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
    orderBy: { username: 'asc' },
  });

  return users.map(mapUser);
}

export async function createAccessUser(input: {
  username: string;
  password: string;
  full_name?: string | null;
  email?: string | null;
  is_active?: boolean;
  role_ids?: string[];
  is_owner?: boolean;
}) {
  const username = input.username.trim();
  if (!username) {
    throw new AppError('VALIDATION_ERROR', 422, 'Username obrigatorio');
  }

  const passwordHash = await hashPassword(input.password);
  const roleIds = input.role_ids?.length ? await resolveRoleIds(input.role_ids) : [await getFallbackRoleId()];

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username,
        passwordHash,
        fullName: input.full_name?.trim() || null,
        email: input.email?.trim() || null,
        isActive: input.is_active ?? true,
        isOwner: input.is_owner ?? false,
      },
    });

    await tx.userRole.createMany({
      data: roleIds.map((roleId) => ({ userId: user.id, roleId })),
    });

    return tx.user.findUniqueOrThrow({
      where: { id: user.id },
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
  });

  return mapUser(created);
}

export async function updateAccessUser(userId: string, input: {
  full_name?: string | null;
  email?: string | null;
  is_active?: boolean;
  role_ids?: string[];
  is_owner?: boolean;
}) {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: { include: { permission: true } },
            },
          },
        },
      },
    },
  });

  if (!existing) {
    throw new AppError('NOT_FOUND', 404, 'Usuario nao encontrado');
  }

  const roleIds = input.role_ids ? await resolveRoleIds(input.role_ids) : null;

  if (input.is_owner === false && existing.isOwner) {
    const owners = await prisma.user.count({ where: { isOwner: true, isActive: true } });
    if (owners <= 1) {
      throw new AppError('VALIDATION_ERROR', 422, 'Deve existir ao menos um owner ativo');
    }
  }

  if (input.is_active === false && existing.isOwner) {
    const owners = await prisma.user.count({ where: { isOwner: true, isActive: true } });
    if (owners <= 1) {
      throw new AppError('VALIDATION_ERROR', 422, 'Nao e permitido desativar o ultimo owner ativo');
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        ...(input.full_name !== undefined && { fullName: input.full_name?.trim() || null }),
        ...(input.email !== undefined && { email: input.email?.trim() || null }),
        ...(input.is_active !== undefined && { isActive: input.is_active }),
        ...(input.is_owner !== undefined && { isOwner: input.is_owner }),
      },
    });

    if (roleIds) {
      await tx.userRole.deleteMany({ where: { userId } });
      const ensuredRoleIds = roleIds.length > 0 ? roleIds : [await getFallbackRoleId()];
      await tx.userRole.createMany({
        data: ensuredRoleIds.map((roleId) => ({ userId, roleId })),
      });
    }

    return tx.user.findUniqueOrThrow({
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
  });

  return mapUser(updated);
}

export async function updateAccessUserPassword(userId: string, password: string) {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) {
    throw new AppError('NOT_FOUND', 404, 'Usuario nao encontrado');
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  await prisma.authSession.deleteMany({ where: { userId } });
}

export async function deleteAccessUser(userId: string, actorUserId: string) {
  if (userId === actorUserId) {
    throw new AppError('VALIDATION_ERROR', 422, 'Nao e permitido remover o proprio usuario');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError('NOT_FOUND', 404, 'Usuario nao encontrado');
  }

  if (user.isOwner) {
    const owners = await prisma.user.count({ where: { isOwner: true, isActive: true } });
    if (owners <= 1) {
      throw new AppError('VALIDATION_ERROR', 422, 'Nao e permitido remover o ultimo owner ativo');
    }
  }

  await prisma.user.delete({ where: { id: userId } });
}
