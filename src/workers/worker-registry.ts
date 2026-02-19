export type WorkerRuntimeStatus = 'running' | 'stopped' | 'error';

export interface WorkerState {
  status: WorkerRuntimeStatus;
  lastStartedAt: Date | null;
  lastFinishedAt: Date | null;
  lastError: string | null;
}

export type WorkerName = 'backup' | 'scheduler' | 'health' | 'cleanup';

const WORKER_NAMES: WorkerName[] = ['backup', 'scheduler', 'health', 'cleanup'];

const initialState = (): WorkerState => ({
  status: 'stopped',
  lastStartedAt: null,
  lastFinishedAt: null,
  lastError: null,
});

const workerState = new Map<WorkerName, WorkerState>(
  WORKER_NAMES.map((name) => [name, initialState()]),
);

export function markWorkerRunning(name: WorkerName) {
  const current = workerState.get(name) ?? initialState();
  workerState.set(name, {
    ...current,
    status: 'running',
    lastStartedAt: new Date(),
    lastError: null,
  });
}

export function markWorkerStopped(name: WorkerName) {
  const current = workerState.get(name) ?? initialState();
  workerState.set(name, {
    ...current,
    status: 'stopped',
    lastFinishedAt: new Date(),
  });
}

export function markWorkerError(name: WorkerName, error: unknown) {
  const current = workerState.get(name) ?? initialState();
  workerState.set(name, {
    ...current,
    status: 'error',
    lastFinishedAt: new Date(),
    lastError: error instanceof Error ? error.message : String(error),
  });
}

export function getWorkersSnapshot() {
  const snapshot: Record<WorkerName, WorkerState> = {
    backup: initialState(),
    scheduler: initialState(),
    health: initialState(),
    cleanup: initialState(),
  };

  for (const name of WORKER_NAMES) {
    snapshot[name] = workerState.get(name) ?? initialState();
  }

  return snapshot;
}
