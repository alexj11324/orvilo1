import { describe, expect, it } from 'vitest';

import {
  getSettingsCapability,
  isSettingsTabAvailable,
  isSettingsTabOffered,
  resolveSettingsCapability,
  SETTINGS_CAPABILITIES,
  type SettingsCapabilityContext,
  WORKSPACE_SETTINGS_ALIASES,
} from './settings';

const BASE_CONTEXT: SettingsCapabilityContext = {
  enableBusinessFeatures: true,
  enableOAuthApps: true,
  hideDocs: false,
  isDesktop: true,
  isDevMode: true,
  mobile: false,
  showApiKeyManage: true,
};

const context = (
  overrides: Partial<SettingsCapabilityContext> = {},
): SettingsCapabilityContext => ({
  ...BASE_CONTEXT,
  ...overrides,
});

/** Every combination of the flags a capability may depend on. */
const contextMatrix = (): SettingsCapabilityContext[] => {
  const flags = [
    'enableBusinessFeatures',
    'enableOAuthApps',
    'hideDocs',
    'isDesktop',
    'isDevMode',
    'mobile',
    'showApiKeyManage',
  ] as const;

  return Array.from({ length: 2 ** flags.length }, (_, index) =>
    flags.reduce<SettingsCapabilityContext>(
      (acc, flag, bit) => ({ ...acc, [flag]: Boolean(index & (1 << bit)) }),
      { ...BASE_CONTEXT },
    ),
  );
};

describe('SETTINGS_CAPABILITIES', () => {
  it('classifies every entry with one of the three capability statuses', () => {
    for (const capability of Object.values(SETTINGS_CAPABILITIES)) {
      expect(['enabled', 'retired', 'task-scoped']).toContain(capability.status);
    }
  });

  it('never gates a withdrawn tab', () => {
    // A rank of `retired` is a product decision, not a deployment one. Hanging a
    // gate on it would make retirement depend on which deployment is asking.
    for (const capability of Object.values(SETTINGS_CAPABILITIES)) {
      if (capability.status === 'retired') {
        expect(capability.gate).toBeUndefined();
        expect(capability.offered).toBeUndefined();
      }
    }
  });

  it('keeps every offered tab renderable in every deployment and platform', () => {
    // The invariant the registry exists for: a row the navigation offers must
    // open a page. `offered` may be narrower than `gate`, never wider.
    for (const ctx of contextMatrix()) {
      for (const tab of Object.keys(SETTINGS_CAPABILITIES)) {
        if (!isSettingsTabOffered(tab, ctx)) continue;

        expect(
          isSettingsTabAvailable(tab, ctx),
          `${tab} is offered in navigation but would not render`,
        ).toBe(true);
      }
    }
  });

  it('never offers or renders a withdrawn tab, in any context', () => {
    for (const ctx of contextMatrix()) {
      for (const [tab, capability] of Object.entries(SETTINGS_CAPABILITIES)) {
        if (capability.status !== 'retired') continue;

        expect(isSettingsTabOffered(tab, ctx)).toBe(false);
        expect(isSettingsTabAvailable(tab, ctx)).toBe(false);
      }
    }
  });

  it('resolves unknown ids as unknown rather than as a neighbour tab', () => {
    // The bug this replaces: an unrecognised `:tab` used to render Appearance.
    for (const tab of ['', 'nonsense', 'appearance ', 'APPEARANCE']) {
      expect(resolveSettingsCapability(tab, BASE_CONTEXT)).toEqual({ status: 'unknown' });
      expect(getSettingsCapability(tab)).toBeUndefined();
    }
  });
});

