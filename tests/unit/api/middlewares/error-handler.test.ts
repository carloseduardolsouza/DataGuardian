import { z } from 'zod';

jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

import { AppError, errorHandler } from '../../../../src/api/middlewares/error-handler';

function createRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('error handler middleware', () => {
  it('handles AppError responses', () => {
    const res = createRes();
    const err = new AppError('FORBIDDEN', 403, 'No access', { required: 'x' });

    errorHandler(err, {} as any, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'FORBIDDEN',
      message: 'No access',
      details: { required: 'x' },
    });
  });

  it('handles ZodError responses', () => {
    const res = createRes();
    let zodErr: unknown;
    try {
      z.object({ page: z.number() }).parse({ page: 'x' });
    } catch (err) {
      zodErr = err;
    }

    errorHandler(zodErr, {} as any, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0][0].error).toBe('VALIDATION_ERROR');
  });

  it('handles unknown errors as internal error', () => {
    const res = createRes();

    errorHandler(new Error('boom'), {} as any, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].error).toBe('INTERNAL_ERROR');
  });
});
