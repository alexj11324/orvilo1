/** @vitest-environment happy-dom */
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ModalHost } from '@/components/Modal';
import type { CliReleaseInfo } from '@/services/cliRelease';
import { gatewayConnectionService } from '@/services/electron/gatewayConnection';

import DeviceConnectModal from './DeviceConnectModal';

const query = vi.hoisted(() => ({
  data: undefined as CliReleaseInfo | null | undefined,
  error: undefined as Error | undefined,
  isLoading: false,
  mutate: vi.fn(),
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/platform', () => ({ getHostContext: () => ({ kind: 'desktop' }) }));
vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => 'workspace-one',
}));
vi.mock('@/business/client/hooks/useActiveWorkspace', () => ({ useActiveWorkspace: () => null }));
vi.mock('@/store/electron', () => ({
  useElectronStore: (selector: (s: unknown) => unknown) =>
    selector({
      gatewayConnectionStatus: 'disconnected',
      useFetchGatewayDeviceInfo: () => ({}),
      useFetchGatewayStatus: () => ({}),
    }),
}));
vi.mock('@/libs/swr', () => ({ useClientDataSWR: () => query }));
vi.mock('@/components/NeuralNetworkLoading', () => ({
  default: () => <div role="status">Loading</div>,
}));

const renderGuide = () =>
  render(
    <>
      <ModalHost />
      <DeviceConnectModal open initialTab="cli" scope="workspace" onClose={vi.fn()} />
    </>,
  );

describe('Device CLI installation guide', () => {
  beforeEach(() => {
    query.data = undefined;
    query.error = undefined;
    query.isLoading = false;
    query.mutate.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it('keeps connection failures visible after Escape while connecting', async () => {
    let finish!: (result: { success: boolean; error: string }) => void;
    vi.spyOn(gatewayConnectionService, 'connect').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const close = vi.fn();
    const view = render(
      <>
        <ModalHost />
        <DeviceConnectModal open scope="personal" onClose={close} />
      </>,
    );
    fireEvent.click(
      view.getByRole('button', { name: 'devices.connectWizard.desktop.connectThisComputer' }),
    );
    await waitFor(() => expect(view.queryByRole('button', { name: /close/i })).toBeNull());
    fireEvent.keyDown(view.getByRole('dialog'), { key: 'Escape', code: 'Escape' });
    expect(close).not.toHaveBeenCalled();
    await act(async () => finish({ success: false, error: 'Connection rejected' }));
    expect(view.getByText('Connection rejected')).toBeTruthy();
    expect(view.getByRole('dialog')).toBeTruthy();
    expect(view.getByRole('button', { name: /close/i })).toBeTruthy();
  });

  it('offers Desktop and CLI enrollment methods in the workspace wizard', () => {
    const view = renderGuide();
    expect(view.getByRole('tab', { name: 'devices.connectWizard.method.desktop' })).toBeTruthy();
    expect(view.getByRole('tab', { name: 'devices.connectWizard.method.cli' })).toBeTruthy();
  });

  it('never offers the unavailable npm registry package when a release has no CLI asset', () => {
    query.data = null;
    const view = renderGuide();
    expect(view.getByText('devices.connectWizard.cli.unavailable')).toBeTruthy();
    expect(view.getByRole('link', { name: 'devices.connectWizard.cli.viewReleases' })).toBeTruthy();
    expect(view.queryByText(/npm install -g/)).toBeNull();
  });

  it('waits for release information and provides retry on a failed lookup', () => {
    query.isLoading = true;
    const view = renderGuide();
    expect(view.getByRole('status')).toBeTruthy();
    expect(view.queryByText('devices.connectWizard.cli.unavailable')).toBeNull();
    query.isLoading = false;
    query.error = new Error('offline');
    view.rerender(
      <DeviceConnectModal
        open
        initialTab="cli"
        scope="workspace"
        visibility="public"
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(view.getByRole('button', { name: 'error.retry' }));
    expect(query.mutate).toHaveBeenCalledOnce();
    expect(view.queryByText(/npm install -g/)).toBeNull();
  });

  it('offers installation only from a returned release asset', () => {
    query.data = {
      assetName: 'orvilo-cli-0.0.54.tgz',
      tag: 'v2.6.1',
      url: 'https://github.com/alexj11324/orvilo1/releases/download/v2.6.1/orvilo-cli-0.0.54.tgz',
      version: '2.6.1',
    };
    const view = renderGuide();
    expect(view.getByText(`npm install -g '${query.data.url}'`)).toBeTruthy();
    expect(view.queryByText('devices.connectWizard.cli.unavailable')).toBeNull();
  });
});
