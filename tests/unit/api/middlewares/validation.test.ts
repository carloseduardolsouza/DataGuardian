import { z } from 'zod';
import { AppError } from '../../../../src/api/middlewares/error-handler';
import { validate } from '../../../../src/api/middlewares/validation';

describe('validation middleware', () => {
  it('parses and replaces request part when valid', () => {
    const middleware = validate(z.object({ page: z.coerce.number().int() }), 'query');
    const req = { query: { page: '2' } } as any;
    const next = jest.fn();

    middleware(req, {} as any, next);

    expect(req.query).toEqual({ page: 2 });
    expect(next).toHaveBeenCalledWith();
  });

  it('calls next with AppError when invalid', () => {
    const middleware = validate(z.object({ page: z.number().int() }), 'query');
    const req = { query: { page: 'bad' } } as any;
    const next = jest.fn();

    middleware(req, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.errorCode).toBe('VALIDATION_ERROR');
    expect(err.statusCode).toBe(422);
  });
});
