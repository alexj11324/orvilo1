import { describe, expect, it } from 'vitest';

import {
  inboxFeedKind,
  inboxPriorityScopeKey,
  inboxScopeKindToken,
  resolveInboxPriority,
} from './inboxPriority';

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

describe('resolveInboxPriority', () => {
  it('shows the banner with priority tabs while the workspace is undecided', () => {
    expect(resolveInboxPriority(undefined)).toEqual({
      bannerVisible: true,
      priorityEnabled: true,
    });
  });

  it('keeps the tabs without the banner after Keep', () => {
    expect(resolveInboxPriority('priority')).toEqual({
      bannerVisible: false,
      priorityEnabled: true,
    });
  });

  it('collapses to the unified list without the banner after Disable', () => {
    expect(resolveInboxPriority('all')).toEqual({
      bannerVisible: false,
      priorityEnabled: false,
    });
  });
});

describe('inboxFeedKind', () => {
  it('queries the tab bucket while priority inbox is enabled', () => {
    expect(inboxFeedKind(true, 'priority')).toBe('priority');
    expect(inboxFeedKind(true, 'other')).toBe('other');
  });

  it('omits the bucket in unified mode so the server returns every row', () => {
    expect(inboxFeedKind(false, 'priority')).toBeUndefined();
    expect(inboxFeedKind(false, 'other')).toBeUndefined();
  });
});

describe('inboxScopeKindToken', () => {
  it('keeps the unified feed identity distinct from either tab bucket', () => {
    expect(inboxScopeKindToken(false, 'priority')).toBe('all');
    expect(inboxScopeKindToken(true, 'priority')).toBe('priority');
    expect(inboxScopeKindToken(true, 'other')).toBe('other');
  });
});
