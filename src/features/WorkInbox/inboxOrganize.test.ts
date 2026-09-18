import { describe, expect, it } from 'vitest';

import { feedFilterForChip, inboxBulkFingerprint } from './inboxOrganize';

describe('feedFilterForChip', () => {
  it('omits a filter for the default All chip so Needs-you keeps unresolved cards', () => {
    expect(feedFilterForChip('all')).toBeUndefined();
    expect(feedFilterForChip('unread')).toBe('unread');
    expect(feedFilterForChip('archived')).toBe('archived');
  });
});

describe('inboxBulkFingerprint', () => {
  it('binds the snapshot to the visible chip so archive-all cannot widen later', () => {
    expect(inboxBulkFingerprint('archive', 'unread')).toBe('archive:unread');
    expect(inboxBulkFingerprint('mark_read', 'all')).toBe('mark_read:all');
  });
});
