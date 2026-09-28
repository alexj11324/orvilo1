import { describe, expect, it } from 'vitest';

import { formatMemberDate } from './memberDate';

const NOW = new Date('2026-09-23T12:00:00.000Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

const recent = (value: Date | string) =>
  new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const aged = (value: Date | string) =>
  new Date(value).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

describe('formatMemberDate', () => {
  it('renders an em dash for missing or unparseable values', () => {
    expect(formatMemberDate(null, NOW)).toBe('—');
    expect(formatMemberDate(undefined, NOW)).toBe('—');
    expect(formatMemberDate('not-a-date', NOW)).toBe('—');
  });

  it('renders `MMM d` for dates inside the recent window (reference "Sep 18")', () => {
    const value = '2026-09-18T00:00:00.000Z'; // 5 days before NOW
    expect(formatMemberDate(value, NOW)).toBe(recent(value));
    expect(formatMemberDate(value, NOW)).not.toContain('2026');
  });

  it('renders `MMM yyyy` once a date ages out (reference "Feb 2026")', () => {
    const value = '2026-02-10T00:00:00.000Z'; // ~225 days before NOW
    expect(formatMemberDate(value, NOW)).toBe(aged(value));
    expect(formatMemberDate(value, NOW)).toContain('2026');
  });

  it('crosses over between the observed 100-day and 176-day samples', () => {
    const jun15 = '2026-06-15T00:00:00.000Z'; // ~100 days → still recent
    const mar01 = '2026-03-01T00:00:00.000Z'; // ~206 days → aged
    expect(formatMemberDate(jun15, NOW)).toBe(recent(jun15));
    expect(formatMemberDate(mar01, NOW)).toBe(aged(mar01));
  });

  it('treats future dates as recent', () => {
    const future = '2026-10-01T00:00:00.000Z';
    expect(formatMemberDate(future, NOW)).toBe(recent(future));
  });

  it('accepts Date instances as well as ISO strings', () => {
    const value = new Date(NOW - 10 * DAY);
    expect(formatMemberDate(value, NOW)).toBe(recent(value));
  });
});
