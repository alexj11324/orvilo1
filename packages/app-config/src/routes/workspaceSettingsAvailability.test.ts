import { describe, expect, it } from 'vitest';

import { isWorkspaceSettingsTabAvailable, WORKSPACE_SETTINGS_ALIASES } from './settings';

const open = { enableBusinessFeatures: false };
const business = { enableBusinessFeatures: true };

describe('isWorkspaceSettingsTabAvailable', () => {
  it.each(['plans', 'usage', 'credits', 'budget', 'billing', 'notification'])(
    'hides the business-only %s tab when the flag is off',
    (tab) => {
      expect(isWorkspaceSettingsTabAvailable(tab, open)).toBe(false);
      expect(isWorkspaceSettingsTabAvailable(tab, business)).toBe(true);
    },
  );

  it.each(['general', 'members', 'imports', 'labels', 'statistics', 'devices', 'about'])(
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
