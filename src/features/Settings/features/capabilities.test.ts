import { describe, expect, it } from 'vitest';

import { SETTINGS_CAPABILITIES } from '@/config/routes/settings';
import { SettingsTabs } from '@/store/global/initialState';

import { componentMap } from './componentMap';
import { componentMap as desktopComponentMap } from './componentMap.desktop';

/**
 * The settings capability registry lives in `@orvilo/app-config` so both the
 * router shells and the settings feature can read one source. That package
 * cannot import `SettingsTabs` — the enum is declared in the client store — so
 * the registry spells the tab ids out. These are the tests that keep the two
 * lists from drifting: a tab added to `SettingsTabs` without an adjudication
 * fails here, which is what stops the sidebar and the page renderer answering
 * "is this tab part of the product?" differently again.
 */
describe('settings capability registry coverage', () => {
  it('adjudicates every SettingsTabs member, and nothing else', () => {
    const adjudicated = Object.keys(SETTINGS_CAPABILITIES).sort();
    const declared = Object.values(SettingsTabs).sort();

    expect(adjudicated).toEqual(declared);
  });

  it('gives every enabled tab a component in both runtimes', () => {
    // `SettingsContent` renders whatever the registry calls `enabled`; a tab
    // with no component would be a page the sidebar offers and nothing paints.
    const enabled = Object.entries(SETTINGS_CAPABILITIES)
      .filter(([, capability]) => capability.status === 'enabled')
      .map(([tab]) => tab);

    expect(enabled.length).toBeGreaterThan(0);
    for (const tab of enabled) {
      expect(componentMap, `web componentMap is missing ${tab}`).toHaveProperty(tab);
      expect(desktopComponentMap, `desktop componentMap is missing ${tab}`).toHaveProperty(tab);
    }
  });

  it('never maps a retired tab to a component', () => {
    // `componentMap` is the render surface. A retired tab that is still in it is
    // exactly the "hidden but reachable" shape the product scope forbids.
    for (const [tab, capability] of Object.entries(SETTINGS_CAPABILITIES)) {
      if (capability.status === 'retired') {
        expect(componentMap, `componentMap still renders retired tab ${tab}`).not.toHaveProperty(
          tab,
        );
      }
    }
  });

  it('routes every deprecated alias to a live tab', () => {
    for (const [tab, capability] of Object.entries(SETTINGS_CAPABILITIES)) {
      if (!capability.aliasOf) continue;

      expect(capability.status).toBe('retired');
      expect(
        SETTINGS_CAPABILITIES[capability.aliasOf],
        `${tab} redirects to ${capability.aliasOf}, which is not a live tab`,
      ).toMatchObject({ status: 'enabled' });
    }
  });
});
