import { cleanup, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mapFeatureFlagsEnvToState } from '@/config/featureFlags';
import { SettingsTabs } from '@/store/global/initialState';
import { initServerConfigStore, Provider } from '@/store/serverConfig/store';
import { useUserStore } from '@/store/user';

import { SettingsGroupKey, useCategory } from './useCategory';

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

const createWrapper = (showProvider: boolean, extraFlags: Record<string, unknown> = {}) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <Provider
      createStore={() =>
        initServerConfigStore({
          featureFlags: {
            ...mapFeatureFlagsEnvToState({
              provider_settings: true,
            }),
            showProvider,
            ...extraFlags,
          },
        })
      }
    >
      {children}
    </Provider>
  );

  return Wrapper;
};

const getItemKeys = () => {
  const { result } = renderHook(() => useCategory(), {
    wrapper: createWrapper(true),
  });

  return result.current.flatMap((group) => group.items.map((item) => item.key));
};

const initialUserStoreState = useUserStore.getState();

afterEach(() => {
  cleanup();
  useUserStore.setState(initialUserStoreState, true);
});

describe('settings useCategory', () => {
  // S70 groups by capability rather than by audience, and Account leads because the
  // settings in it follow the user everywhere; everything else is filed under what
  // it configures.
  it('leads with the account group', () => {
    const { result } = renderHook(() => useCategory(), {
      wrapper: createWrapper(true),
    });
    const accountGroup = result.current.find((group) => group.key === SettingsGroupKey.Account);

    expect(result.current[0]?.key).toBe(SettingsGroupKey.Account);
    expect(accountGroup?.items.map((item) => item.key)).toEqual([
      SettingsTabs.Profile,
      SettingsTabs.Appearance,
      SettingsTabs.Hotkey,
    ]);
  });

  // The point of the regroup: a capability's settings sit together, wherever they
  // used to live. Messenger is a channel, Stats is usage, Storage/Devices are data.
  it('files each tab under the capability it configures', () => {
    const { result } = renderHook(() => useCategory(), {
      wrapper: createWrapper(true),
    });
    const keysOf = (key: SettingsGroupKey) =>
      result.current.find((group) => group.key === key)?.items.map((item) => item.key);

    expect(keysOf(SettingsGroupKey.Channels)).toContain(SettingsTabs.Messenger);
    expect(keysOf(SettingsGroupKey.Agent)).not.toContain(SettingsTabs.Messenger);

    expect(keysOf(SettingsGroupKey.UsageAndCost)).toContain(SettingsTabs.Stats);
    expect(keysOf(SettingsGroupKey.Data)).toContain(SettingsTabs.Devices);

    // OAuth Apps is Labs-gated (see the test below); with the gate closed the tools
    // group is exactly the three that are always there.
    expect(keysOf(SettingsGroupKey.Tools)).toEqual([
      SettingsTabs.Skill,
      SettingsTabs.Connector,
      SettingsTabs.Labels,
    ]);
  });

  it('keeps Provider visible when provider settings are enabled', () => {
    expect(getItemKeys()).toContain(SettingsTabs.Provider);
  });

  it('hides Provider when provider settings are disabled', () => {
    const { result } = renderHook(() => useCategory(), {
      wrapper: createWrapper(false),
    });

    const keys = result.current.flatMap((group) => group.items.map((item) => item.key));

    expect(keys).not.toContain(SettingsTabs.Provider);
  });

  it('hides OAuth Apps by default', () => {
    expect(getItemKeys()).not.toContain(SettingsTabs.OAuthApps);
  });

  it('shows OAuth Apps in the tools group when the Labs preference is enabled', () => {
    useUserStore.setState({
      preference: {
        ...initialUserStoreState.preference,
        lab: { ...initialUserStoreState.preference.lab, enableOAuthApps: true },
      },
    });

    const { result } = renderHook(() => useCategory(), {
      wrapper: createWrapper(true),
    });
    const toolsGroup = result.current.find((group) => group.key === SettingsGroupKey.Tools);
    const developerGroup = result.current.find((group) => group.key === SettingsGroupKey.Developer);

    expect(toolsGroup?.items.map((item) => item.key)).toContain(SettingsTabs.OAuthApps);
    expect(developerGroup?.items.map((item) => item.key)).not.toContain(SettingsTabs.OAuthApps);
  });

  // Regression: API Key was listed twice — once under `showApiKeyManage` and once
  // under dev mode — so a user who met both gates saw two rows pointing at one page.
  // Both gates now feed a single entry, so no tab may appear in two groups.
  it('lists each settings tab at most once when both API Key gates are open', () => {
    useUserStore.setState({
      settings: { ...initialUserStoreState.settings, general: { isDevMode: true } },
    });

    const { result } = renderHook(() => useCategory(), {
      wrapper: createWrapper(true, { showApiKeyManage: true }),
    });
    const keys = result.current.flatMap((group) => group.items.map((item) => item.key));

    expect(keys).toContain(SettingsTabs.APIKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
