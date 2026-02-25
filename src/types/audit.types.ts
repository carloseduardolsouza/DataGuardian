import { z } from 'zod';

export const auditLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  action: z.string().trim().optional(),
  actor: z.string().trim().optional(),
  resource_type: z.string().trim().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const auditLogsDeleteQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
}).refine((value) => Boolean(value.from || value.to), {
  message: "Informe ao menos 'from' ou 'to' para limpar o historico.",
});
