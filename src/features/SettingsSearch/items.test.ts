import { describe, expect, it } from 'vitest';

import { SettingsTabs } from '@/store/global/initialState';

import {
  SETTINGS_SEARCH_ITEMS,
  TAB_SEARCH_EN_KEYWORDS,
  TAB_SEARCH_KEYWORDS_KEYS,
} from './items';

describe('settings search index', () => {
  it('indexes the inbox notification channel', () => {
    expect(SETTINGS_SEARCH_ITEMS.some((item) => item.anchor === 'notification-inbox')).toBe(true);
  });

  it('indexes personal collaboration visibility under appearance', () => {
    expect(SETTINGS_SEARCH_ITEMS).toContainEqual(
      expect.objectContaining({
        anchor: 'appearance-collaboration-visibility',
        tab: SettingsTabs.Appearance,
      }),
    );
  });

  it('does not index the retired image-generation settings entry', () => {
    // The /image workbench settings were retired; a stale anchor would degrade
    // to a plain tab switch and keep dead locale keys reachable.
    expect(SETTINGS_SEARCH_ITEMS.some((item) => item.anchor === 'service-model-image')).toBe(false);
  });

  it('keeps an English floor for tabs whose locale keywords replace the English terms', () => {
    // Usage is the canonical case named in `items.ts`: its zh-CN keywords are
    // synonyms (`用量,消耗,配额…`) that would otherwise drop `usage` from the index.
    expect(TAB_SEARCH_EN_KEYWORDS[SettingsTabs.Usage]).toContain('quota');
    expect(TAB_SEARCH_KEYWORDS_KEYS[SettingsTabs.Usage]).toBe('settingsSearch.tabKeywords.usage');
  });

  it('leaves no keyword map for the retired oauth apps tab', () => {
    // The self-built OAuth console is retired; its keywords only ever indexed a
    // destination that now resolves to a not-found.
    expect(TAB_SEARCH_EN_KEYWORDS[SettingsTabs.OAuthApps]).toBeUndefined();
    expect(TAB_SEARCH_KEYWORDS_KEYS[SettingsTabs.OAuthApps]).toBeUndefined();
  });

  it('covers the high-volume zero-result phrases as tab keywords', () => {
    expect(TAB_SEARCH_EN_KEYWORDS[SettingsTabs.Provider]).toEqual(
      expect.arrayContaining(['api', 'model provider', 'language model', 'custom provider']),
    );
    expect(TAB_SEARCH_EN_KEYWORDS[SettingsTabs.Messenger]).toEqual(
      expect.arrayContaining(['telegram', 'slack', 'discord', 'wechat']),
    );
    expect(TAB_SEARCH_EN_KEYWORDS[SettingsTabs.ServiceModel]).toEqual(
      expect.arrayContaining(['search', 'prompt rewrite']),
    );
    expect(TAB_SEARCH_EN_KEYWORDS[SettingsTabs.Storage]).toEqual(
      expect.arrayContaining(['knowledge base']),
    );
  });
});
