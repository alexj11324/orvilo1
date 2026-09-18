import { isRetiredProductUrl } from '../retiredProductUrl';
import { type TabScope, tabScopeKey } from './scope';
import { type TabItem } from './types';

export const TAB_PAGES_STORAGE_KEY_V1 = 'orvilo:desktop:tab-pages:v1';
export const TAB_PAGES_STORAGE_KEY_V2 = 'orvilo:desktop:tab-pages:v2';
export const TAB_PAGES_STORAGE_KEY_PREFIX = 'orvilo:desktop:tab-pages:v3';

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

// Stored tabs pointing at withdrawn surfaces are filtered through
// `isRetiredProductUrl` so the same registry-derived dead list and the same
// workspace-slug handling apply everywhere stored URLs are filtered. It is
// the only thing between a tab pinned to `/image` before retirement and it
// being restored onto a path nothing resolves; retired-but-resolving
// prefixes like `/memory` keep their tabs because the preferences manager
// still lives there.
export const getTabPages = (scope: TabScope): TabPagesStorageData => {
  if (typeof window === 'undefined') return EMPTY;

  try {
    const data = window.localStorage.getItem(tabPagesStorageKey(scope));
    if (!data) return EMPTY;

    const parsed: unknown = JSON.parse(data);
    if (!parsed || typeof parsed !== 'object') return EMPTY;

    const stored = parsed as { activeTabId?: unknown; tabs?: unknown };
    // Typed as `unknown[]` before filtering, not left as the `any` that
    // `Array.isArray` narrows an `any` to: on `any[]`, `.filter(isTabItem)`
    // resolves to `any` rather than `TabItem[]`, and the following `.filter`
    // loses its parameter type entirely. Reading the payload as `unknown` is the
    // boundary this value deserves anyway — it is whatever the last write left.
    const storedTabs: unknown[] = Array.isArray(stored.tabs) ? stored.tabs : [];
    const tabs = storedTabs.filter(isTabItem).filter((tab) => !isRetiredProductUrl(tab.url, scope));
    // Dropping the active tab would leave an `activeTabId` naming nothing, so
    // the selection falls back to what is left rather than to a dangling id.
    const requestedActiveId = typeof stored.activeTabId === 'string' ? stored.activeTabId : null;
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
