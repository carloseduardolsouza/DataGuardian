import { EventEmitter } from 'node:events';

const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    warn: mockLoggerWarn,
    error: mockLoggerError,
  },
}));

import { requestLogger } from '../../../../src/api/middlewares/logger';

describe('request logger middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs warn for 4xx responses', () => {
    const req = {
      method: 'GET',
      url: '/api/test',
      get: () => 'jest-agent',
      ip: '127.0.0.1',
    } as any;

    const res = new EventEmitter() as any;
    res.statusCode = 404;
    const next = jest.fn();

    requestLogger(req, res, next);
    res.emit('finish');

    expect(next).toHaveBeenCalledWith();
    expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it('logs error for 5xx responses', () => {
    const req = {
      method: 'POST',
      url: '/api/test',
      get: () => 'jest-agent',
      ip: '127.0.0.1',
    } as any;

    const res = new EventEmitter() as any;
    res.statusCode = 500;
    const next = jest.fn();

    requestLogger(req, res, next);
    res.emit('finish');

    expect(mockLoggerError).toHaveBeenCalledTimes(1);
  });
});
