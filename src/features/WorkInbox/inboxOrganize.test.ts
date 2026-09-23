import { parseNotificationBulkFingerprint } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import {
  feedFilterForChip,
  inboxBulkFingerprint,
  inboxOpenTarget,
  inboxUrlOpenMode,
} from './inboxOrganize';

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

describe('inboxBulkFingerprint in unified mode', () => {
  it('drops the bucket segment when the priority tabs are disabled', () => {
    expect(inboxBulkFingerprint('archive', 'all')).toBe('archive:all');
    expect(inboxBulkFingerprint('mark_read', 'unread')).toBe('mark_read:unread');
    expect(parseNotificationBulkFingerprint('archive', 'archive:all')).toEqual({
      filter: undefined,
    });
  });
});

describe('inboxOpenTarget', () => {
  const base: { availableActions: Array<'archive' | 'open' | 'snooze'> } = {
    availableActions: ['archive', 'open', 'snooze'],
  };

  it('returns null when the card never offered open', () => {
    expect(
      inboxOpenTarget({
        availableActions: ['archive', 'snooze'],
        safeNavigation: { kind: 'task', taskId: 't1' },
      }),
    ).toBeNull();
  });

  it('returns null when there is no navigation target at all', () => {
    expect(inboxOpenTarget({ ...base, safeNavigation: null })).toBeNull();
    expect(inboxOpenTarget({ ...base, safeNavigation: undefined })).toBeNull();
  });

  it('keeps task targets on the task surface', () => {
    expect(inboxOpenTarget({ ...base, safeNavigation: { kind: 'task', taskId: 't1' } })).toEqual({
      kind: 'task',
      taskId: 't1',
    });
    expect(inboxOpenTarget({ ...base, safeNavigation: { kind: 'task' } })).toBeNull();
  });

  it('routes project targets to the project page', () => {
    expect(
      inboxOpenTarget({ ...base, safeNavigation: { kind: 'project', projectId: 'p1' } }),
    ).toEqual({ kind: 'navigate', to: '/project/p1' });
  });

  it('classifies url targets through the same allowlist as rows', () => {
    expect(inboxOpenTarget({ ...base, safeNavigation: { kind: 'url', url: '/task/t1' } })).toEqual({
      kind: 'navigate',
      to: '/task/t1',
    });
    expect(
      inboxOpenTarget({
        ...base,
        safeNavigation: { kind: 'url', url: 'https://github.com/org/repo' },
      }),
    ).toEqual({ kind: 'external', url: 'https://github.com/org/repo' });
    expect(
      inboxOpenTarget({
        ...base,
        safeNavigation: { kind: 'url', url: 'https://evil.example/phish' },
      }),
    ).toBeNull();
    expect(
      inboxOpenTarget({
        ...base,
        safeNavigation: { kind: 'url', url: 'javascript:alert(1)' },
      }),
    ).toBeNull();
  });

  it('never renders a dead Open button for self/other unrouted kinds', () => {
    expect(inboxOpenTarget({ ...base, safeNavigation: { kind: 'inbox' } })).toBeNull();
    expect(inboxOpenTarget({ ...base, safeNavigation: { kind: 'team', teamId: 't1' } })).toBeNull();
    expect(
      inboxOpenTarget({ ...base, safeNavigation: { kind: 'savedView', savedViewId: 'v1' } }),
    ).toBeNull();
  });
});
