import { cleanup, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useWorkspaceContextStore } from '@/business/client/workspaceContextStore';
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

const { workspaceRole } = vi.hoisted(() => ({ workspaceRole: { value: 'owner' } }));
vi.mock('@/business/client/hooks/useFetchWorkspaces', () => ({
  useFetchWorkspaces: () => ({
    data: [{ id: 'ws-1', role: workspaceRole.value }],
    isLoading: false,
  }),
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

const getItemKeys = () => {
  const { result } = renderHook(() => useCategory(), {
    wrapper: createWrapper(true),
  });

  return result.current.flatMap((group) => group.items.map((item) => item.key));
};

const initialUserStoreState = useUserStore.getState();

afterEach(() => {
  cleanup();
  workspaceRole.value = 'owner';
  useUserStore.setState(initialUserStoreState, true);
  useWorkspaceContextStore.getState().setActiveWorkspace(null);
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
  // used to live. Stats is usage, Storage/Devices are data.
  it('files each tab under the capability it configures', () => {
    const { result } = renderHook(() => useCategory(), {
      wrapper: createWrapper(true),
    });
    const keysOf = (key: SettingsGroupKey) =>
      result.current.find((group) => group.key === key)?.items.map((item) => item.key);

    expect(keysOf(SettingsGroupKey.UsageAndCost)).toContain(SettingsTabs.Stats);
    expect(keysOf(SettingsGroupKey.Data)).toContain(SettingsTabs.Devices);
    expect(keysOf(SettingsGroupKey.Agent)).toContain(SettingsTabs.Orchestrator);

    // The skill marketplace and the OAuth-app console were both retired, so the
    // tools group is exactly the two tabs that are still live.
    expect(keysOf(SettingsGroupKey.Tools)).toEqual([SettingsTabs.Connector]);
  });

  it('keeps Provider visible when provider settings are enabled', () => {
    const keys = getItemKeys();
    expect(keys).toContain(SettingsTabs.Provider);
    expect(keys).toContain(SettingsTabs.ServiceModel);
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
      wrapper: createWrapper(true),
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
      wrapper: createWrapper(true, {}, { enableBusinessFeatures: true }),
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
      wrapper: createWrapper(true, { showApiKeyManage: true }),
    });
    const keys = result.current.flatMap((group) => group.items.map((item) => item.key));

    expect(keys).toContain(SettingsTabs.APIKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // Regression: settings used to be two sidebars. `/:slug/settings/*` had its
  // own navigation that re-listed Profile, Appearance, Hotkey, Notification,
  // Connector, API Key, Advanced and About next to the workspace pages, while
  // Devices, Statistics and Credentials existed once in each. There is one
  // sidebar now: workspace pages are a group in it, and a capability with a
  // workspace page has exactly one row, pointing at that page.
  describe('inside a workspace', () => {
    const renderInWorkspace = (serverConfig: Partial<GlobalServerConfig> = {}) => {
      useWorkspaceContextStore.getState().setActiveWorkspace({ id: 'ws-1', slug: 'acme' });

      return renderHook(() => useCategory(), {
        wrapper: createWrapper(true, {}, serverConfig),
      }).result.current;
    };

    it('adds the workspace pages as one group of the same sidebar', () => {
      const workspace = renderInWorkspace().find(
        (group) => group.key === SettingsGroupKey.Workspace,
      );

      expect(workspace?.items.map((item) => item.href)).toEqual([
        '/acme/settings/general',
        '/acme/settings/members',
        '/acme/settings/integrations',
        '/acme/settings/imports',
      ]);
    });

    it('keeps integrations reachable but withholds admin and billing settings from viewers', () => {
      workspaceRole.value = 'viewer';
      const hrefs = renderInWorkspace({ enableBusinessFeatures: true }).flatMap((group) =>
        group.items.map((item) => item.href),
      );
      expect(hrefs).toContain('/acme/settings/integrations');
      expect(hrefs).not.toContain('/acme/settings/imports');
      expect(hrefs).not.toContain('/acme/settings/budget');
      expect(hrefs).not.toContain('/acme/settings/credits');
    });

    it('lists every capability once and sends the shared ones to the workspace page', () => {
      const items = renderInWorkspace().flatMap((group) => group.items);
      const hrefOf = (tab: SettingsTabs) => items.find((item) => item.key === tab)?.href;

      expect(new Set(items.map((item) => item.key)).size).toBe(items.length);
      expect(hrefOf(SettingsTabs.Devices)).toBe('/acme/settings/devices');
      expect(hrefOf(SettingsTabs.Stats)).toBe('/acme/settings/statistics');
      expect(hrefOf(SettingsTabs.Creds)).toBe('/acme/settings/credential');
      // Account pages stay personal: no workspace URL, so no second copy.
      for (const tab of [
        SettingsTabs.Profile,
        SettingsTabs.Appearance,
        SettingsTabs.Notification,
        SettingsTabs.Connector,
        SettingsTabs.Advanced,
      ]) {
        expect(hrefOf(tab), `${tab} points into the workspace tree`).toBeUndefined();
      }
    });

    it('sends the billing rows to the workspace pages and adds the workspace-only budget', () => {
      const items = renderInWorkspace({ enableBusinessFeatures: true }).flatMap(
        (group) => group.items,
      );

      expect(items.map((item) => item.href)).toEqual(
        expect.arrayContaining([
          '/acme/settings/plans',
          '/acme/settings/usage',
          '/acme/settings/credits',
          '/acme/settings/budget',
          '/acme/settings/billing',
        ]),
      );
    });
  });

  it('shows no workspace group and no workspace URL outside a workspace', () => {
    const { result } = renderHook(() => useCategory(), { wrapper: createWrapper(true) });

    expect(result.current.some((group) => group.key === SettingsGroupKey.Workspace)).toBe(false);
    expect(result.current.flatMap((group) => group.items).every((item) => !item.href)).toBe(true);
  });
});
