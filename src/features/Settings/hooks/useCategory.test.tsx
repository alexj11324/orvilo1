import { cleanup, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mapFeatureFlagsEnvToState } from '@/config/featureFlags';
import { SettingsTabs } from '@/store/global/initialState';
import { initServerConfigStore, Provider } from '@/store/serverConfig/store';
import { useUserStore } from '@/store/user';
import { type GlobalServerConfig } from '@/types/serverConfig';

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

const createWrapper = (
  extraFlags: Record<string, unknown> = {},
  serverConfig: Partial<GlobalServerConfig> = {},
) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <Provider
      createStore={() =>
        initServerConfigStore({
          featureFlags: {
            ...mapFeatureFlagsEnvToState({}),
            ...extraFlags,
          },
          serverConfig: { aiProvider: {}, telemetry: {}, ...serverConfig },
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
    wrapper: createWrapper(),
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
      wrapper: createWrapper(),
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
      wrapper: createWrapper(),
    });
    const keysOf = (key: SettingsGroupKey) =>
      result.current.find((group) => group.key === key)?.items.map((item) => item.key);

    expect(keysOf(SettingsGroupKey.Channels)).toContain(SettingsTabs.Messenger);
    expect(keysOf(SettingsGroupKey.Agent)).not.toContain(SettingsTabs.Messenger);

    expect(keysOf(SettingsGroupKey.UsageAndCost)).toContain(SettingsTabs.Stats);
    expect(keysOf(SettingsGroupKey.Data)).toContain(SettingsTabs.Devices);

    // The skill marketplace and the OAuth-app console were both retired, so the
    // tools group is exactly the two tabs that are still live.
    expect(keysOf(SettingsGroupKey.Tools)).toEqual([SettingsTabs.Connector, SettingsTabs.Labels]);
  });

  it('never lists the retired provider or service-model tabs', () => {
    const keys = getItemKeys();

    expect(keys).not.toContain(SettingsTabs.Provider);
    expect(keys).not.toContain(SettingsTabs.ServiceModel);
  });

  it('hides OAuth Apps by default', () => {
    expect(getItemKeys()).not.toContain(SettingsTabs.OAuthApps);
  });

  it('never lists OAuth Apps, even while the retired Labs preference is still set', () => {
    // The console is retired, but `enableOAuthApps` survives in users'
    // persisted preferences. A stored `true` must not resurrect the row.
    useUserStore.setState({
      preference: {
        ...initialUserStoreState.preference,
        lab: { ...initialUserStoreState.preference.lab, enableOAuthApps: true },
      },
    });

    const { result } = renderHook(() => useCategory(), {
      wrapper: createWrapper(),
    });
    const toolsGroup = result.current.find((group) => group.key === SettingsGroupKey.Tools);
    const developerGroup = result.current.find((group) => group.key === SettingsGroupKey.Developer);

    expect(toolsGroup?.items.map((item) => item.key)).not.toContain(SettingsTabs.OAuthApps);
    expect(developerGroup?.items.map((item) => item.key)).not.toContain(SettingsTabs.OAuthApps);
  });

  // The rows come from the settings capability registry now, not from
  // conditions written here. These two cases pin the wiring in both directions:
  // a closed gate is not listed, and the same gate open is.
  it('never lists a tab the capability registry says is not available', () => {
    const keys = getItemKeys();

    for (const tab of [
      SettingsTabs.Plans,
      SettingsTabs.Credits,
      SettingsTabs.Billing,
      SettingsTabs.Usage,
      SettingsTabs.Referral,
      SettingsTabs.OAuthApps,
      SettingsTabs.APIKey,
    ]) {
      expect(keys).not.toContain(tab);
    }
  });

  it('lists the business tabs on a deployment that ships them', () => {
    const { result } = renderHook(() => useCategory(), {
      wrapper: createWrapper({}, { enableBusinessFeatures: true }),
    });
    const keys = result.current.flatMap((group) => group.items.map((item) => item.key));

    expect(keys).toContain(SettingsTabs.Plans);
    expect(keys).toContain(SettingsTabs.Usage);
  });

  // Regression: API Key was listed twice — once under `showApiKeyManage` and once
  // under dev mode — so a user who met both gates saw two rows pointing at one page.
  // Both gates now feed a single entry, so no tab may appear in two groups.
  it('lists each settings tab at most once when both API Key gates are open', () => {
    useUserStore.setState({
      settings: { ...initialUserStoreState.settings, general: { isDevMode: true } },
    });

    const { result } = renderHook(() => useCategory(), {
      wrapper: createWrapper({ showApiKeyManage: true }),
    });
    const keys = result.current.flatMap((group) => group.items.map((item) => item.key));

    expect(keys).toContain(SettingsTabs.APIKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
