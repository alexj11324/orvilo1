import { describe, expect, it } from 'vitest';

import { compactInboxTime } from '@/utils/compactRelativeTime';

const NOW = new Date('2026-09-25T12:00:00Z').getTime();

describe('compactInboxTime', () => {
  it('prints minutes under an hour', () => {
    expect(compactInboxTime('2026-09-25T11:36:00Z', NOW)).toBe('24m');
    expect(compactInboxTime('2026-09-25T12:00:00Z', NOW)).toBe('1m');
  });

  it('prints hours under a day', () => {
    expect(compactInboxTime('2026-09-25T08:00:00Z', NOW)).toBe('4h');
    expect(compactInboxTime('2026-09-24T23:00:00Z', NOW)).toBe('13h');
  });

  it('prints days under a week', () => {
    expect(compactInboxTime('2026-09-24T12:00:00Z', NOW)).toBe('1d');
    expect(compactInboxTime('2026-09-21T12:00:00Z', NOW)).toBe('4d');
  });

  it('prints weeks at a week and beyond', () => {
    expect(compactInboxTime('2026-09-18T12:00:00Z', NOW)).toBe('1w');
    expect(compactInboxTime('2026-08-07T12:00:00Z', NOW)).toBe('7w');
  });
});
