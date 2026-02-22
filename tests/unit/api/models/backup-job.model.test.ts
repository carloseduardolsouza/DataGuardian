import { formatJob } from '../../../../src/api/models/backup-job.model';

describe('backup-job model', () => {
  it('formats backup job with fallback storage target', () => {
    const createdAt = new Date('2026-02-21T10:00:00.000Z');
    const updatedAt = new Date('2026-02-22T10:00:00.000Z');
    const nextExecutionAt = new Date('2026-02-23T03:00:00.000Z');

    const payload = formatJob({
      id: 'job-1',
      name: 'Daily backup',
      datasourceId: 'ds-1',
      storageLocationId: 'sl-1',
      scheduleCron: '0 3 * * *',
      scheduleTimezone: 'UTC',
      enabled: true,
      retentionPolicy: { max_backups: 3, auto_delete: true },
      backupOptions: {},
      lastExecutionAt: null,
      nextExecutionAt,
      createdAt,
      updatedAt,
    });

    expect(payload.storage_targets).toEqual([{ storage_location_id: 'sl-1', order: 1 }]);
    expect(payload.storage_strategy).toBe('fallback');
    expect(payload.next_execution_at).toBe('2026-02-23T03:00:00.000Z');
  });

  it('formats backup job with normalized storage targets and latest execution', () => {
    const createdAt = new Date('2026-02-21T10:00:00.000Z');
    const updatedAt = new Date('2026-02-22T10:00:00.000Z');

    const payload = formatJob({
      id: 'job-2',
      name: 'Replicated backup',
      datasourceId: 'ds-1',
      storageLocationId: 'sl-1',
      scheduleCron: '0 3 * * *',
      scheduleTimezone: 'UTC',
      enabled: true,
      retentionPolicy: { max_backups: 3, auto_delete: true },
      backupOptions: {
        storage_strategy: 'replicate',
        storage_targets: [
          { storage_location_id: 'sl-2', order: 2 },
          { storage_location_id: 'sl-1', order: 1 },
          { storage_location_id: '', order: 0 },
        ],
      },
      lastExecutionAt: null,
      nextExecutionAt: null,
      createdAt,
      updatedAt,
      backupExecutions: [
        {
          status: 'completed',
          startedAt: createdAt,
          finishedAt: updatedAt,
          sizeBytes: BigInt(2048),
          durationSeconds: 12,
        },
      ],
    });

    expect(payload.storage_strategy).toBe('replicate');
    expect(payload.storage_targets).toEqual([
      { storage_location_id: 'sl-1', order: 1 },
      { storage_location_id: 'sl-2', order: 2 },
    ]);
    expect(payload.last_execution).toEqual({
      status: 'completed',
      started_at: '2026-02-21T10:00:00.000Z',
      finished_at: '2026-02-22T10:00:00.000Z',
      size_bytes: 2048,
      duration_seconds: 12,
    });
  });
});
