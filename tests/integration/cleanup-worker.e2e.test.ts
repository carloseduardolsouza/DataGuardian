import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWorkersSnapshot } from '../../src/workers/worker-registry';

const runCleanupCycleMock = vi.fn();

vi.mock('../../src/core/retention/cleanup-manager', () => ({
  runCleanupCycle: runCleanupCycleMock,
}));

describe('E2E Cleanup Worker Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
    const { stopCleanupWorker } = await import('../../src/workers/cleanup-worker');
    stopCleanupWorker();
  });

  it('should execute cleanup cycle immediately when worker starts', async () => {
    runCleanupCycleMock.mockResolvedValue({
      processed_jobs: 2,
      deleted_executions: 4,
    });

    const { startCleanupWorker, stopCleanupWorker } = await import('../../src/workers/cleanup-worker');
    startCleanupWorker();
    expect(runCleanupCycleMock).toHaveBeenCalledTimes(1);

    expect(getWorkersSnapshot().cleanup.status).toBe('running');

    stopCleanupWorker();
    expect(getWorkersSnapshot().cleanup.status).toBe('stopped');
  });

  it('should execute cleanup cycle in the scheduled interval', async () => {
    runCleanupCycleMock.mockResolvedValue({
      processed_jobs: 0,
      deleted_executions: 0,
    });

    const { startCleanupWorker, stopCleanupWorker } = await import('../../src/workers/cleanup-worker');
    startCleanupWorker();
    expect(runCleanupCycleMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(runCleanupCycleMock).toHaveBeenCalledTimes(2);

    stopCleanupWorker();
    expect(getWorkersSnapshot().cleanup.status).toBe('stopped');
  });
});
