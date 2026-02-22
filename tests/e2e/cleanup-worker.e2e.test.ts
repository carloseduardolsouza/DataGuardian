import { getWorkersSnapshot } from '../../src/workers/worker-registry';

const mockRunCleanupCycle = jest.fn();

jest.mock('../../src/core/retention/cleanup-manager', () => ({
  runCleanupCycle: mockRunCleanupCycle,
}));

describe('E2E Cleanup Worker Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(async () => {
    jest.useRealTimers();
    const { stopCleanupWorker } = await import('../../src/workers/cleanup-worker');
    stopCleanupWorker();
  });

  it('should execute cleanup cycle immediately when worker starts', async () => {
    mockRunCleanupCycle.mockResolvedValue({
      processed_jobs: 2,
      deleted_executions: 4,
    });

    const { startCleanupWorker, stopCleanupWorker } = await import('../../src/workers/cleanup-worker');
    startCleanupWorker();
    expect(mockRunCleanupCycle).toHaveBeenCalledTimes(1);

    expect(getWorkersSnapshot().cleanup.status).toBe('running');

    stopCleanupWorker();
    expect(getWorkersSnapshot().cleanup.status).toBe('stopped');
  });

  it('should execute cleanup cycle in the scheduled interval', async () => {
    mockRunCleanupCycle.mockResolvedValue({
      processed_jobs: 0,
      deleted_executions: 0,
    });

    const { startCleanupWorker, stopCleanupWorker } = await import('../../src/workers/cleanup-worker');
    startCleanupWorker();
    expect(mockRunCleanupCycle).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(mockRunCleanupCycle).toHaveBeenCalledTimes(2);

    stopCleanupWorker();
    expect(getWorkersSnapshot().cleanup.status).toBe('stopped');
  });
});
