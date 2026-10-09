import { describe, expect, it } from 'vitest';

import { issueDueDatePreset, issueReminderPreset, parseIssueMenuDate } from './issueMenuDates';

describe('issue menu dates', () => {
  it('matches the captured Tuesday due-date choices', () => {
    const now = new Date(2026, 9, 6, 12);
    expect(issueDueDatePreset('tomorrow', now)).toBe('2026-10-07');
    expect(issueDueDatePreset('weekEnd', now)).toBe('2026-10-09');
    expect(issueDueDatePreset('week', now)).toBe('2026-10-13');
  });
  it('chooses the next Friday on a weekend', () => {
    expect(issueDueDatePreset('weekEnd', new Date(2026, 9, 10))).toBe('2026-10-16');
  });
  it('resolves the advertised search phrases and rejects invalid dates/times', () => {
    const now = new Date(2026, 9, 6, 12);
    expect(parseIssueMenuDate('24h', now)).toEqual(new Date(2026, 9, 7, 12));
    expect(parseIssueMenuDate('7 days', now)).toEqual(new Date(2026, 9, 13, 12));
    expect(parseIssueMenuDate('Feb 9', now)).toEqual(new Date(2027, 1, 9, 9));
    expect(parseIssueMenuDate('4 pm', now)).toEqual(new Date(2026, 9, 6, 16));
    expect(parseIssueMenuDate('in 5 weeks', now)).toEqual(new Date(2026, 10, 10, 12));
    expect(parseIssueMenuDate('2026-02-31', now)).toBeUndefined();
    expect(parseIssueMenuDate('9999-99-99', now)).toBeUndefined();
    expect(parseIssueMenuDate('Feb 29', now)).toEqual(new Date(2028, 1, 29, 9));
    expect(parseIssueMenuDate('Octopus 9', now)).toBeUndefined();
    expect(parseIssueMenuDate('25:00', now)).toBeUndefined();
    expect(parseIssueMenuDate('0 hours', now)).toBeUndefined();
  });

  it('uses a real calendar month and future reminder times', () => {
    const now = new Date(2026, 0, 31, 23);
    expect(issueReminderPreset('hour', now).getTime()).toBe(now.getTime() + 3_600_000);
    expect(issueReminderPreset('month', now)).toEqual(new Date(2026, 1, 28, 9));
    expect(issueReminderPreset('tomorrow', now)).toEqual(new Date(2026, 1, 1, 9));
  });
});
