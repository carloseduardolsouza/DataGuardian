import { prisma } from './lib/prisma';
import { createApp } from './api/server';
import { seedDefaultSettings } from './api/models/system.model';
import { config } from './utils/config';
import { logger } from './utils/logger';
import { startBackupWorker, stopBackupWorker } from './workers/backup-worker';
import { startRestoreWorker, stopRestoreWorker } from './workers/restore-worker';
import { startSchedulerWorker, stopSchedulerWorker } from './workers/scheduler-worker';
import { startHealthWorker, stopHealthWorker } from './workers/health-worker';
import { startCleanupWorker, stopCleanupWorker } from './workers/cleanup-worker';
import { closeQueues } from './queue/queues';
import { closeRedis, connectRedis, ensureRedisAvailable } from './queue/redis-client';
import { seedAuthDefaults } from './core/auth/auth.service';
import { seedDefaultNotificationTemplates } from './api/models/notification-template.model';

async function bootstrap() {
  logger.info('Iniciando DataGuardian...');

  try {
    await prisma.$connect();
    logger.info('Conectado ao PostgreSQL');
  } catch (err) {
    logger.fatal({ err }, 'Falha ao conectar ao PostgreSQL. Verifique DATABASE_URL.');
    process.exit(1);
  }

  try {
    await connectRedis();
    logger.info('Conectado ao Redis');
  } catch (err) {
    logger.warn(
      { err },
      'Redis indisponivel. Servicos de fila (Scheduler/Backup) foram desativados.',
    );
  }

  try {
    await seedDefaultSettings();
    logger.info('Configurações padrão verificadas/criadas');
  } catch (err) {
    logger.warn({ err }, 'Erro ao verificar configurações padrão');
  }

  try {
    await seedAuthDefaults();
    logger.info('Roles e permissoes padrao verificadas/criadas');
  } catch (err) {
    logger.warn({ err }, 'Erro ao verificar roles/permissoes padrao');
  }

  try {
    await seedDefaultNotificationTemplates();
    logger.info('Templates de notificacao padrao verificados/criados');
  } catch (err) {
    logger.warn({ err }, 'Erro ao verificar templates de notificacao');
  }

  const app = createApp();
  const port = config.port;

  const server = app.listen(port, () => {
    logger.info(`API REST disponível em http://localhost:${port}`);
    logger.info(`Ambiente: ${config.env}`);
  });

  let queueServicesEnabled = false;
  let redisMonitorTimer: NodeJS.Timeout | null = null;
  let redisMonitorRunning = false;

  const startQueueServices = () => {
    if (queueServicesEnabled) return;
    startSchedulerWorker();
    startBackupWorker();
    startRestoreWorker();
    queueServicesEnabled = true;
    logger.info('Servicos de fila ativados (Scheduler/Backup/Restore)');
  };

  const stopQueueServices = async () => {
    if (!queueServicesEnabled) return;
    stopSchedulerWorker();
    await stopBackupWorker();
    await stopRestoreWorker();
    await closeQueues();
    queueServicesEnabled = false;
    logger.warn('Servicos de fila desativados por indisponibilidade do Redis (Scheduler/Backup/Restore)');
  };

  const syncQueueServicesWithRedis = async () => {
    if (redisMonitorRunning) return;
    redisMonitorRunning = true;
    try {
      const ready = await ensureRedisAvailable();
      if (ready) {
        startQueueServices();
      } else {
        await stopQueueServices();
      }
    } finally {
      redisMonitorRunning = false;
    }
  };

  startHealthWorker();
  startCleanupWorker();
  await syncQueueServicesWithRedis();
  redisMonitorTimer = setInterval(() => {
    void syncQueueServicesWithRedis();
  }, 15_000);

  const shutdown = async (signal: string) => {
    logger.info(`Sinal ${signal} recebido. Encerrando servidor...`);
    server.close(async () => {
      stopHealthWorker();
      stopCleanupWorker();
      if (redisMonitorTimer) {
        clearInterval(redisMonitorTimer);
        redisMonitorTimer = null;
      }
      await stopQueueServices();
      await closeRedis();
      await prisma.$disconnect();
      logger.info('Servidor encerrado com sucesso');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception - encerrando');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled rejection - encerrando');
    process.exit(1);
  });
}

bootstrap();