describe('resolveSettingsCapability', () => {
  it('redirects a withdrawn tab that has a live equivalent', () => {
    expect(resolveSettingsCapability('provider', BASE_CONTEXT)).toEqual({
      redirectTo: 'profile',
      status: 'retired',
    });
  });

  it('answers not-found for a withdrawn tab with no live equivalent', () => {
    // `llm` used to silently render Appearance; it must now be a dead end.
    expect(resolveSettingsCapability('llm', BASE_CONTEXT)).toEqual({ status: 'retired' });
  });

  it('reports a closed gate as unavailable, not as retired', () => {
    // Business pages are not withdrawn — they exist on the deployments that
    // ship them, so the resolution has to keep the two answers apart.
    const ctx = context({ enableBusinessFeatures: false });

    expect(resolveSettingsCapability('plans', ctx)).toEqual({ status: 'unavailable' });
    expect(getSettingsCapability('plans')?.status).toBe('enabled');
    expect(isSettingsTabAvailable('plans', ctx)).toBe(false);
    expect(isSettingsTabAvailable('plans', BASE_CONTEXT)).toBe(true);
  });

  it('closes the Electron-only tabs outside Electron and the hotkeys on mobile', () => {
    const web = context({ isDesktop: false });

    expect(isSettingsTabAvailable('proxy', web)).toBe(false);
    expect(isSettingsTabAvailable('system-tools', web)).toBe(false);
    expect(isSettingsTabAvailable('proxy', BASE_CONTEXT)).toBe(true);

    const mobile = context({ mobile: true });

    expect(isSettingsTabAvailable('hotkey', mobile)).toBe(false);
    expect(isSettingsTabAvailable('hotkey', BASE_CONTEXT)).toBe(true);
  });

  it('keeps a page reachable while withholding its navigation row', () => {
    // `offered` narrower than `gate`: the API-key page is still what the
    // command palette and the error-recovery links open.
    const ctx = context({ isDevMode: false, showApiKeyManage: false });

    expect(isSettingsTabOffered('apikey', ctx)).toBe(false);
    expect(isSettingsTabAvailable('apikey', ctx)).toBe(true);
  });

  it('answers every kind of id with exactly one of the five statuses', () => {
    // This is the table the page renderer switches on: only `enabled` renders a
    // component, `retired` with a `redirectTo` moves, everything else is a
    // not-found. In particular there is no "unrecognised, so show the first
    // tab" arm — that fallback is what used to answer `/settings/llm` with
    // Appearance.
    const openDeployment = context();

    expect(resolveSettingsCapability('appearance', openDeployment)).toEqual({ status: 'enabled' });
    expect(resolveSettingsCapability('provider', openDeployment)).toEqual({
      redirectTo: 'profile',
      status: 'retired',
    });
    expect(resolveSettingsCapability('llm', openDeployment)).toEqual({ status: 'retired' });
    expect(resolveSettingsCapability('plans', context({ enableBusinessFeatures: false }))).toEqual({
      status: 'unavailable',
    });
    expect(resolveSettingsCapability('nonsense', openDeployment)).toEqual({ status: 'unknown' });
  });

  it('holds the not-found answer for every non-enabled status', () => {
    const openDeployment = context();
    const closedDeployment = context({ enableBusinessFeatures: false });

    // `isSettingsTabAvailable` is the predicate the renderer calls before
    // mounting anything, so "false" has to mean "do not run this page".
    expect(isSettingsTabAvailable('appearance', openDeployment)).toBe(true);
    expect(isSettingsTabAvailable('provider', openDeployment)).toBe(false);
    expect(isSettingsTabAvailable('llm', openDeployment)).toBe(false);
    expect(isSettingsTabAvailable('plans', closedDeployment)).toBe(false);
    expect(isSettingsTabAvailable('nonsense', openDeployment)).toBe(false);
  });
});

describe('WORKSPACE_SETTINGS_ALIASES', () => {
  it('never aliases a segment onto itself', () => {
    for (const { alias, target } of WORKSPACE_SETTINGS_ALIASES) {
      expect(target).not.toBe(alias);
    }
  });

  it('keeps one entry per legacy segment', () => {
    const aliases = WORKSPACE_SETTINGS_ALIASES.map((entry) => entry.alias);

    expect(new Set(aliases).size).toBe(aliases.length);
    expect(aliases).toContain('provider');
    expect(aliases).toContain('service-model');
  });
});
