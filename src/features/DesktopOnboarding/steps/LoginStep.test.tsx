import type { DataSyncConfig } from '@orvilo/electron-client-ipc';
import { useWatchBroadcast } from '@orvilo/electron-client-ipc';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { remoteServerService } from '@/services/electron/remoteServer';

import LoginStep from './LoginStep';

const mockElectronState = vi.hoisted(() => ({
  clearRemoteServerSyncError: vi.fn(),
  connectRemoteServer: vi.fn(),
  dataSyncConfig: { active: true, storageMode: 'cloud' } as DataSyncConfig,
  isConnectingServer: false,
  refreshServerConfig: vi.fn(),
  remoteServerSyncError: undefined as { message?: string } | undefined,
  useDataSyncConfig: vi.fn(() => ({})),
}));

const mockSignOut = vi.hoisted(() => vi.fn());

vi.mock('@orvilo/electron-client-ipc', () => ({
  useWatchBroadcast: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: string | Record<string, string>) => {
      const dict: Record<string, string> = {
        'authResult.failed.desc': 'Authorization failed',
        'authResult.failed.title': 'Authorization Failed',
        // Retired key, kept so the "no success banner" assertion below can still fail loudly
        'authResult.success.title': 'Authorization Successful',
        'back': 'Back',
        'next': 'Next',
        'screen5.actions.cancel': 'Cancel',
        'screen5.actions.connectToServer': 'Connect to server',
        'screen5.actions.done': 'Done',
        'screen5.actions.signingIn': 'Signing in...',
        'screen5.entry.selfhostAction': 'Use self-hosted server',
        'screen5.entry.title': 'Back to building.',
        'screen5.entry.serverTitle': 'Connect your Orvilo server',
        'screen5.selfhost.endpointLabel': 'Server address',
        'screen5.actions.signInCloud': 'Sign in Cloud',
        'screen5.actions.signOut': 'Sign out',
        'screen5.actions.tryAgain': 'Try again',
        'screen5.description':
          'Sign in to sync Agents, Groups, settings, and Context across all devices.',
        'screen5.methods.selfhost.description': 'Use self-hosted server',
        'screen5.selfhost.endpointPlaceholder': 'https://example.com',
        'screen5.status.cloud.title': 'Connected to Orvilo Cloud',
        'screen5.status.description': 'Everything is syncing across all your devices.',
        'screen5.status.selfhost.description': 'Syncing with {{url}}.',
        'screen5.status.selfhost.title': 'Connected to your own server',
        'screen5.title': 'Sign in to sync across devices',
        'screen5.title2': '',
        'screen5.title3': '',
      };

      const template = dict[key] ?? (typeof options === 'string' ? options : key);

      if (!options || typeof options === 'string') return template;

      return Object.entries(options).reduce(
        (acc, [name, value]) => acc.replaceAll(`{{${name}}}`, value),
        template,
      );
    },
  }),
}));

vi.mock('@/const/version', () => ({
  isDesktop: true,
}));

vi.mock('@/features/User/UserInfo', () => ({
  default: () => <div>User Info</div>,
}));

vi.mock('@/hooks/useIMECompositionEvent', () => ({
  useIMECompositionEvent: () => ({
    compositionProps: {},
    isComposingRef: { current: false },
  }),
}));

vi.mock('@/hooks/useSignOut', () => ({
  useSignOut: () => mockSignOut,
}));

vi.mock('@/services/electron/remoteServer', () => ({
  remoteServerService: {
    cancelAuthorization: vi.fn(),
  },
}));

vi.mock('@/services/electron/system', () => ({
  electronSystemService: {
    hasLegacyLocalDb: vi.fn().mockResolvedValue(false),
    openExternalLink: vi.fn(),
    showContextMenu: vi.fn(),
  },
}));

vi.mock('@/store/electron', () => ({
  useElectronStore: <T,>(selector: (state: typeof mockElectronState) => T) =>
    selector(mockElectronState),
}));

vi.mock('@/utils/electron/autoOidc', () => ({
  setDesktopAutoOidcFirstOpenHandled: vi.fn(),
}));

const renderLoginStep = async (props: { mode?: 'onboarding' | 'status' } = {}) => {
  const onBack = vi.fn();
  const onNext = vi.fn();

  render(<LoginStep onBack={onBack} onNext={onNext} {...props} />);

  return { onBack, onNext };
};

