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

export const getTabPages = (scope: TabScope): TabPagesStorageData => {
  if (typeof window === 'undefined') return EMPTY;

  try {
    const data = window.localStorage.getItem(tabPagesStorageKey(scope));
    if (!data) return EMPTY;

    const parsed = JSON.parse(data) as Partial<TabPagesStorageData>;
    if (!parsed || typeof parsed !== 'object') return EMPTY;

    const tabs = Array.isArray(parsed.tabs)
      ? parsed.tabs.filter(isTabItem).filter((tab) => !isRetiredProductUrl(tab.url, scope))
      : [];
    const activeTabId =
      typeof parsed.activeTabId === 'string' && tabs.some((tab) => tab.id === parsed.activeTabId)
        ? parsed.activeTabId
        : null;

    return {
      activeTabId,
      tabs,
    };
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
