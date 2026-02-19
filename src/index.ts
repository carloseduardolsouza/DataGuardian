import { prisma } from './lib/prisma';
import { createApp } from './api/server';
import { seedDefaultSettings } from './api/models/system.model';
import { config } from './utils/config';
import { logger } from './utils/logger';
import { startBackupWorker, stopBackupWorker } from './workers/backup-worker';
import { startSchedulerWorker, stopSchedulerWorker } from './workers/scheduler-worker';
import { startHealthWorker, stopHealthWorker } from './workers/health-worker';
import { startCleanupWorker, stopCleanupWorker } from './workers/cleanup-worker';

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
    await seedDefaultSettings();
    logger.info('Configurações padrão verificadas/criadas');
  } catch (err) {
    logger.warn({ err }, 'Erro ao verificar configurações padrão');
  }

  const app = createApp();
  const port = config.port;

  const server = app.listen(port, () => {
    logger.info(`API REST disponível em http://localhost:${port}`);
    logger.info(`Ambiente: ${config.env}`);
  });

  startSchedulerWorker();
  startBackupWorker();
  startHealthWorker();
  startCleanupWorker();

  const shutdown = async (signal: string) => {
    logger.info(`Sinal ${signal} recebido. Encerrando servidor...`);
    server.close(async () => {
      stopHealthWorker();
      stopSchedulerWorker();
      stopBackupWorker();
      stopCleanupWorker();
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