beforeEach(() => {
  mockElectronState.clearRemoteServerSyncError.mockClear();
  mockElectronState.connectRemoteServer.mockClear();
  mockElectronState.dataSyncConfig = { active: true, storageMode: 'cloud' };
  mockElectronState.isConnectingServer = false;
  mockElectronState.refreshServerConfig.mockClear();
  mockElectronState.remoteServerSyncError = undefined;
  mockElectronState.useDataSyncConfig.mockClear();
  vi.mocked(useWatchBroadcast).mockClear();
  vi.mocked(remoteServerService.cancelAuthorization).mockClear();
  mockSignOut.mockClear();
  mockSignOut.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

describe('Desktop onboarding LoginStep', () => {
  it('renders a focused success state without an authorization banner', async () => {
    await renderLoginStep();

    expect(screen.queryByText('Authorization Successful')).not.toBeInTheDocument();
    expect(screen.getByText('User Info')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    expect(screen.queryByText('OR')).not.toBeInTheDocument();
    expect(screen.queryByText('Use self-hosted server')).not.toBeInTheDocument();
  });

  it('leaves the success state through the host in onboarding mode instead of resetting to the chooser', async () => {
    const { onBack } = await renderLoginStep();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Sign in Cloud' })).not.toBeInTheDocument();
    expect(screen.getByText('User Info')).toBeInTheDocument();
  });

  it('renders a connection summary instead of the sign-in wizard in status mode', async () => {
    const { onNext } = await renderLoginStep({ mode: 'status' });

    expect(screen.getByText('Connected to Orvilo Cloud')).toBeInTheDocument();
    expect(screen.getByText('Everything is syncing across all your devices.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('names the self-hosted server it is connected to in status mode', async () => {
    mockElectronState.dataSyncConfig = {
      active: true,
      remoteServerUrl: 'https://my-server.example.com',
      storageMode: 'selfHost',
    };

    await renderLoginStep({ mode: 'status' });

    expect(screen.getByText('Connected to your own server')).toBeInTheDocument();
    expect(screen.getByText('Syncing with https://my-server.example.com.')).toBeInTheDocument();
  });

  it('signs out through the shared flow in status mode rather than faking a logged-out screen', async () => {
    await renderLoginStep({ mode: 'status' });

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Sign in Cloud' })).not.toBeInTheDocument();
  });

  it('opens self-host connection as a labeled form and submits its address', async () => {
    mockElectronState.dataSyncConfig = { active: false, storageMode: 'cloud' };
    await renderLoginStep();

    fireEvent.click(screen.getByRole('button', { name: 'Use self-hosted server' }));
    const address = screen.getByRole('textbox', { name: 'Server address' });
    expect(screen.getByRole('button', { name: 'Connect to server' })).toBeDisabled();
    fireEvent.change(address, { target: { value: 'https://my-server.example.com' } });
    fireEvent.submit(address.closest('form')!);

    expect(mockElectronState.connectRemoteServer).toHaveBeenCalledWith({
      remoteServerUrl: 'https://my-server.example.com',
      storageMode: 'selfHost',
    });
    expect(address).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('returns from the server form without starting authorization', async () => {
    mockElectronState.dataSyncConfig = { active: false, storageMode: 'cloud' };
    await renderLoginStep();
    fireEvent.click(screen.getByRole('button', { name: 'Use self-hosted server' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: 'Sign in Cloud' })).toBeInTheDocument();
    expect(mockElectronState.connectRemoteServer).not.toHaveBeenCalled();
  });

  it('keeps authorization cancellation available and restores the sign-in choices', async () => {
    mockElectronState.dataSyncConfig = { active: false, storageMode: 'cloud' };
    await renderLoginStep();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in Cloud' }));
    expect(screen.getByRole('button', { name: 'Use self-hosted server' })).toBeDisabled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    });
    expect(remoteServerService.cancelAuthorization).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Sign in Cloud' })).toBeEnabled();
  });

  it('retries a failed authorization from the visible error state', async () => {
    mockElectronState.dataSyncConfig = { active: false, storageMode: 'cloud' };
    await renderLoginStep();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in Cloud' }));
    const failedListener = vi
      .mocked(useWatchBroadcast)
      .mock.calls.findLast(([event]) => event === 'authorizationFailed')?.[1] as (result: {
      error: string;
    }) => void;
    act(() => {
      failedListener({ error: 'Connection refused' });
    });
    expect(screen.getByText('Connection refused')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mockElectronState.connectRemoteServer).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Connection refused')).not.toBeInTheDocument();
  });
});
