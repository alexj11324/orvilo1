import type * as OrviloConstModule from '@orvilo/const';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Component, createElement, type ReactNode, Suspense } from 'react';
import { SWRConfig } from 'swr';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { gatewayConnectionService } from '@/services/electron/gatewayConnection';
import { type ElectronStore, useElectronStore } from '@/store/electron';
import { useUserStore } from '@/store/user';
import type { OrviloUser } from '@/types/user';

const environment = vi.hoisted(() => ({ desktop: false }));
vi.mock('@orvilo/const', async (importOriginal) => ({
  ...(await importOriginal<typeof OrviloConstModule>()),
  get isDesktop() {
    return environment.desktop;
  },
}));

afterEach(() => {
  environment.desktop = false;
  vi.restoreAllMocks();
});

/**
 * Regression: on web (non-desktop) these SWR hooks used to call the Electron
 * IPC unconditionally. The fetch always rejected with "electronAPI.invoke not
 * found", which was silent until layouts adopted `SWRConfig { suspense: true }`
 * — then the rejection was thrown during render and the route boundary
 * replaced the whole page with a load-failure screen (/settings/devices,
 * /settings/proxy). The keys must be null off-desktop so no fetch starts.
 */

class Boundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    return this.state.error ? `boundary: ${this.state.error.message}` : this.props.children;
  }
}

const desktopOnlySwrHooks = [
  'useFetchGatewayDeviceInfo',
  'useFetchGatewayStatus',
  'useFetchDesktopHotkeys',
  'useGetProxySettings',
  'useDataSyncConfig',
] as const;

describe('desktop-only SWR hooks under a suspense SWRConfig on web', () => {
  it.each(desktopOnlySwrHooks)('%s neither fetches nor throws', async (hookName) => {
    const rendered: string[] = [];

    renderHook(
      () => {
        const useHook = useElectronStore((s) => s[hookName] as ElectronStore[typeof hookName]);
        useHook();
        rendered.push(hookName);
      },
      {
        wrapper: ({ children }) =>
          createElement(
            SWRConfig,
            { value: { provider: () => new Map(), suspense: true } },
            createElement(Boundary, undefined, createElement(Suspense, undefined, children)),
          ),
      },
    );

    // Before the fix the hook suspended on the doomed IPC fetch, the rejection
    // hit the boundary, and the hook body never (re)rendered to completion.
    await waitFor(() => expect(rendered.length).toBeGreaterThan(0));
  });
});

describe('gateway identity follows the authenticated owner', () => {
  it('skips pre-login identity and replaces cached identity after account changes', async () => {
    environment.desktop = true;
    useUserStore.setState({ user: undefined });
    useElectronStore.setState({ gatewayDeviceInfo: undefined });
    const fetchInfo = vi.spyOn(gatewayConnectionService, 'getDeviceInfo');
    fetchInfo.mockResolvedValue({
      deviceId: 'owner-a-device',
      hostname: 'host',
      platform: 'darwin',
      userId: 'owner-a',
    });
    const { result } = renderHook(() => useElectronStore.getState().useFetchGatewayDeviceInfo(), {
      wrapper: ({ children }) =>
        createElement(
          SWRConfig,
          { value: { provider: () => new Map(), suspense: true } },
          createElement(Suspense, undefined, children),
        ),
    });
    expect(fetchInfo).not.toHaveBeenCalled();
    await act(async () => useUserStore.setState({ user: { id: 'owner-a' } as OrviloUser }));
    await waitFor(() => expect(result.current.data?.deviceId).toBe('owner-a-device'));
    expect(useElectronStore.getState().gatewayDeviceInfo?.deviceId).toBe('owner-a-device');
    let resolveNext!: (info: {
      deviceId: string;
      hostname: string;
      platform: string;
      userId: string;
    }) => void;
    fetchInfo.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveNext = resolve;
        }),
    );
    await act(async () => useUserStore.setState({ user: { id: 'owner-b' } as OrviloUser }));
    await waitFor(() => expect(fetchInfo).toHaveBeenCalledTimes(2));
    expect(useElectronStore.getState().gatewayDeviceInfo).toBeUndefined();
    act(() => useUserStore.setState({ user: undefined }));
    await act(async () =>
      resolveNext({
        deviceId: 'owner-b-device',
        hostname: 'host',
        platform: 'darwin',
        userId: 'owner-b',
      }),
    );
    expect(useElectronStore.getState().gatewayDeviceInfo).toBeUndefined();
  });
});
