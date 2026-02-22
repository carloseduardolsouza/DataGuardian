import { AppError } from '../../../../src/api/middlewares/error-handler';
import { parseCron, validateCron } from '../../../../src/core/scheduler/cron-parser';

describe('cron-parser', () => {
  it('accepts valid cron expression', () => {
    expect(() => validateCron('0 3 * * *')).not.toThrow();
  });

  it('throws AppError for invalid cron expression', () => {
    try {
      validateCron('invalid-cron');
      throw new Error('expected error was not thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).errorCode).toBe('INVALID_CRON');
      expect((error as AppError).statusCode).toBe(422);
    }
  });

  it('parseCron returns original value when valid', () => {
    expect(parseCron('0 */6 * * *')).toBe('0 */6 * * *');
  });
});
