import { describe, expect, it } from 'vitest';

import { formatMemberDate } from './memberDate';

describe('formatMemberDate', () => {
  it('renders an em dash for missing or unparseable values', () => {
    expect(formatMemberDate(null)).toBe('—');
    expect(formatMemberDate(undefined)).toBe('—');
    expect(formatMemberDate('not-a-date')).toBe('—');
  });

  it('renders a numeric YYYY/MM/DD day regardless of how old the date is', () => {
    expect(formatMemberDate(new Date(2026, 8, 18))).toBe('2026/09/18');
    expect(formatMemberDate(new Date(2026, 1, 10))).toBe('2026/02/10');
    expect(formatMemberDate(new Date(2024, 11, 1))).toBe('2024/12/01');
  });

  it('accepts local ISO strings', () => {
    expect(formatMemberDate('2026-09-18T10:00:00')).toBe('2026/09/18');
  });
});
