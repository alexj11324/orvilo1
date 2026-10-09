import { describe, expect, it } from 'vitest';

import { advanceIssueDueDate, issueRecurrenceCreationAt, nextIssueRecurrenceDue } from './dates';

describe('issue recurrence calendar', () => {
  it('creates the next issue at00:01 following the due date in the selected timezone across DST', () => {
    expect(issueRecurrenceCreationAt('2026-03-07', 'America/New_York').toISOString()).toBe(
      '2026-03-08T05:01:00.000Z',
    );
    expect(issueRecurrenceCreationAt('2026-03-08', 'America/New_York').toISOString()).toBe(
      '2026-03-09T04:01:00.000Z',
    );
    expect(issueRecurrenceCreationAt('2026-11-01', 'America/New_York').toISOString()).toBe(
      '2026-11-02T05:01:00.000Z',
    );
  });
  it('preserves month-end and leap-year anchors', () => {
    expect(advanceIssueDueDate('2026-01-31', '2026-01-31', 'month', 1)).toBe('2026-02-28');
    expect(advanceIssueDueDate('2026-01-31', '2026-02-28', 'month', 1)).toBe('2026-03-31');
    expect(advanceIssueDueDate('2024-02-29', '2027-02-28', 'year', 1)).toBe('2028-02-29');
  });
  it('coalesces missed dates into one current issue and rejects invalid dates/timezones/intervals', () => {
    expect(
      nextIssueRecurrenceDue({
        firstDueDate: '2020-01-01',
        currentDueDate: '2020-01-01',
        cadence: 'day',
        interval: 1,
        timezone: 'UTC',
        now: new Date('2026-10-06T14:00:00Z'),
      }),
    ).toBe('2026-10-06');
    expect(() => issueRecurrenceCreationAt('2026-02-30', 'UTC')).toThrow('Invalid issue due date');
    expect(() => issueRecurrenceCreationAt('2026-10-06', 'invalid-zone')).toThrow();
    expect(() => advanceIssueDueDate('2026-10-06', '2026-10-06', 'day', 0)).toThrow('positive');
  });
});
