/** @vitest-environment happy-dom */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { confirmModal } from '@/components/Modal';
import { deviceService } from '@/services/device';
import { gatewayConnectionService } from '@/services/electron/gatewayConnection';

import { refreshDeviceList } from './const';
import { useConnectDesktopDevice } from './useConnectDesktopDevice';

const state = vi.hoisted(() => ({
  identity: vi.fn(),
  share: vi.fn(),
  workspace: { id: 'workspace-one', name: 'Workspace One' },
}));
vi.mock('react-i18next', async () => {
  const { createInstance } = await import('i18next');
  const { default: setting } = await import('../../../locales/en-US/setting.json');
  const i18n = createInstance();
  await i18n.init({
    keySeparator: false,
    lng: 'en-US',
    resources: { 'en-US': { translation: setting } },
  });
  return {
    useTranslation: () => ({
      t: (key: string, values?: Record<string, string>) =>
        key === 'devices.share.overwriteConfirmDesc' ? i18n.t(key, values) : key,
    }),
  };
});
vi.mock('@/business/client/hooks/useActiveWorkspace', () => ({
  useActiveWorkspace: () => state.workspace,
}));
vi.mock('@/store/electron', () => ({
  useElectronStore: (selector: (s: unknown) => unknown) =>
    selector({ useFetchGatewayDeviceInfo: () => ({ mutate: state.identity }) }),
}));
vi.mock('@/libs/trpc/client', () => ({
  createWorkspaceLambdaClient: (workspaceId: string) => ({
    device: {
      shareDeviceToWorkspace: { mutate: (input: object) => state.share(workspaceId, input) },
    },
  }),
}));
vi.mock('@/components/Modal', () => ({ confirmModal: vi.fn() }));
vi.mock('./const', () => ({ refreshDeviceList: vi.fn() }));

const personal = { deviceId: 'personal-mac', scope: 'personal', registered: true };

describe('Desktop workspace enrollment', () => {
  beforeEach(() => {
    state.identity.mockResolvedValue({ deviceId: 'personal-mac', hostname: 'My Mac' });
    state.share.mockReset().mockResolvedValue({ success: true });
    vi.spyOn(gatewayConnectionService, 'connect').mockResolvedValue({ success: true });
    vi.spyOn(deviceService, 'listDevices').mockResolvedValue([personal] as Awaited<
      ReturnType<typeof deviceService.listDevices>
    >);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('surfaces a connection failure and does not enroll or close', async () => {
    vi.mocked(gatewayConnectionService.connect).mockResolvedValue({
      success: false,
      error: 'Sign in again',
    });
    const close = vi.fn();
    const { result } = renderHook(() =>
      useConnectDesktopDevice({ scope: 'workspace', visibility: 'public', onClose: close }),
    );
    await act(() => result.current.connect());
    expect(result.current.error).toBe('Sign in again');
    expect(result.current.connecting).toBe(false);
    expect(state.share).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it.each(['private', 'public'] as const)(
    'enrolls the registered personal ID in the active workspace with %s access',
    async (visibility) => {
      const close = vi.fn();
      const { result } = renderHook(() =>
        useConnectDesktopDevice({ scope: 'workspace', visibility, onClose: close }),
      );
      await act(() => result.current.connect());
      expect(state.share).toHaveBeenCalledWith('workspace-one', {
        deviceId: 'personal-mac',
        visibility,
        confirmOverwrite: undefined,
      });
      expect(refreshDeviceList).toHaveBeenCalledOnce();
      expect(close).toHaveBeenCalledOnce();
      expect(result.current.error).toBeUndefined();
    },
  );

  it('does not use a workspace or unregistered ghost ID as the personal source', async () => {
    vi.mocked(deviceService.listDevices).mockResolvedValue([
      { ...personal, registered: false },
      { ...personal, scope: 'workspace', registered: true },
    ] as Awaited<ReturnType<typeof deviceService.listDevices>>);
    const close = vi.fn();
    const { result } = renderHook(() =>
      useConnectDesktopDevice({ scope: 'workspace', onClose: close }),
    );
    await act(() => result.current.connect());
    expect(result.current.error).toBe('devices.connectWizard.desktop.registrationPending');
    expect(state.share).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it('waits for explicit overwrite confirmation without reconnecting the machine', async () => {
    state.share.mockResolvedValueOnce({
      success: false,
      alreadyEnrolled: true,
      visibility: 'private',
    });
    const close = vi.fn();
    const { result } = renderHook(() =>
      useConnectDesktopDevice({ scope: 'workspace', visibility: 'public', onClose: close }),
    );
    await act(() => result.current.connect());
    expect(close).not.toHaveBeenCalled();
    expect(state.share).toHaveBeenCalledOnce();
    const confirmation = vi.mocked(confirmModal).mock.calls[0][0];
    expect(confirmation.content).toContain('already shared with Workspace One');
    expect(confirmation.content).not.toContain('{{');
    await act(async () => {
      await confirmation.onOk?.();
    });
    expect(state.share).toHaveBeenLastCalledWith('workspace-one', {
      deviceId: 'personal-mac',
      visibility: 'public',
      confirmOverwrite: true,
    });
    expect(gatewayConnectionService.connect).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('shows enrollment failure and keeps the wizard open', async () => {
    state.share.mockRejectedValue(new Error('Workspace permission denied'));
    const close = vi.fn();
    const { result } = renderHook(() =>
      useConnectDesktopDevice({ scope: 'workspace', onClose: close }),
    );
    await act(() => result.current.connect());
    expect(result.current.error).toBe('Workspace permission denied');
    expect(result.current.connecting).toBe(false);
    expect(close).not.toHaveBeenCalled();
  });
});
