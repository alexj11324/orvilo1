import { parseNotificationBulkFingerprint } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import { feedFilterForChip, inboxBulkFingerprint, inboxUrlOpenMode } from './inboxOrganize';

describe('feedFilterForChip', () => {
  it('omits a filter for the default All chip so Needs-you keeps unresolved cards', () => {
    expect(feedFilterForChip('all')).toBeUndefined();
    expect(feedFilterForChip('unread')).toBe('unread');
    expect(feedFilterForChip('archived')).toBe('archived');
  });
});

describe('inboxBulkFingerprint', () => {
  it('binds the snapshot to the visible chip so archive-all cannot widen later', () => {
    expect(inboxBulkFingerprint('archive', 'unread', 'update')).toBe('archive:unread:update');
    expect(inboxBulkFingerprint('mark_read', 'all', 'priority')).toBe('mark_read:all:priority');
    expect(inboxBulkFingerprint('mark_read', 'all', 'action')).toBe('mark_read:all:action');
    expect(parseNotificationBulkFingerprint('archive', 'archive:mentions:update')).toEqual({
      filter: 'mentions',
      kind: 'update',
    });
    expect(parseNotificationBulkFingerprint('archive', 'archive:all:priority')).toEqual({
      filter: undefined,
      kind: 'priority',
    });
    expect(parseNotificationBulkFingerprint('archive', 'archive:all')).toEqual({
      filter: undefined,
    });
    expect(parseNotificationBulkFingerprint('mark_read', 'archive:all')).toBeUndefined();
  });
});

describe('inboxUrlOpenMode', () => {
  it('never treats a script URL as in-app navigation', () => {
    expect(inboxUrlOpenMode('javascript:alert(1)')).toBe('reject');
    expect(inboxUrlOpenMode('https://github.com/org/repo')).toBe('external');
    expect(inboxUrlOpenMode('https://evil.example/phish')).toBe('reject');
    expect(inboxUrlOpenMode('/inbox')).toBe('internal');
    expect(inboxUrlOpenMode('//evil.example')).toBe('reject');
    expect(inboxUrlOpenMode('/inbox\u0000/escape')).toBe('reject');
    expect(inboxUrlOpenMode('/inbox\\x')).toBe('reject');
    expect(inboxUrlOpenMode('https://user:pass@github.com/org/repo')).toBe('reject');
  });
});
