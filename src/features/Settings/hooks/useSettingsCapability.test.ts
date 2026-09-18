import { cleanup, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mapFeatureFlagsEnvToState } from '@/config/featureFlags';
import {
  isSettingsTabAvailable,
  isSettingsTabOffered,
  resolveSettingsCapability,
} from '@/config/routes/settings';
import { SettingsTabs } from '@/store/global/initialState';
import { initServerConfigStore, Provider } from '@/store/serverConfig/store';
import { useUserStore } from '@/store/user';
import { type GlobalServerConfig } from '@/types/serverConfig';

import { useSettingsCapabilityContext } from './useSettingsCapability';

vi.hoisted(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: vi.fn(() => null),
      removeItem: vi.fn(),
      setItem: vi.fn(),
    },
  });
});

const createWrapper = (
  extraFlags: Record<string, unknown> = {},
  serverConfig: Partial<GlobalServerConfig> = {},
) => {
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(
      Provider,
      {
        createStore: () =>
          initServerConfigStore({
            featureFlags: { ...mapFeatureFlagsEnvToState({}), ...extraFlags },
            serverConfig: { aiProvider: {}, telemetry: {}, ...serverConfig },
          }),
      },
      children,
    );

  return Wrapper;
};

const initialUserStoreState = useUserStore.getState();

afterEach(() => {
  cleanup();
  useUserStore.setState(initialUserStoreState, true);
});

const renderContext = (
  extraFlags: Record<string, unknown> = {},
  serverConfig: Partial<GlobalServerConfig> = {},
) =>
  renderHook(() => useSettingsCapabilityContext(), {
    wrapper: createWrapper(extraFlags, serverConfig),
  });

/**
 * The registry decides; this hook is the only place the stores are read. These
 * tests hold the two together: they cover the decision the settings page
 * renderer makes for a tab it does not recognise or cannot serve — the one that
 * used to be answered by rendering Appearance.
 */
describe('useSettingsCapabilityContext', () => {
  it('reports a deployment without the business pages as not shipping them', () => {
    const { result } = renderContext();

    expect(result.current.enableBusinessFeatures).toBe(false);
    expect(result.current.hideDocs).toBe(false);
    expect(result.current.showApiKeyManage).toBe(false);
  });

  it('reads the deployment flags and the user preferences into one context', () => {
    const { result } = renderContext(
      { hideDocs: true, showApiKeyManage: true },
      { enableBusinessFeatures: true },
    );

    expect(result.current).toMatchObject({
      enableBusinessFeatures: true,
      hideDocs: true,
      showApiKeyManage: true,
    });
  });

  it('never resolves an unrecognised tab to a renderable one', () => {
    // The regression this pins: `/settings/llm` and any typo used to land on
    // Appearance, mounting that page and running its queries on the way here.
    const { result } = renderContext();

    for (const tab of ['llm', 'not-a-tab', '']) {
      expect(resolveSettingsCapability(tab, result.current).status).not.toBe('enabled');
      expect(isSettingsTabAvailable(tab, result.current)).toBe(false);
      expect(isSettingsTabOffered(tab, result.current)).toBe(false);
    }
  });

  it('withholds a withdrawn tab and a tab this deployment does not serve', () => {
    const { result } = renderContext();

    // Retired, with a live equivalent: the renderer redirects instead.
    expect(resolveSettingsCapability(SettingsTabs.Provider, result.current)).toMatchObject({
      redirectTo: SettingsTabs.Profile,
      status: 'retired',
    });
    expect(isSettingsTabAvailable(SettingsTabs.Provider, result.current)).toBe(false);

    // Live, but the deployment has no business pages: not-found, not a blank
    // page and not somebody else's tab.
    expect(resolveSettingsCapability(SettingsTabs.Plans, result.current).status).toBe(
      'unavailable',
    );
    expect(isSettingsTabAvailable(SettingsTabs.Plans, result.current)).toBe(false);
  });

  it('keeps the tab a deployment does serve renderable', () => {
    const { result } = renderContext({}, { enableBusinessFeatures: true });

    expect(isSettingsTabAvailable(SettingsTabs.Plans, result.current)).toBe(true);
    expect(isSettingsTabAvailable(SettingsTabs.Appearance, result.current)).toBe(true);
  });
});
