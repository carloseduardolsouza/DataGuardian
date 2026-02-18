import { Router, Request, Response, NextFunction } from 'express';
import { Prisma, StorageLocationType, StorageLocationStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { validate } from '../middlewares/validation';
import { AppError } from '../middlewares/error-handler';
import {
  createStorageLocationSchema,
  updateStorageLocationSchema,
  SENSITIVE_STORAGE_FIELDS,
  StorageTypeValue,
} from '../../types/storage.types';
import {
  getPaginationParams,
  buildPaginatedResponse,
} from '../../utils/config';

export const storageLocationsRouter = Router();

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────

function maskStorageConfig(type: StorageLocationType, config: Record<string, unknown>) {
  const sensitiveFields = SENSITIVE_STORAGE_FIELDS[type as StorageTypeValue] ?? [];
  const masked: Record<string, unknown> = { ...config };
  for (const field of sensitiveFields) {
    if (field in masked) masked[field] = '**********';
  }
  return masked;
}

function formatStorageLocation(sl: {
  id: string;
  name: string;
  type: StorageLocationType;
  isDefault: boolean;
  availableSpaceGb: Prisma.Decimal | null;
  status: StorageLocationStatus;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id:                sl.id,
    name:              sl.name,
    type:              sl.type,
    is_default:        sl.isDefault,
    available_space_gb: sl.availableSpaceGb ? Number(sl.availableSpaceGb) : null,
    status:            sl.status,
    created_at:        sl.createdAt.toISOString(),
    updated_at:        sl.updatedAt.toISOString(),
  };
}

// ──────────────────────────────────────────
// Query schema
// ──────────────────────────────────────────

const listQuerySchema = z.object({
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  type:   z.enum(['local', 's3', 'ssh', 'minio', 'backblaze']).optional(),
  status: z.enum(['healthy', 'full', 'unreachable']).optional(),
});

// ──────────────────────────────────────────
// GET /api/storage-locations
// ──────────────────────────────────────────

storageLocationsRouter.get(
  '/',
  validate(listQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit, type, status } = req.query as z.infer<typeof listQuerySchema>;
      const { skip } = getPaginationParams({ page, limit });

      const where: Prisma.StorageLocationWhereInput = {};
      if (type)   where.type   = type as StorageLocationType;
      if (status) where.status = status as StorageLocationStatus;

      const [items, total] = await Promise.all([
        prisma.storageLocation.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true, name: true, type: true, isDefault: true,
            availableSpaceGb: true, status: true, createdAt: true, updatedAt: true,
            // config excluído por segurança
          },
        }),
        prisma.storageLocation.count({ where }),
      ]);

      res.json(buildPaginatedResponse(items.map(formatStorageLocation), total, page, limit));
    } catch (err) {
      next(err);
    }
  },
);

// ──────────────────────────────────────────
// POST /api/storage-locations
// ──────────────────────────────────────────

storageLocationsRouter.post(
  '/',
  validate(createStorageLocationSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, type, config, is_default } = req.body;

      // Se is_default = true, remove o padrão dos demais
      if (is_default) {
        await prisma.storageLocation.updateMany({
          where: { isDefault: true },
          data:  { isDefault: false },
        });
      }

      const storageLocation = await prisma.storageLocation.create({
        data: {
          name,
          type:      type as StorageLocationType,
          config:    config as Prisma.InputJsonValue,
          isDefault: is_default ?? false,
        },
      });

      // TODO: Testar conexão real quando adapters estiverem implementados.

      res.status(201).json(formatStorageLocation(storageLocation));
    } catch (err) {
      next(err);
    }
  },
);

// ──────────────────────────────────────────
// GET /api/storage-locations/:id
// ──────────────────────────────────────────

storageLocationsRouter.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sl = await prisma.storageLocation.findUniqueOrThrow({
        where: { id: req.params.id },
      });

      res.json({
        ...formatStorageLocation(sl),
        config: maskStorageConfig(sl.type, sl.config as Record<string, unknown>),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ──────────────────────────────────────────
// PUT /api/storage-locations/:id
// ──────────────────────────────────────────

storageLocationsRouter.put(
  '/:id',
  validate(updateStorageLocationSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, config, is_default } = req.body;

      await prisma.storageLocation.findUniqueOrThrow({ where: { id: req.params.id } });

      // Se is_default = true, remove o padrão dos demais
      if (is_default) {
        await prisma.storageLocation.updateMany({
          where: { isDefault: true, NOT: { id: req.params.id } },
          data:  { isDefault: false },
        });
      }

      const updated = await prisma.storageLocation.update({
        where: { id: req.params.id },
        data: {
          ...(name       !== undefined && { name }),
          ...(config     !== undefined && { config: config as Prisma.InputJsonValue }),
          ...(is_default !== undefined && { isDefault: is_default }),
        },
      });

      res.json(formatStorageLocation(updated));
    } catch (err) {
      next(err);
    }
  },
);

// ──────────────────────────────────────────
// DELETE /api/storage-locations/:id
// ──────────────────────────────────────────

storageLocationsRouter.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await prisma.storageLocation.findUniqueOrThrow({ where: { id: req.params.id } });

      const activeJobs = await prisma.backupJob.findMany({
        where:  { storageLocationId: req.params.id },
        select: { id: true },
      });

      if (activeJobs.length > 0) {
        throw new AppError(
          'STORAGE_HAS_ACTIVE_JOBS',
          409,
          `Existem ${activeJobs.length} backup job(s) usando este storage. Remova-os primeiro.`,
          { job_ids: activeJobs.map((j) => j.id) },
        );
      }

      await prisma.storageLocation.delete({ where: { id: req.params.id } });

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

// ──────────────────────────────────────────
// POST /api/storage-locations/:id/test
// ──────────────────────────────────────────

storageLocationsRouter.post(
  '/:id/test',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sl = await prisma.storageLocation.findUniqueOrThrow({
        where: { id: req.params.id },
      });

      // TODO: Implementar teste real via storage adapter quando implementados.

      res.status(501).json({
        error:              'NOT_IMPLEMENTED',
        message:            `Teste de conexão para storage do tipo '${sl.type}' ainda não implementado.`,
        storage_location_id: sl.id,
        type:               sl.type,
      });
    } catch (err) {
      next(err);
    }
  },
);
