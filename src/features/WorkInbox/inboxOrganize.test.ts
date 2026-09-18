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
    expect(inboxBulkFingerprint('archive', 'unread')).toBe('archive:unread');
    expect(inboxBulkFingerprint('mark_read', 'all')).toBe('mark_read:all');
  });
});

describe('inboxUrlOpenMode', () => {
  it('never treats a script URL as in-app navigation', () => {
    expect(inboxUrlOpenMode('javascript:alert(1)')).toBe('reject');
    expect(inboxUrlOpenMode('https://github.com/org/repo')).toBe('external');
    expect(inboxUrlOpenMode('https://evil.example/phish')).toBe('reject');
    expect(inboxUrlOpenMode('/inbox')).toBe('internal');
    expect(inboxUrlOpenMode('//evil.example')).toBe('reject');
  });
});
