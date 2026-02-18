import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { validate } from '../middlewares/validation';

export const systemRouter = Router();

// ──────────────────────────────────────────
// Configurações padrão do sistema
// ──────────────────────────────────────────

const DEFAULT_SETTINGS: Record<string, { value: unknown; description: string }> = {
  'notifications.email_enabled': {
    value:       false,
    description: 'Habilitar envio de alertas por e-mail',
  },
  'notifications.email_smtp_config': {
    value: {
      host:     '',
      port:     587,
      user:     '',
      password: '',
      from:     '',
      to:       [],
    },
    description: 'Configuração do servidor SMTP para envio de e-mails',
  },
  'notifications.webhook_url': {
    value:       null,
    description: 'URL de webhook para notificações (Slack, Discord, etc.)',
  },
  'system.max_concurrent_backups': {
    value:       3,
    description: 'Número máximo de backups executando em paralelo',
  },
  'system.temp_directory': {
    value:       '/tmp/dataguardian',
    description: 'Diretório temporário para staging durante o backup',
  },
  'system.health_check_interval_ms': {
    value:       300000,
    description: 'Intervalo em milissegundos entre health checks (padrão: 5 min)',
  },
  'system.scheduler_interval_ms': {
    value:       60000,
    description: 'Intervalo em milissegundos do scheduler (padrão: 1 min)',
  },
};

// ──────────────────────────────────────────
// Helper: garante que as configurações padrão existam
// ──────────────────────────────────────────

export async function seedDefaultSettings(): Promise<void> {
  const upserts = Object.entries(DEFAULT_SETTINGS).map(([key, { value, description }]) =>
    prisma.systemSetting.upsert({
      where:  { key },
      update: {},
      create: { key, value: value as Prisma.InputJsonValue, description },
    }),
  );
  await Promise.all(upserts);
}

// ──────────────────────────────────────────
// GET /api/system/settings
// ──────────────────────────────────────────

systemRouter.get('/settings', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await prisma.systemSetting.findMany({ orderBy: { key: 'asc' } });

    const result: Record<string, { value: unknown; description: string | null; updated_at: string }> = {};
    for (const s of settings) {
      // Mascara a senha do SMTP
      let value = s.value;
      if (s.key === 'notifications.email_smtp_config' && typeof value === 'object' && value !== null) {
        const v = { ...(value as Record<string, unknown>) };
        if (v.password) v.password = '**********';
        value = v;
      }
      result[s.key] = {
        value,
        description: s.description,
        updated_at:  s.updatedAt.toISOString(),
      };
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────
// PUT /api/system/settings
// ──────────────────────────────────────────

const updateSettingsSchema = z.record(z.unknown());

systemRouter.put(
  '/settings',
  validate(updateSettingsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updates = req.body as Record<string, unknown>;

      const upserts = Object.entries(updates).map(([key, value]) =>
        prisma.systemSetting.upsert({
          where:  { key },
          create: {
            key,
            value:       value as Prisma.InputJsonValue,
            description: DEFAULT_SETTINGS[key]?.description ?? null,
          },
          update: {
            value: value as Prisma.InputJsonValue,
          },
        }),
      );

      const updated = await Promise.all(upserts);

      const result: Record<string, { value: unknown; description: string | null; updated_at: string }> = {};
      for (const s of updated) {
        result[s.key] = {
          value:       s.value,
          description: s.description,
          updated_at:  s.updatedAt.toISOString(),
        };
      }

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ──────────────────────────────────────────
// POST /api/system/settings/test-smtp
// ──────────────────────────────────────────

systemRouter.post(
  '/settings/test-smtp',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const emailEnabled = await prisma.systemSetting.findUnique({
        where: { key: 'notifications.email_enabled' },
      });

      if (!emailEnabled?.value) {
        return res.status(400).json({
          error:   'EMAIL_NOT_CONFIGURED',
          message: 'E-mail não está habilitado. Configure notifications.email_enabled = true e o SMTP antes de testar.',
        });
      }

      // TODO: Implementar envio real via nodemailer quando disponível.

      res.status(501).json({
        error:   'NOT_IMPLEMENTED',
        message: 'Envio de e-mail de teste ainda não implementado. Será ativado junto com o sistema de notificações.',
      });
    } catch (err) {
      next(err);
    }
  },
);
