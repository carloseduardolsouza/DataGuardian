import { formatExecution } from '../../../../src/api/models/execution.model';

describe('execution model', () => {
  it('formats backup execution payload', () => {
    const startedAt = new Date('2026-02-22T10:00:00.000Z');
    const finishedAt = new Date('2026-02-22T10:02:00.000Z');
    const createdAt = new Date('2026-02-22T09:59:00.000Z');

    const payload = formatExecution({
      id: 'exec-1',
      jobId: 'job-1',
      datasourceId: 'ds-1',
      storageLocationId: 'sl-1',
      status: 'completed',
      startedAt,
      finishedAt,
      durationSeconds: 120,
      sizeBytes: BigInt(500),
      compressedSizeBytes: BigInt(300),
      backupPath: '/tmp/backup.sql.gz',
      backupType: 'full',
      filesCount: 1,
      errorMessage: null,
      metadata: {},
      createdAt,
      job: { name: 'Daily', scheduleCron: '0 3 * * *' },
      datasource: { name: 'Main DB', type: 'postgres' },
      storageLocation: { name: 'Local', type: 'local' },
    });

    expect(payload.operation).toBe('backup');
    expect(payload.backup_type).toBe('full');
    expect(payload.size_bytes).toBe(500);
    expect(payload.storage_location?.name).toBe('Local');
  });

  it('forces backup_type to restore when metadata.operation is restore', () => {
    const payload = formatExecution({
      id: 'exec-2',
      jobId: 'job-1',
      datasourceId: 'ds-1',
      storageLocationId: 'sl-1',
      status: 'completed',
      startedAt: null,
      finishedAt: null,
      durationSeconds: null,
      sizeBytes: null,
      compressedSizeBytes: null,
      backupPath: null,
      backupType: 'incremental',
      filesCount: null,
      errorMessage: null,
      metadata: { operation: 'restore' },
      createdAt: new Date('2026-02-22T09:59:00.000Z'),
    });

    expect(payload.operation).toBe('restore');
    expect(payload.backup_type).toBe('restore');
  });
});
