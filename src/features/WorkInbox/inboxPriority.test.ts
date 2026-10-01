import { describe, expect, it } from 'vitest';

import { inboxPriorityScopeKey } from './inboxPriority';

describe('inboxPriorityScopeKey', () => {
  it('scopes the choice to user + workspace so one context never bleeds into another', () => {
    expect(inboxPriorityScopeKey({ userId: 'u1', workspaceId: 'w1' })).toBe('u1:w1');
    expect(inboxPriorityScopeKey({ userId: 'u1', workspaceId: 'w2' })).toBe('u1:w2');
    expect(inboxPriorityScopeKey({ userId: 'u2', workspaceId: 'w1' })).toBe('u2:w1');
  });

  it('falls back for personal mode and anonymous users', () => {
    expect(inboxPriorityScopeKey({ userId: 'u1', workspaceId: null })).toBe('u1:personal');
    expect(inboxPriorityScopeKey({ workspaceId: 'w1' })).toBe('anonymous:w1');
    expect(inboxPriorityScopeKey({ workspaceId: null })).toBe('anonymous:personal');
  });
});
