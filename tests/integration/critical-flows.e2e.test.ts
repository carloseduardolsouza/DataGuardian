import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { PERMISSIONS } from '../../src/core/auth/permissions';

const authState = {
  permissions: [] as string[],
};

const runBackupJobMock = vi.fn();
const retryExecutionUploadMock = vi.fn();
const restoreBackupExecutionMock = vi.fn();

vi.mock('../../src/core/auth/auth.service', () => ({
  AUTH_COOKIE_NAME: 'dg_session',
  getSessionUserByToken: vi.fn(async () => ({
    id: 'user-e2e',
    username: 'e2e-user',
    full_name: 'E2E User',
    is_owner: true,
    roles: ['admin'],
    permissions: authState.permissions,
    session_expires_at: new Date(Date.now() + 60_000).toISOString(),
  })),
}));

vi.mock('../../src/api/models/backup-job.model', () => ({
  runBackupJob: runBackupJobMock,
}));

vi.mock('../../src/api/models/execution.model', () => ({
  retryExecutionUpload: retryExecutionUploadMock,
}));

vi.mock('../../src/api/models/backups.model', () => ({
  restoreBackupExecution: restoreBackupExecutionMock,
  listBackupDatasources: vi.fn(),
  listBackupsByDatasource: vi.fn(),
}));

describe('E2E Critical API Flows', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const { createApp } = await import('../../src/api/server');
    const app = createApp();
    server = await new Promise<Server>((resolve) => {
      const instance = app.listen(0, () => resolve(instance));
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    authState.permissions = [
      PERMISSIONS.BACKUP_JOBS_RUN,
      PERMISSIONS.EXECUTIONS_CONTROL,
      PERMISSIONS.BACKUPS_RESTORE,
      PERMISSIONS.BACKUPS_RESTORE_VERIFY,
    ];
  });

  it('run manual should enqueue backup immediately', async () => {
    runBackupJobMock.mockResolvedValueOnce({
      execution_id: 'exec-manual-1',
      message: 'Backup enfileirado para execucao imediata',
      status: 'queued',
    });

    const response = await fetch(`${baseUrl}/api/backup-jobs/job-123/run`, {
      method: 'POST',
      headers: { cookie: 'dg_session=e2e' },
    });

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body).toMatchObject({
      execution_id: 'exec-manual-1',
      status: 'queued',
    });
    expect(runBackupJobMock).toHaveBeenCalledTimes(1);
    expect(runBackupJobMock).toHaveBeenCalledWith('job-123');
  });

  it('retry-upload should retry a failed execution upload', async () => {
    retryExecutionUploadMock.mockResolvedValueOnce({
      execution_id: 'exec-failed-7',
      status: 'running',
      message: 'Retry de upload iniciado',
    });

    const response = await fetch(`${baseUrl}/api/executions/exec-failed-7/retry-upload`, {
      method: 'POST',
      headers: { cookie: 'dg_session=e2e' },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      execution_id: 'exec-failed-7',
      status: 'running',
    });
    expect(retryExecutionUploadMock).toHaveBeenCalledTimes(1);
    expect(retryExecutionUploadMock).toHaveBeenCalledWith('exec-failed-7');
  });

  it('restore should require explicit confirmation phrase', async () => {
    const response = await fetch(`${baseUrl}/api/backups/exec-backup-10/restore`, {
      method: 'POST',
      headers: {
        cookie: 'dg_session=e2e',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        drop_existing: true,
        confirmation_phrase: 'ERRADO',
      }),
    });

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toBe('RESTORE_CONFIRMATION_REQUIRED');
    expect(restoreBackupExecutionMock).not.toHaveBeenCalled();
  });

  it('restore verification mode should enforce dedicated permission', async () => {
    authState.permissions = [PERMISSIONS.BACKUPS_RESTORE];

    const response = await fetch(`${baseUrl}/api/backups/exec-backup-11/restore`, {
      method: 'POST',
      headers: {
        cookie: 'dg_session=e2e',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        verification_mode: true,
        keep_verification_database: false,
        confirmation_phrase: 'VERIFICAR RESTORE',
      }),
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe('FORBIDDEN');
    expect(restoreBackupExecutionMock).not.toHaveBeenCalled();
  });

  it('restore verification mode should start when user has permission', async () => {
    restoreBackupExecutionMock.mockResolvedValueOnce({
      message: 'Restore verification iniciado com sucesso',
      execution_id: 'exec-restore-verify-1',
      source_execution_id: 'exec-backup-12',
      datasource_id: 'ds-1',
      datasource_name: 'Main DB',
      datasource_type: 'postgres',
      verification_mode: true,
      status: 'running',
      started_at: new Date().toISOString(),
    });

    const response = await fetch(`${baseUrl}/api/backups/exec-backup-12/restore`, {
      method: 'POST',
      headers: {
        cookie: 'dg_session=e2e',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        storage_location_id: '11111111-1111-4111-8111-111111111111',
        verification_mode: true,
        keep_verification_database: true,
        confirmation_phrase: 'VERIFICAR RESTORE',
      }),
    });

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body).toMatchObject({
      execution_id: 'exec-restore-verify-1',
      verification_mode: true,
      status: 'running',
    });
    expect(restoreBackupExecutionMock).toHaveBeenCalledTimes(1);
    expect(restoreBackupExecutionMock).toHaveBeenCalledWith({
      executionId: 'exec-backup-12',
      storageLocationId: '11111111-1111-4111-8111-111111111111',
      dropExisting: undefined,
      verificationMode: true,
      keepVerificationDatabase: true,
    });
  });
});

