import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { PERMISSIONS } from '../../src/core/auth/permissions';

const authState = {
  permissions: [] as string[],
  roles: ['admin'] as string[],
  isOwner: true,
};

const mockRestoreBackupExecution = jest.fn();

jest.mock('../../src/core/auth/auth.service', () => ({
  AUTH_COOKIE_NAME: 'dg_session',
  verifyUserPassword: jest.fn(async () => true),
  verifyAnyAdminPassword: jest.fn(async () => 'admin-e2e'),
  getSessionUserByToken: jest.fn(async () => ({
    id: 'user-e2e',
    username: 'e2e-user',
    full_name: 'E2E User',
    is_owner: authState.isOwner,
    roles: authState.roles,
    permissions: authState.permissions,
    session_expires_at: new Date(Date.now() + 60_000).toISOString(),
  })),
}));

jest.mock('../../src/api/models/backups.model', () => ({
  restoreBackupExecution: mockRestoreBackupExecution,
  listBackupDatasources: jest.fn(),
  listBackupsByDatasource: jest.fn(),
  listRestoreTargetDatasources: jest.fn(),
  prepareBackupExecutionDownload: jest.fn(),
  importAndRestoreBackupFile: jest.fn(),
}));

jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    backupExecution: {
      findUnique: jest.fn(async () => ({ datasourceId: '11111111-1111-4111-8111-111111111111' })),
    },
    datasource: {
      findUnique: jest.fn(async () => ({ tags: ['production'] })),
    },
  },
}));

jest.mock('../../src/api/middlewares/audit-trail', () => ({
  auditTrailMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

describe('E2E Restore Production Approval', () => {
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
    mockRestoreBackupExecution.mockResolvedValue({
      execution_id: '33333333-3333-4333-8333-333333333333',
      status: 'queued',
    });
    authState.permissions = [
      PERMISSIONS.ACCESS_MANAGE,
      PERMISSIONS.BACKUPS_RESTORE,
      PERMISSIONS.BACKUPS_RESTORE_VERIFY,
    ];
    authState.roles = ['admin'];
    authState.isOwner = true;
  });

  it('allows admin restore on production target with only confirmation phrase', async () => {
    const response = await fetch(`${baseUrl}/api/backups/22222222-2222-4222-8222-222222222222/restore`, {
      method: 'POST',
      headers: {
        cookie: 'dg_session=e2e',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        target_datasource_id: '11111111-1111-4111-8111-111111111111',
        confirmation_phrase: 'RESTAURAR',
      }),
    });

    expect(response.status).toBe(202);
    const body = await response.json() as Record<string, unknown>;
    expect(body.execution_id).toBe('33333333-3333-4333-8333-333333333333');
    expect(mockRestoreBackupExecution).toHaveBeenCalledTimes(1);
  });

  it('requires critical authorization for non-admin when no approval or admin password is provided', async () => {
    authState.permissions = [PERMISSIONS.BACKUPS_RESTORE];
    authState.roles = ['operator'];
    authState.isOwner = false;

    const response = await fetch(`${baseUrl}/api/backups/22222222-2222-4222-8222-222222222222/restore`, {
      method: 'POST',
      headers: {
        cookie: 'dg_session=e2e',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        target_datasource_id: '11111111-1111-4111-8111-111111111111',
        confirmation_phrase: 'RESTAURAR',
      }),
    });

    expect(response.status).toBe(428);
    const body = await response.json() as Record<string, unknown>;
    expect(body.error).toBe('CRITICAL_OPERATION_APPROVAL_REQUIRED');
    expect(mockRestoreBackupExecution).not.toHaveBeenCalled();
  });

  it('allows non-admin restore when admin password is provided', async () => {
    authState.permissions = [PERMISSIONS.BACKUPS_RESTORE];
    authState.roles = ['operator'];
    authState.isOwner = false;

    const response = await fetch(`${baseUrl}/api/backups/22222222-2222-4222-8222-222222222222/restore`, {
      method: 'POST',
      headers: {
        cookie: 'dg_session=e2e',
        'content-type': 'application/json',
        'x-admin-password': 'admin-secret',
      },
      body: JSON.stringify({
        target_datasource_id: '11111111-1111-4111-8111-111111111111',
        confirmation_phrase: 'RESTAURAR',
      }),
    });

    expect(response.status).toBe(202);
    const body = await response.json() as Record<string, unknown>;
    expect(body.execution_id).toBe('33333333-3333-4333-8333-333333333333');
    expect(mockRestoreBackupExecution).toHaveBeenCalledTimes(1);
  });
});
