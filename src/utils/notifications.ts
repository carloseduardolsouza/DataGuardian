import {
  NotificationType,
  NotificationSeverity,
  NotificationEntityType,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from './logger';

interface CreateNotificationInput {
  type:       NotificationType;
  severity:   NotificationSeverity;
  entityType: NotificationEntityType;
  entityId:   string;
  title:      string;
  message:    string;
  metadata?:  Record<string, unknown>;
}

/**
 * Persiste uma notificação no banco e, se configurado,
 * envia via e-mail ou webhook.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        type:       input.type,
        severity:   input.severity,
        entityType: input.entityType,
        entityId:   input.entityId,
        title:      input.title,
        message:    input.message,
        metadata:   input.metadata ?? {},
      },
    });

    // TODO: Implementar envio de e-mail via SMTP quando
    // notifications.email_enabled estiver ativo em system_settings.

    // TODO: Implementar envio de webhook quando
    // notifications.webhook_url estiver configurado em system_settings.

    logger.info(
      { type: input.type, severity: input.severity, entityId: input.entityId },
      `Notificação criada: ${input.title}`,
    );
  } catch (error) {
    logger.error({ error, input }, 'Erro ao criar notificação');
  }
}
