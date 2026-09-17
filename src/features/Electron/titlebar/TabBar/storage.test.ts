import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getTabPages,
  isRetiredTabUrl,
  saveTabPages,
  TAB_PAGES_STORAGE_KEY_V1,
  TAB_PAGES_STORAGE_KEY_V2,
  tabPagesStorageKey,
} from './storage';

const personalScope = { type: 'personal' } as const;
const acmeScope = { slug: 'acme', type: 'workspace' } as const;

describe('TabBar storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('returns empty scoped data when nothing is stored', () => {
    expect(getTabPages(personalScope)).toEqual({ activeTabId: null, tabs: [] });
    expect(getTabPages(acmeScope)).toEqual({ activeTabId: null, tabs: [] });
  });

  it('round-trips personal and workspace tab buckets independently', () => {
    saveTabPages(
      personalScope,
      [{ id: 'personal-tab', lastVisited: 1, url: '/agent/abc' }],
      'personal-tab',
    );
    saveTabPages(
      acmeScope,
      [{ id: 'workspace-tab', lastVisited: 2, url: '/acme/agent/abc' }],
      'workspace-tab',
    );

    expect(getTabPages(personalScope)).toEqual({
      activeTabId: 'personal-tab',
      tabs: [{ id: 'personal-tab', lastVisited: 1, url: '/agent/abc' }],
    });
    expect(getTabPages(acmeScope)).toEqual({
      activeTabId: 'workspace-tab',
      tabs: [{ id: 'workspace-tab', lastVisited: 2, url: '/acme/agent/abc' }],
    });
  });

  it('does not read legacy global tab storage keys', () => {
    window.localStorage.setItem(
      TAB_PAGES_STORAGE_KEY_V1,
      JSON.stringify({
        activeTabId: 'agent:abc',
        tabs: [{ id: 'agent:abc', lastVisited: 1, params: { agentId: 'abc' }, type: 'agent' }],
      }),
    );
    window.localStorage.setItem(
      TAB_PAGES_STORAGE_KEY_V2,
      JSON.stringify({
        activeTabId: '/agent/abc',
        tabs: [{ id: '/agent/abc', lastVisited: 1, url: '/agent/abc' }],
      }),
    );

    expect(getTabPages(personalScope)).toEqual({ activeTabId: null, tabs: [] });
  });

  it('stores workspace buckets under their own key', () => {
    saveTabPages(
      acmeScope,
      [{ id: 'workspace-tab', lastVisited: 1, url: '/acme' }],
      'workspace-tab',
    );

    expect(window.localStorage.getItem(tabPagesStorageKey(personalScope))).toBeNull();
    expect(window.localStorage.getItem(tabPagesStorageKey(acmeScope))).toContain('workspace-tab');
  });

  describe('restoring a tab pinned to a retired product', () => {
    it('drops it and moves the selection onto a tab that still resolves', () => {
      saveTabPages(
        personalScope,
        [
          { id: 'image-tab', lastVisited: 2, url: '/image' },
          { id: 'tasks-tab', lastVisited: 1, url: '/tasks' },
        ],
        'image-tab',
      );

      expect(getTabPages(personalScope)).toEqual({
        activeTabId: 'tasks-tab',
        tabs: [{ id: 'tasks-tab', lastVisited: 1, url: '/tasks' }],
      });
    });

    it('drops it under a workspace too, where the same segment sits one level deeper', () => {
      saveTabPages(
        acmeScope,
        [
          { id: 'memory-tab', lastVisited: 2, url: '/acme/memory' },
          { id: 'tasks-tab', lastVisited: 1, url: '/acme/tasks' },
        ],
        'tasks-tab',
      );

      expect(getTabPages(acmeScope).tabs.map((tab) => tab.id)).toEqual(['tasks-tab']);
    });

    it('reports no selection when every stored tab was retired', () => {
      saveTabPages(
        acmeScope,
        [{ id: 'video-tab', lastVisited: 1, url: '/acme/video' }],
        'video-tab',
      );

      expect(getTabPages(acmeScope)).toEqual({ activeTabId: null, tabs: [] });
    });

    it('matches a path segment, never a word that merely starts the same', () => {
      // `/resource/images` is a resource-library category, not the retired
      // generation workbench; a raw `startsWith` would drop the tab.
      expect(isRetiredTabUrl('/images')).toBe(false);
      expect(isRetiredTabUrl('/resource/images')).toBe(false);
      expect(isRetiredTabUrl('/resource/videos')).toBe(false);
      expect(isRetiredTabUrl('/tasks')).toBe(false);
    });

    it('reads the path out of an absolute tab URL', () => {
      expect(isRetiredTabUrl('https://app.example.com/image/123')).toBe(true);
      expect(isRetiredTabUrl('https://app.example.com/acme/page/doc-1')).toBe(true);
    });
  });
});
