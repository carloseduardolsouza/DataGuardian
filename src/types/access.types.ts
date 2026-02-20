import { z } from 'zod';

export const createRoleSchema = z.object({
  name: z.string().trim().min(2).max(64),
  description: z.string().trim().max(300).nullable().optional(),
  permission_ids: z.array(z.string().uuid()).optional(),
});

export const updateRoleSchema = z.object({
  name: z.string().trim().min(2).max(64).optional(),
  description: z.string().trim().max(300).nullable().optional(),
  permission_ids: z.array(z.string().uuid()).optional(),
}).refine((v) => v.name !== undefined || v.description !== undefined || v.permission_ids !== undefined, {
  message: 'Informe ao menos um campo para atualizar',
});

export const createUserSchema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(8).max(128),
  full_name: z.string().trim().max(120).nullable().optional(),
  email: z.string().trim().email().max(190).nullable().optional(),
  is_active: z.boolean().optional(),
  is_owner: z.boolean().optional(),
  role_ids: z.array(z.string().uuid()).optional(),
});

export const updateUserSchema = z.object({
  full_name: z.string().trim().max(120).nullable().optional(),
  email: z.string().trim().email().max(190).nullable().optional(),
  is_active: z.boolean().optional(),
  is_owner: z.boolean().optional(),
  role_ids: z.array(z.string().uuid()).optional(),
}).refine((v) => v.full_name !== undefined
  || v.email !== undefined
  || v.is_active !== undefined
  || v.is_owner !== undefined
  || v.role_ids !== undefined, {
  message: 'Informe ao menos um campo para atualizar',
});

export const updateUserPasswordSchema = z.object({
  password: z.string().min(8).max(128),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});
