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

const navigate = vi.fn();

vi.mock('react-router', () => ({
  useNavigate: () => navigate,
}));

const createWrapper = (
  showProvider: boolean,
  extraFlags: Record<string, unknown> = {},
  serverConfig: Partial<GlobalServerConfig> = {},
) => {
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
          serverConfig: { aiProvider: {}, telemetry: {}, ...serverConfig },
        })
      }
    >
      {children}
    </Provider>
  );

  return Wrapper;
};

const initialUserStoreState = useUserStore.getState();

afterEach(() => {
  cleanup();
  navigate.mockReset();
  useUserStore.setState(initialUserStoreState, true);
});

describe('mobile settings useCategory', () => {
  it('keeps Provider visible and routes to the provider list when provider settings are enabled', () => {
    const { result } = renderHook(() => useCategory(), {
      wrapper: createWrapper(true),
    });

    const provider = result.current
      .flatMap((group) => group.items)
      .find((item) => item.key === SettingsTabs.Provider);

    expect(provider).toBeDefined();

    provider?.onClick?.();

    expect(navigate).toHaveBeenCalledWith('/settings/provider/all');
  });

  it('hides Provider when provider settings are disabled', () => {
    const { result } = renderHook(() => useCategory(), {
      wrapper: createWrapper(false),
    });

    const keys = result.current.flatMap((group) => group.items.map((item) => item.key));

    expect(keys).not.toContain(SettingsTabs.Provider);
  });

  it('hides OAuth Apps by default', () => {
    const { result } = renderHook(() => useCategory(), {
      wrapper: createWrapper(true),
    });

    const keys = result.current.flatMap((group) => group.items.map((item) => item.key));

    expect(keys).not.toContain(SettingsTabs.OAuthApps);
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

  // Regression: Stats was bundled inside the `enableBusinessFeatures` gate, so
  // self-hosted/non-business deployments lost their usage-and-cost overview.
  // Stats is the ungated head of the group (same as desktop); only the
  // business-only entries stay behind the flag.
  it('keeps Stats visible without business features while gating plans and billing', () => {
    const { result } = renderHook(() => useCategory(), {
      wrapper: createWrapper(true),
    });

    const usageAndCost = result.current.find(
      (group) => group.key === SettingsGroupKey.UsageAndCost,
    );
    const keys = usageAndCost?.items.map((item) => item.key) ?? [];

    expect(keys).toEqual([SettingsTabs.Stats]);
  });

  it('adds the business entries after Stats when business features are enabled', () => {
    const { result } = renderHook(() => useCategory(), {
      wrapper: createWrapper(true, {}, { enableBusinessFeatures: true }),
    });

    const usageAndCost = result.current.find(
      (group) => group.key === SettingsGroupKey.UsageAndCost,
    );
    const keys = usageAndCost?.items.map((item) => item.key) ?? [];

    expect(keys[0]).toBe(SettingsTabs.Stats);
    expect(keys).toEqual(
      expect.arrayContaining([
        SettingsTabs.Plans,
        SettingsTabs.Usage,
        SettingsTabs.Credits,
        SettingsTabs.Billing,
        SettingsTabs.Referral,
      ]),
    );
  });

  // Regression: API Key was reachable from two gates — `showApiKeyManage` beside
  // Creds, dev mode in the system group — so meeting both showed two rows for one
  // page. They now feed a single entry, so no tab may appear in two groups.
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
