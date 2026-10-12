import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import DeviceGateway from './DeviceGateway';

const state = vi.hoisted(() => ({
  devices: [] as unknown[],
  gatewayConnectionStatus: 'connected',
  workspaceSlug: 'acme' as string | undefined,
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@orvilo/electron-client-ipc', () => ({ useWatchBroadcast: vi.fn() }));
vi.mock('@/business/client/hooks/useActiveWorkspaceSlug', () => ({
  useActiveWorkspaceSlug: () => state.workspaceSlug,
}));
vi.mock('@/features/DeviceManager/useDeviceList', () => ({
  useDeviceList: () => ({ data: state.devices, error: undefined, isLoading: false }),
}));
vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => vi.fn(),
}));
vi.mock('@/store/electron/selectors', () => ({
  electronSyncSelectors: { isSyncActive: () => true },
}));
vi.mock('@/store/electron', () => ({
  useElectronStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      connectGateway: vi.fn(),
      disconnectGateway: vi.fn(),
      gatewayConnectionStatus: state.gatewayConnectionStatus,
      gatewayDeviceInfo: { deviceId: 'device-1' },
      setGatewayConnectionStatus: vi.fn(),
      setGatewayLocalState: vi.fn(),
      useFetchGatewayDeviceInfo: vi.fn(),
      useFetchGatewayStatus: vi.fn(),
    }),
}));

const dot = () => screen.queryByTestId('device-gateway-connected');

describe('DeviceGateway', () => {
  beforeEach(() => {
    state.devices = [];
    state.gatewayConnectionStatus = 'connected';
    state.workspaceSlug = 'acme';
  });

  it('marks this device as connected in a workspace that lists no shared device', () => {
    render(<DeviceGateway />);

    expect(dot()).toBeInTheDocument();
  });

  it('says so in the popover, next to the workspace device status', () => {
    render(<DeviceGateway />);
    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText('gateway.statusConnected')).toBeInTheDocument();
    expect(screen.getByText('gateway.workspaceStatusDisconnected')).toBeInTheDocument();
  });

  it('shows no dot while this device is disconnected', () => {
    state.gatewayConnectionStatus = 'disconnected';
    render(<DeviceGateway />);

    expect(dot()).not.toBeInTheDocument();
  });
});
