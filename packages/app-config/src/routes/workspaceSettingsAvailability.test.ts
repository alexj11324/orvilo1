import { describe, expect, it } from 'vitest';

import { isWorkspaceSettingsTabAvailable, WORKSPACE_SETTINGS_ALIASES } from './settings';

const open = { enableBusinessFeatures: false };
const business = { enableBusinessFeatures: true };

describe('isWorkspaceSettingsTabAvailable', () => {
  it.each(['plans', 'usage', 'credits', 'budget', 'billing'])(
    'hides the business-only %s tab when the flag is off',
    (tab) => {
      expect(isWorkspaceSettingsTabAvailable(tab, open)).toBe(false);
      expect(isWorkspaceSettingsTabAvailable(tab, business)).toBe(true);
    },
  );

  it.each(['general', 'members', 'imports', 'statistics', 'devices', 'credential'])(
    'keeps the %s tab available without business features',
    (tab) => {
      expect(isWorkspaceSettingsTabAvailable(tab, open)).toBe(true);
    },
  );
});

describe('retired workspace provider and model tabs', () => {
  it('redirect to the personal pages instead of a workspace copy', () => {
    const byAlias = new Map(WORKSPACE_SETTINGS_ALIASES.map((entry) => [entry.alias, entry.target]));

    expect(byAlias.get('provider')).toBe('/settings/provider');
    expect(byAlias.get('service-model')).toBe('/settings/service-model');
  });
});

describe('retired workspace mirrors of account pages', () => {
  // These pages follow the person. The workspace tree used to mount the same
  // personal component under a second sidebar; now the old URL lands on the
  // one page that owns it.
  it.each([
    'profile',
    'appearance',
    'hotkey',
    'notification',
    'connector',
    'apikey',
    'advanced',
    'about',
  ])('redirects %s to the personal page of the same name', (tab) => {
    const byAlias = new Map(WORKSPACE_SETTINGS_ALIASES.map((entry) => [entry.alias, entry.target]));

    expect(byAlias.get(tab)).toBe(`/settings/${tab}`);
  });

  it('keeps notification channel deep links', () => {
    expect(
      WORKSPACE_SETTINGS_ALIASES.find((entry) => entry.alias === 'notification')?.subPaths,
    ).toBe(true);
  });
});
