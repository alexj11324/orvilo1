import { describe, expect, it } from 'vitest';

import { reviewRelativeTime } from './reviewRelativeTime';

describe('reviewRelativeTime', () => {
  const now = Date.parse('2026-09-25T12:00:00Z');

  it('uses compact age units for a populated PR queue', () => {
    expect(reviewRelativeTime('2026-09-25T11:04:00Z', now)).toBe('56m');
    expect(reviewRelativeTime('2026-09-14T12:00:00Z', now)).toBe('11d');
    expect(reviewRelativeTime('2026-08-28T12:00:00Z', now)).toBe('4w');
  });
});
