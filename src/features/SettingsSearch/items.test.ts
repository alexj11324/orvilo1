import { describe, expect, it } from 'vitest';

import { LAB_FEATURES } from '@/features/Settings/labs/features';
import { SettingsTabs } from '@/store/global/initialState';

import {
  SETTINGS_SEARCH_ITEMS,
  type SettingsSearchContext,
  TAB_SEARCH_EN_KEYWORDS,
  TAB_SEARCH_KEYWORDS_KEYS,
} from './items';

const webContext: SettingsSearchContext = {
  disableEmailPassword: false,
  enableBusinessFeatures: true,
  enableComposio: true,
  enableGatewayMode: true,
  hasEmail: true,
  hideDocs: false,
  isDesktop: false,
  isLogin: true,
  isWindows: false,
};

describe('settings search index', () => {
  it('derives one search item per lab feature in catalog order', () => {
    const labsItems = SETTINGS_SEARCH_ITEMS.filter((item) => item.tab === SettingsTabs.Labs);

    expect(labsItems.map((item) => item.anchor)).toEqual(
      LAB_FEATURES.map(({ flag }) => `labs-${flag}`),
    );
  });

  it('hides desktop-only lab features from web search results', () => {
    const labsItems = SETTINGS_SEARCH_ITEMS.filter((item) => item.tab === SettingsTabs.Labs);

    for (const feature of LAB_FEATURES) {
      const item = labsItems.find(({ anchor }) => anchor === `labs-${feature.flag}`)!;
      expect(item.visible?.(webContext) ?? true).toBe(!feature.desktopOnly);
    }
  });

  it('indexes the inbox notification channel', () => {
    expect(SETTINGS_SEARCH_ITEMS.some((item) => item.anchor === 'notification-inbox')).toBe(true);
  });

  it('does not index the retired image-generation settings entry', () => {
    // The /image workbench settings were retired; a stale anchor would degrade
    // to a plain tab switch and keep dead locale keys reachable.
    expect(SETTINGS_SEARCH_ITEMS.some((item) => item.anchor === 'service-model-image')).toBe(false);
  });

  it('keeps an English floor for tabs whose locale keywords replace the English terms', () => {
    // Usage is the canonical case named in `items.ts`: its zh-CN keywords are
    // synonyms (`用量,消耗,配额…`) that would otherwise drop `usage` from the index.
    expect(TAB_SEARCH_EN_KEYWORDS[SettingsTabs.Labs]).toContain('experiment');
    expect(TAB_SEARCH_EN_KEYWORDS[SettingsTabs.Usage]).toContain('quota');
    expect(TAB_SEARCH_KEYWORDS_KEYS[SettingsTabs.Labs]).toBe('settingsSearch.tabKeywords.labs');
    expect(TAB_SEARCH_KEYWORDS_KEYS[SettingsTabs.Usage]).toBe('settingsSearch.tabKeywords.usage');
  });

  it('leaves no keyword map for the retired oauth apps tab', () => {
    // The self-built OAuth console is retired; its keywords only ever indexed a
    // destination that now resolves to a not-found.
    expect(TAB_SEARCH_EN_KEYWORDS[SettingsTabs.OAuthApps]).toBeUndefined();
    expect(TAB_SEARCH_KEYWORDS_KEYS[SettingsTabs.OAuthApps]).toBeUndefined();
  });

  it('covers the high-volume zero-result phrases as tab keywords', () => {
    expect(TAB_SEARCH_EN_KEYWORDS[SettingsTabs.Messenger]).toEqual(
      expect.arrayContaining(['telegram', 'slack', 'discord', 'wechat']),
    );
    expect(TAB_SEARCH_EN_KEYWORDS[SettingsTabs.Storage]).toEqual(
      expect.arrayContaining(['knowledge base']),
    );
  });
});
