import { RETIRED_ROUTE_PREFIXES } from '@/config/routes';

import { type TabScope, tabScopeKey } from './scope';
import { type TabItem } from './types';

export const TAB_PAGES_STORAGE_KEY_V1 = 'lobechat:desktop:tab-pages:v1';
export const TAB_PAGES_STORAGE_KEY_V2 = 'lobechat:desktop:tab-pages:v2';
export const TAB_PAGES_STORAGE_KEY_PREFIX = 'lobechat:desktop:tab-pages:v3';

export interface TabPagesStorageData {
  activeTabId: string | null;
  tabs: TabItem[];
}

const EMPTY: TabPagesStorageData = { activeTabId: null, tabs: [] };

export const tabPagesStorageKey = (scope: TabScope): string =>
  `${TAB_PAGES_STORAGE_KEY_PREFIX}:${tabScopeKey(scope)}`;

const isTabItem = (item: unknown): item is TabItem =>
  !!item &&
  typeof item === 'object' &&
  typeof (item as TabItem).id === 'string' &&
  typeof (item as TabItem).url === 'string' &&
  typeof (item as TabItem).lastVisited === 'number';

/**
 * Whether a stored tab points at a product that no longer exists.
 *
 * This list is the only thing between a tab pinned to `/image` before that
 * surface was retired and it being restored onto a path nothing resolves.
 * Workspace URLs mirror the same segments one level deeper (`/{slug}/image`),
 * so the first two segments are checked.
 */
export const isRetiredTabUrl = (url: string): boolean => {
  let pathname: string;
  try {
    pathname = new URL(url, 'http://localhost').pathname;
  } catch {
    return false;
  }

  return pathname
    .split('/')
    .filter(Boolean)
    .slice(0, 2)
    .some((segment) => RETIRED_ROUTE_PREFIXES.has(`/${segment}`));
};

export const getTabPages = (scope: TabScope): TabPagesStorageData => {
  if (typeof window === 'undefined') return EMPTY;

  try {
    const data = window.localStorage.getItem(tabPagesStorageKey(scope));
    if (!data) return EMPTY;

    const parsed = JSON.parse(data);
    if (!parsed || typeof parsed !== 'object') return EMPTY;

    const tabs = Array.isArray(parsed.tabs)
      ? parsed.tabs.filter(isTabItem).filter((tab) => !isRetiredTabUrl(tab.url))
      : [];
    // Dropping the active tab would leave an `activeTabId` naming nothing, so
    // the selection falls back to what is left rather than to a dangling id.
    const requestedActiveId = typeof parsed.activeTabId === 'string' ? parsed.activeTabId : null;
    const activeTabId = tabs.some((tab) => tab.id === requestedActiveId)
      ? requestedActiveId
      : (tabs[0]?.id ?? null);

    return { activeTabId, tabs };
  } catch {
    return EMPTY;
  }
};

export const saveTabPages = (
  scope: TabScope,
  tabs: TabItem[],
  activeTabId: string | null,
): boolean => {
  if (typeof window === 'undefined') return false;

  try {
    window.localStorage.setItem(tabPagesStorageKey(scope), JSON.stringify({ activeTabId, tabs }));
    return true;
  } catch {
    return false;
  }
};
