import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { logger } from '../../utils/logger';
import { config } from '../../utils/config';

type PoolTaskKind = 'file_sha256';

interface PoolTaskPayloadMap {
  file_sha256: { filePath: string };
}

interface PoolTaskResultMap {
  file_sha256: { hash: string };
}

interface PendingTask<TKind extends PoolTaskKind> {
  taskId: number;
  kind: TKind;
  payload: PoolTaskPayloadMap[TKind];
  resolve: (value: PoolTaskResultMap[TKind]) => void;
  reject: (reason: unknown) => void;
}

interface PoolWorkerState {
  worker: Worker;
  busy: boolean;
  currentTaskId: number | null;
}

export interface ThreadPoolStats {
  enabled: boolean;
  size: number;
  busy: number;
  queued: number;
  processed: number;
  failed: number;
}

function createWorkerScript() {
  return `
    const { parentPort } = require('node:worker_threads');
    const { createHash } = require('node:crypto');
    const { createReadStream } = require('node:fs');

    if (!parentPort) {
      process.exit(1);
    }

    async function fileSha256(filePath) {
      const hash = createHash('sha256');
      const stream = createReadStream(filePath);
      for await (const chunk of stream) {
        hash.update(chunk);
      }
      return hash.digest('hex');
    }

    parentPort.on('message', async (message) => {
      const { taskId, kind, payload } = message || {};
      try {
        if (kind === 'file_sha256') {
          const hash = await fileSha256(String(payload.filePath));
          parentPort.postMessage({ taskId, ok: true, result: { hash } });
          return;
        }
        throw new Error('Task de thread pool nao suportada: ' + String(kind));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        parentPort.postMessage({ taskId, ok: false, error: msg });
      }
    });
  `;
}

async function hashFileSha256InMainThread(filePath: string) {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}

class ThreadPoolManager {
  private readonly size: number;

  private readonly enabled: boolean;

  private started = false;

  private shuttingDown = false;

  private readonly workers: PoolWorkerState[] = [];

  private readonly inflight = new Map<number, PendingTask<PoolTaskKind>>();

  private readonly queue: PendingTask<PoolTaskKind>[] = [];

  private nextTaskId = 1;

  private processed = 0;

  private failed = 0;

  constructor(size: number) {
    this.size = Math.max(0, Math.floor(size));
    this.enabled = this.size > 0;
  }

  private ensureStarted() {
    if (!this.enabled || this.started || this.shuttingDown) return;
    this.started = true;

    for (let i = 0; i < this.size; i += 1) {
      this.spawnWorker();
    }

    logger.info(
      { size: this.size },
      'Thread pool de performance inicializado',
    );
  }

  private spawnWorker() {
    const worker = new Worker(createWorkerScript(), { eval: true });
    const state: PoolWorkerState = {
      worker,
      busy: false,
      currentTaskId: null,
    };
    this.workers.push(state);

    worker.on('message', (message: unknown) => {
      this.handleWorkerMessage(state, message);
    });

    worker.on('error', (err) => {
      logger.error({ err }, 'Erro em worker thread de performance');
      this.handleWorkerFailure(state, err);
    });

    worker.on('exit', (code) => {
      const isExpected = this.shuttingDown || code === 0;
      if (!isExpected) {
        logger.warn({ code }, 'Worker thread finalizado inesperadamente');
      }
      this.handleWorkerExit(state);
    });
  }

  private handleWorkerMessage(workerState: PoolWorkerState, message: unknown) {
    const payload = (message ?? {}) as {
      taskId?: number;
      ok?: boolean;
      result?: unknown;
      error?: string;
    };
    const taskId = Number(payload.taskId ?? 0);
    if (!taskId) return;

    const pending = this.inflight.get(taskId);
    if (!pending) return;

    this.inflight.delete(taskId);
    workerState.busy = false;
    workerState.currentTaskId = null;

    if (payload.ok) {
      this.processed += 1;
      pending.resolve(payload.result as PoolTaskResultMap[typeof pending.kind]);
    } else {
      this.failed += 1;
      pending.reject(new Error(payload.error ?? 'Falha desconhecida em worker thread'));
    }

    this.dispatch();
  }

  private handleWorkerFailure(workerState: PoolWorkerState, err: unknown) {
    if (workerState.currentTaskId) {
      const pending = this.inflight.get(workerState.currentTaskId);
      if (pending) {
        this.inflight.delete(workerState.currentTaskId);
        this.failed += 1;
        pending.reject(err);
      }
      workerState.currentTaskId = null;
    }
    workerState.busy = false;
  }

  private handleWorkerExit(workerState: PoolWorkerState) {
    const idx = this.workers.indexOf(workerState);
    if (idx >= 0) {
      this.workers.splice(idx, 1);
    }

    if (!this.shuttingDown && this.enabled) {
      this.spawnWorker();
    }

    this.dispatch();
  }

  private dispatch() {
    if (!this.enabled || this.shuttingDown) return;

    for (const worker of this.workers) {
      if (worker.busy) continue;
      const task = this.queue.shift();
      if (!task) break;

      worker.busy = true;
      worker.currentTaskId = task.taskId;
      this.inflight.set(task.taskId, task);
      worker.worker.postMessage({
        taskId: task.taskId,
        kind: task.kind,
        payload: task.payload,
      });
    }
  }

  async runTask(
    kind: 'file_sha256',
    payload: PoolTaskPayloadMap['file_sha256'],
    fallback: () => Promise<PoolTaskResultMap['file_sha256']>,
  ): Promise<PoolTaskResultMap['file_sha256']> {
    if (!this.enabled) {
      return fallback();
    }

    this.ensureStarted();

    return new Promise<PoolTaskResultMap['file_sha256']>((resolve, reject) => {
      const taskId = this.nextTaskId++;
      const task: PendingTask<'file_sha256'> = {
        taskId,
        kind,
        payload,
        resolve,
        reject,
      };
      this.queue.push(task);
      this.dispatch();
    }).catch(async (err) => {
      logger.warn(
        { err, kind },
        'Thread pool falhou; executando fallback em thread principal',
      );
      return fallback();
    });
  }

  async hashFileSha256(filePath: string) {
    const result = await this.runTask(
      'file_sha256',
      { filePath },
      async () => ({ hash: await hashFileSha256InMainThread(filePath) }),
    );
    return result.hash;
  }

  getStats(): ThreadPoolStats {
    const busy = this.workers.filter((w) => w.busy).length;
    return {
      enabled: this.enabled,
      size: this.size,
      busy,
      queued: this.queue.length,
      processed: this.processed,
      failed: this.failed,
    };
  }

  async shutdown() {
    this.shuttingDown = true;

    const queued = this.queue.splice(0, this.queue.length);
    for (const task of queued) {
      task.reject(new Error('Thread pool finalizando'));
    }

    const workers = [...this.workers];
    this.workers.splice(0, this.workers.length);
    await Promise.all(workers.map((w) => w.worker.terminate()));
  }
}

const threadPoolManager = new ThreadPoolManager(config.workers.threadPoolSize);

export function getThreadPoolStats() {
  return threadPoolManager.getStats();
}

export async function hashFileSha256(filePath: string) {
  return threadPoolManager.hashFileSha256(filePath);
}

export async function shutdownThreadPool() {
  await threadPoolManager.shutdown();
}
