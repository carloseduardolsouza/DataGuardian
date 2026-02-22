import {
  getWorkersSnapshot,
  markWorkerError,
  markWorkerRunning,
  markWorkerStopped,
} from '../../../src/workers/worker-registry';

describe('worker registry', () => {
  it('marks running and stopped states', () => {
    markWorkerRunning('backup');
    let snapshot = getWorkersSnapshot();
    expect(snapshot.backup.status).toBe('running');
    expect(snapshot.backup.lastStartedAt).toBeInstanceOf(Date);

    markWorkerStopped('backup');
    snapshot = getWorkersSnapshot();
    expect(snapshot.backup.status).toBe('stopped');
    expect(snapshot.backup.lastFinishedAt).toBeInstanceOf(Date);
  });

  it('stores worker error message', () => {
    markWorkerError('restore', new Error('queue down'));
    const snapshot = getWorkersSnapshot();
    expect(snapshot.restore.status).toBe('error');
    expect(snapshot.restore.lastError).toBe('queue down');
  });
});
