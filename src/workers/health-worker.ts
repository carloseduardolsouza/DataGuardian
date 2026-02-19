import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { runHealthChecksCycle } from '../core/health/health-checker';
import {
  markWorkerError,
  markWorkerRunning,
  markWorkerStopped,
} from './worker-registry';

let timer: NodeJS.Timeout | null = null;
let running = false;

async function executeCycle() {
  if (running) return;
  running = true;

  try {
    const result = await runHealthChecksCycle();
    logger.info(result, 'Health worker ciclo concluído');
  } catch (err) {
    markWorkerError('health', err);
    logger.error({ err }, 'Erro no ciclo do health worker');
  } finally {
    running = false;
  }
}

export function startHealthWorker() {
  if (timer) return;

  markWorkerRunning('health');
  void executeCycle();

  timer = setInterval(() => {
    void executeCycle();
  }, config.workers.healthCheckIntervalMs);

  logger.info(
    { intervalMs: config.workers.healthCheckIntervalMs },
    'Health worker iniciado',
  );
}

export function stopHealthWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  markWorkerStopped('health');
  logger.info('Health worker finalizado');
}

