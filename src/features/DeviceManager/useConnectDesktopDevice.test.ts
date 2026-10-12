import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useConnectDesktopDevice } from './useConnectDesktopDevice';

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  status: vi.fn(),
  identity: vi.fn(),
  list: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/store/electron', () => ({
  useElectronStore: (select: (s: unknown) => unknown) =>
    select({ useFetchGatewayDeviceInfo: () => ({ mutate: mocks.identity }) }),
}));
vi.mock('@/services/electron/gatewayConnection', () => ({
  gatewayConnectionService: { connect: mocks.connect, getConnectionStatus: mocks.status },
}));
vi.mock('@/services/device', () => ({ deviceService: { listDevices: mocks.list } }));
vi.mock('./const', () => ({ refreshDeviceList: mocks.refresh }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.connect.mockResolvedValue({ success: true });
  mocks.status.mockResolvedValue({ status: 'connected' });
  mocks.identity.mockResolvedValue({ deviceId: 'desktop' });
  mocks.list.mockResolvedValue([{ deviceId: 'desktop', registered: true }]);
});
describe('connect the one user-owned device', () => {
  it('connects and confirms registration without workspace enrollment', async () => {
    const close = vi.fn();
    const { result } = renderHook(() => useConnectDesktopDevice({ onClose: close }));
    await act(async () => result.current.connect());
    expect(mocks.connect).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
  it('keeps the dialog open when registration has not completed', async () => {
    mocks.list.mockResolvedValue([]);
    const close = vi.fn();
    const { result } = renderHook(() => useConnectDesktopDevice({ onClose: close }));
    await act(async () => result.current.connect());
    expect(close).not.toHaveBeenCalled();
    expect(result.current.connecting).toBe(false);
    expect(result.current.error).toBe('devices.connectWizard.desktop.registrationPending');
  });
});
