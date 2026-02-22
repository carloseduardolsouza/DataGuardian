import {
  calculateNextExecution,
  formatNextExecution,
  isJobDue,
} from '../../../../src/core/scheduler/job-scheduler';

describe('job-scheduler', () => {
  it('calculates next execution date', () => {
    const next = calculateNextExecution('*/5 * * * *', 'UTC');
    expect(next).toBeInstanceOf(Date);
    expect(Number.isNaN(next.getTime())).toBe(false);
  });

  it('returns false when next execution is null', () => {
    expect(isJobDue(null)).toBe(false);
  });

  it('returns true when execution date is in the past', () => {
    expect(isJobDue(new Date(Date.now() - 1000))).toBe(true);
  });

  it('formats next execution payload', () => {
    const date = new Date('2026-02-22T12:00:00.000Z');
    const formatted = formatNextExecution(date, 'UTC');

    expect(formatted).toEqual({
      utc: '2026-02-22T12:00:00.000Z',
      local: expect.any(String),
      timezone: 'UTC',
    });
  });
});
