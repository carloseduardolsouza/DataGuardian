import { z } from 'zod';

export const criticalApprovalActionSchema = z.enum([
  'datasource.delete',
  'storage.delete',
  'storage.path.delete',
  'backup_job.delete',
  'backup_job.run',
  'db_sync_job.delete',
  'db_sync_job.run',
  'execution.delete',
  'backup.restore',
  'backup.import_restore',
  'audit_logs.cleanup',
]);

export const createCriticalApprovalRequestSchema = z.object({
  action: criticalApprovalActionSchema,
  action_label: z.string().trim().min(1).max(180).optional(),
  resource_type: z.string().trim().min(1).max(80).optional(),
  resource_id: z.string().trim().min(1).max(160).optional(),
  request_reason: z.string().trim().max(500).optional(),
  payload: z.record(z.unknown()).optional(),
});

export const updateCriticalApprovalDecisionSchema = z.object({
  decision_reason: z.string().trim().max(500).optional(),
  expires_minutes: z.coerce.number().int().min(1).max(24 * 60).optional(),
});

export const criticalApprovalListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['pending', 'approved', 'rejected', 'canceled']).optional(),
  requester_user_id: z.string().uuid().optional(),
  action: criticalApprovalActionSchema.optional(),
});

