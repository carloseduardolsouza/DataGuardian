import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { PERMISSIONS } from '../../src/core/auth/permissions';

const authState = {
  permissions: [] as string[],
};

const mockRunBackupJob = jest.fn();
const mockRetryExecutionUpload = jest.fn();
const mockRestoreBackupExecution = jest.fn();

jest.mock('../../src/core/auth/auth.service', () => ({
  AUTH_COOKIE_NAME: 'dg_session',
  getSessionUserByToken: jest.fn(async () => ({
    id: 'user-e2e',
    username: 'e2e-user',
    full_name: 'E2E User',
    is_owner: true,
    roles: ['admin'],
    permissions: authState.permissions,
    session_expires_at: new Date(Date.now() + 60_000).toISOString(),
  })),
}));

jest.mock('../../src/api/models/backup-job.model', () => ({
  runBackupJob: mockRunBackupJob,
}));

jest.mock('../../src/api/models/execution.model', () => ({
  retryExecutionUpload: mockRetryExecutionUpload,
}));

jest.mock('../../src/api/models/backups.model', () => ({
  restoreBackupExecution: mockRestoreBackupExecution,
  listBackupDatasources: jest.fn(),
  listBackupsByDatasource: jest.fn(),
}));

jest.mock('../../src/api/middlewares/audit-trail', () => ({
  auditTrailMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
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
    jest.clearAllMocks();
    authState.permissions = [
      PERMISSIONS.BACKUP_JOBS_RUN,
      PERMISSIONS.EXECUTIONS_CONTROL,
      PERMISSIONS.BACKUPS_RESTORE,
      PERMISSIONS.BACKUPS_RESTORE_VERIFY,
    ];
  });

  it('run manual should start backup immediately', async () => {
    mockRunBackupJob.mockResolvedValueOnce({
      execution_id: 'exec-manual-1',
      message: 'Backup manual iniciado para execucao imediata',
      status: 'running',
    });

    const response = await fetch(`${baseUrl}/api/backup-jobs/job-123/run`, {
      method: 'POST',
      headers: { cookie: 'dg_session=e2e' },
    });

    expect(response.status).toBe(202);
    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({
      execution_id: 'exec-manual-1',
      status: 'running',
    });
    expect(mockRunBackupJob).toHaveBeenCalledTimes(1);
    expect(mockRunBackupJob).toHaveBeenCalledWith('job-123');
  });

  it('retry-upload should retry a failed execution upload', async () => {
    mockRetryExecutionUpload.mockResolvedValueOnce({
      execution_id: 'exec-failed-7',
      status: 'running',
      message: 'Retry de upload iniciado',
    });

    const response = await fetch(`${baseUrl}/api/executions/exec-failed-7/retry-upload`, {
      method: 'POST',
      headers: { cookie: 'dg_session=e2e' },
    });

    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({
      execution_id: 'exec-failed-7',
      status: 'running',
    });
    expect(mockRetryExecutionUpload).toHaveBeenCalledTimes(1);
    expect(mockRetryExecutionUpload).toHaveBeenCalledWith('exec-failed-7');
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
    const body = await response.json() as Record<string, unknown>;
    expect(body.error).toBe('RESTORE_CONFIRMATION_REQUIRED');
    expect(mockRestoreBackupExecution).not.toHaveBeenCalled();
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
    const body = await response.json() as Record<string, unknown>;
    expect(body.error).toBe('FORBIDDEN');
    expect(mockRestoreBackupExecution).not.toHaveBeenCalled();
  });

  it('restore verification mode should start when user has permission', async () => {
    mockRestoreBackupExecution.mockResolvedValueOnce({
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
    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({
      execution_id: 'exec-restore-verify-1',
      verification_mode: true,
      status: 'running',
    });
    expect(mockRestoreBackupExecution).toHaveBeenCalledTimes(1);
    expect(mockRestoreBackupExecution).toHaveBeenCalledWith({
      executionId: 'exec-backup-12',
      storageLocationId: '11111111-1111-4111-8111-111111111111',
      dropExisting: undefined,
      verificationMode: true,
      keepVerificationDatabase: true,
    });
  });
});
