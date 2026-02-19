import { z } from 'zod';

export const setupUserSchema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
});

export type SetupUserInput = z.infer<typeof setupUserSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
