import { describe, expect, it } from 'vitest';

import { formatProjectDate, formatProjectDay, parseTypedProjectDay } from './projectPlanningDate';

describe('formatProjectDate', () => {
  it('formats every precision numerically', () => {
    expect(formatProjectDate('2026-08-15', 'day')).toBe('2026/08/15');
    expect(formatProjectDate('2026-08-15', 'month')).toBe('2026/08');
    expect(formatProjectDate('2026-08-15', 'quarter')).toBe('2026 Q3');
    expect(formatProjectDate('2026-08-15', 'halfYear')).toBe('2026 H2');
    expect(formatProjectDate('2026-01-02', 'halfYear')).toBe('2026 H1');
    expect(formatProjectDate('2026-08-15', 'year')).toBe('2026');
  });

  it('returns an empty string for missing or invalid input', () => {
    expect(formatProjectDate(null)).toBe('');
    expect(formatProjectDate('nope')).toBe('');
  });
});

describe('formatProjectDay', () => {
  it('uses YYYY/MM/DD', () => {
    expect(formatProjectDay('2026-09-01')).toBe('2026/09/01');
    expect(formatProjectDay(undefined)).toBe('');
  });
});

describe('parseTypedProjectDay', () => {
  it('accepts slash, dash and unpadded forms', () => {
    for (const input of ['2026/09/21', '2026-09-21', '2026/9/21', ' 2026/09/21 ']) {
      expect(parseTypedProjectDay(input)?.format('YYYY-MM-DD')).toBe('2026-09-21');
    }
    expect(parseTypedProjectDay('2026/9/1')?.format('YYYY-MM-DD')).toBe('2026-09-01');
  });

  it('rejects malformed and calendar-invalid input', () => {
    for (const input of [
      '',
      '2026',
      '2026/13/01',
      '2026/02/31',
      '21/09/2026',
      'Sep 21',
      '2026/09',
    ]) {
      expect(parseTypedProjectDay(input)).toBeNull();
    }
  });
});
