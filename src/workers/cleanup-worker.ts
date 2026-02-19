import { logger } from '../utils/logger';
import { runCleanupCycle } from '../core/retention/cleanup-manager';
import { markWorkerError, markWorkerRunning, markWorkerStopped } from './worker-registry';

let timer: NodeJS.Timeout | null = null;
let running = false;

async function executeCleanupCycle() {
  if (running) return;
  running = true;

  try {
    const result = await runCleanupCycle();
    if (result.processed_jobs > 0 || result.deleted_executions > 0) {
      logger.info(result, 'Cleanup worker ciclo concluido');
    }
  } catch (err) {
    markWorkerError('cleanup', err);
    logger.error({ err }, 'Erro no cleanup worker');
  } finally {
    running = false;
  }
}

export function startCleanupWorker() {
  if (timer) return;

  markWorkerRunning('cleanup');
  void executeCleanupCycle();

  timer = setInterval(() => {
    void executeCleanupCycle();
  }, 60 * 60 * 1000);

  logger.info('Cleanup worker inicializado');
}

export function stopCleanupWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  markWorkerStopped('cleanup');
  logger.info('Cleanup worker finalizado');
}

