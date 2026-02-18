import { z } from 'zod';

// ──────────────────────────────────────────
// Storage Config schemas por tipo
// ──────────────────────────────────────────

export const localConfigSchema = z.object({
  path:         z.string().min(1),
  max_size_gb:  z.number().positive().optional(),
});

export const sshConfigSchema = z.object({
  host:        z.string().min(1),
  port:        z.number().int().min(1).max(65535).default(22),
  username:    z.string().min(1),
  password:    z.string().optional(),
  private_key: z.string().optional(),
  remote_path: z.string().min(1),
}).refine(
  (data) => data.password || data.private_key,
  { message: 'Informe password ou private_key para autenticação SSH' },
);

export const s3ConfigSchema = z.object({
  endpoint:          z.string().url().nullable().optional(),
  bucket:            z.string().min(1),
  region:            z.string().min(1),
  access_key_id:     z.string().min(1),
  secret_access_key: z.string().min(1),
  storage_class:     z.string().optional(),
});

export const minioConfigSchema = z.object({
  endpoint:   z.string().min(1),
  bucket:     z.string().min(1),
  access_key: z.string().min(1),
  secret_key: z.string().min(1),
  use_ssl:    z.boolean().default(false),
});

export const backblazeConfigSchema = z.object({
  bucket_id:          z.string().min(1),
  bucket_name:        z.string().min(1),
  application_key_id: z.string().min(1),
  application_key:    z.string().min(1),
});

// ──────────────────────────────────────────
// Tipos inferidos
// ──────────────────────────────────────────

export type LocalConfig     = z.infer<typeof localConfigSchema>;
export type SSHConfig       = z.infer<typeof sshConfigSchema>;
export type S3Config        = z.infer<typeof s3ConfigSchema>;
export type MinIOConfig     = z.infer<typeof minioConfigSchema>;
export type BackblazeConfig = z.infer<typeof backblazeConfigSchema>;

export type StorageConfig =
  | LocalConfig
  | SSHConfig
  | S3Config
  | MinIOConfig
  | BackblazeConfig;

export const storageTypeValues = [
  'local',
  's3',
  'ssh',
  'minio',
  'backblaze',
] as const;

export type StorageTypeValue = (typeof storageTypeValues)[number];

// ──────────────────────────────────────────
// Schemas da API
// ──────────────────────────────────────────

const storageSchemaByType: Record<StorageTypeValue, z.ZodTypeAny> = {
  local:     localConfigSchema,
  ssh:       sshConfigSchema,
  s3:        s3ConfigSchema,
  minio:     minioConfigSchema,
  backblaze: backblazeConfigSchema,
};

export const createStorageLocationSchema = z
  .object({
    name:       z.string().min(1).max(255),
    type:       z.enum(storageTypeValues),
    config:     z.record(z.unknown()),
    is_default: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    const result = storageSchemaByType[data.type].safeParse(data.config);
    if (!result.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['config'],
        message: `config inválida para o tipo '${data.type}': ${result.error.issues.map((i: z.ZodIssue) => i.message).join(', ')}`,
      });
    }
  });

export const updateStorageLocationSchema = z.object({
  name:       z.string().min(1).max(255).optional(),
  config:     z.record(z.unknown()).optional(),
  is_default: z.boolean().optional(),
});

export type CreateStorageLocationInput = z.infer<typeof createStorageLocationSchema>;
export type UpdateStorageLocationInput = z.infer<typeof updateStorageLocationSchema>;

// ──────────────────────────────────────────
// Campos sensíveis por tipo de storage
// ──────────────────────────────────────────

export const SENSITIVE_STORAGE_FIELDS: Record<StorageTypeValue, string[]> = {
  local:     [],
  ssh:       ['password', 'private_key'],
  s3:        ['secret_access_key'],
  minio:     ['secret_key'],
  backblaze: ['application_key'],
};
