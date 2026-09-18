import { describe, expect, it } from 'vitest';

import { feedFilterForChip, snoozeUntilIso } from './inboxOrganize';

describe('feedFilterForChip', () => {
  it('omits a filter for the default All chip so Needs-you keeps unresolved cards', () => {
    expect(feedFilterForChip('all')).toBeUndefined();
    expect(feedFilterForChip('unread')).toBe('unread');
    expect(feedFilterForChip('archived')).toBe('archived');
  });
});

describe('snoozeUntilIso', () => {
  it('snoozes presentation only, by a bounded number of hours', () => {
    expect(snoozeUntilIso(new Date('2026-09-18T12:00:00.000Z'), 4)).toBe(
      '2026-09-18T16:00:00.000Z',
    );
  });
});
