import dayjs from 'dayjs';
import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';

import { compactRelative } from './useActivityTime';

const t = ((key: string, options?: { count: number }) =>
  options ? `${key}:${options.count}` : key) as TFunction<'common'>;

const label = (date: string, now: string) => compactRelative(t)(dayjs(date), dayjs(now));

describe('compactRelative', () => {
  it('labels 28–31-day-old timestamps in weeks, not "0mo ago"', () => {
    expect(label('2026-08-24', '2026-09-21')).toBe('time.compactWeeksAgo:4');
    expect(label('2026-08-28', '2026-09-25')).toBe('time.compactWeeksAgo:4');
    expect(label('2026-09-01', '2026-09-30')).toBe('time.compactWeeksAgo:4');
  });

  it('keeps month and week labels on either side of the boundary', () => {
    expect(label('2026-09-01', '2026-09-22')).toBe('time.compactWeeksAgo:3');
    expect(label('2026-08-01', '2026-09-25')).toBe('time.compactMonthsAgo:1');
  });
});
