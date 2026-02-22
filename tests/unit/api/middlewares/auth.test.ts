const mockGetSessionUserByToken = jest.fn();

jest.mock('../../../../src/core/auth/auth.service', () => ({
  AUTH_COOKIE_NAME: 'dg_session',
  getSessionUserByToken: mockGetSessionUserByToken,
}));

import { AppError } from '../../../../src/api/middlewares/error-handler';
import { requireAnyPermission, requireAuth, requirePermission } from '../../../../src/api/middlewares/auth';

describe('auth middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requireAuth stores user and permissions in locals', async () => {
    mockGetSessionUserByToken.mockResolvedValueOnce({
      username: 'admin',
      permissions: ['backup_jobs.run'],
    });

    const req = { cookies: { dg_session: 'token' } } as any;
    const res = { locals: {} } as any;
    const next = jest.fn();

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.locals.authUser.username).toBe('admin');
    expect(res.locals.authPermissions.has('backup_jobs.run')).toBe(true);
  });

  it('requireAuth calls next with AppError when session is missing', async () => {
    mockGetSessionUserByToken.mockResolvedValueOnce(null);

    const req = { cookies: {} } as any;
    const res = { locals: {} } as any;
    const next = jest.fn();

    await requireAuth(req, res, next);

    const err = next.mock.calls[0][0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.errorCode).toBe('UNAUTHORIZED');
  });

  it('requirePermission allows user with required permission', () => {
    const middleware = requirePermission('system.write');
    const next = jest.fn();
    middleware(
      {} as any,
      { locals: { authUser: { username: 'admin' }, authPermissions: new Set(['system.write']) } } as any,
      next,
    );
    expect(next).toHaveBeenCalledWith();
  });

  it('requireAnyPermission denies user without any required permission', () => {
    const middleware = requireAnyPermission(['a', 'b']);
    const next = jest.fn();
    middleware(
      {} as any,
      { locals: { authUser: { username: 'viewer' }, authPermissions: new Set(['c']) } } as any,
      next,
    );
    const err = next.mock.calls[0][0] as AppError;
    expect(err.errorCode).toBe('FORBIDDEN');
  });
});
