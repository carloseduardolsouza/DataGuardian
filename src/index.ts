import { prisma } from './lib/prisma';
import { createApp } from './api/server';
import { seedDefaultSettings } from './api/models/system.model';
import { config } from './utils/config';
import { logger } from './utils/logger';

// ──────────────────────────────────────────
// Entry point do DataGuardian
// ──────────────────────────────────────────

async function bootstrap() {
  logger.info('Iniciando DataGuardian...');

  // 1. Conecta ao banco de dados
  try {
    await prisma.$connect();
    logger.info('Conectado ao PostgreSQL');
  } catch (err) {
    logger.fatal({ err }, 'Falha ao conectar ao PostgreSQL. Verifique DATABASE_URL.');
    process.exit(1);
  }

  // 2. Seed das configurações padrão do sistema
  try {
    await seedDefaultSettings();
    logger.info('Configurações padrão verificadas/criadas');
  } catch (err) {
    logger.warn({ err }, 'Erro ao verificar configurações padrão');
  }

  // 3. Inicia o servidor Express
  const app  = createApp();
  const port = config.port;

  const server = app.listen(port, () => {
    logger.info(`API REST disponível em http://localhost:${port}`);
    logger.info(`Ambiente: ${config.env}`);
  });

  // 4. Workers (stubs — serão implementados em etapas futuras)
  logger.warn('Workers não iniciados — serão implementados na próxima etapa:');
  logger.warn('  → SchedulerWorker (agenda backups a cada 1 min)');
  logger.warn('  → BackupWorker    (processa a fila de backups)');
  logger.warn('  → HealthWorker    (health checks a cada 5 min)');
  logger.warn('  → CleanupWorker   (limpeza GFS diária às 4h)');

  // 5. Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Sinal ${signal} recebido. Encerrando servidor...`);
    server.close(async () => {
      await prisma.$disconnect();
      logger.info('Servidor encerrado com sucesso');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception — encerrando');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled rejection — encerrando');
    process.exit(1);
  });
}

bootstrap();
