import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sessionAuthEvents } from '@/layout/AuthProvider/SessionAuth/events';

import AuthRequiredModal, { useAuthRequiredModal } from './index';

interface ModalProps {
  content?: ReactNode;
  footer?: ReactNode;
  maskClosable?: boolean;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  styles?: {
    close?: React.CSSProperties;
  };
  title?: ReactNode;
}

const createModalMock = vi.hoisted(() => vi.fn());
const modalInstance = vi.hoisted(() => ({
  close: vi.fn(),
  update: vi.fn(),
}));
const translations = vi.hoisted(() => ({ current: {} as Record<string, string> }));
const broadcastHandlers = vi.hoisted(
  () => new Map<string, (payload?: { reason?: string }) => void>(),
);
const electronStore = vi.hoisted(() => ({
  current: {
    clearRemoteServerSyncError: vi.fn(),
    connectRemoteServer: vi.fn(),
    dataSyncConfig: { active: true, storageMode: 'cloud' } as
      { active?: boolean; remoteServerUrl?: string; storageMode?: string } | undefined,
    isConnectionDrawerOpen: false,
    isInitRemoteServerConfig: true,
    refreshServerConfig: vi.fn(),
  },
}));

const originalLocation = window.location;
const locationAssign = vi.hoisted(() => vi.fn());
const locationState = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('@orvilo/electron-client-ipc', () => ({
  useWatchBroadcast: (event: string, handler: (payload?: { reason?: string }) => void) => {
    broadcastHandlers.set(event, handler);
  },
}));

vi.mock('@lobehub/ui/base-ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createModal: (props: ModalProps) => {
    createModalMock(props);

    return modalInstance;
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: (namespace?: string) => ({
    t: (key: string) => translations.current[`${namespace}:${key}`] ?? key,
  }),
}));

vi.mock('@/store/electron', () => {
  const useElectronStore = Object.assign(
    <T,>(selector: (state: typeof electronStore.current) => T): T =>
      selector(electronStore.current),
    { getState: () => electronStore.current },
  );

  return { useElectronStore };
});

describe('useAuthRequiredModal', () => {
  beforeEach(() => {
    createModalMock.mockClear();
    modalInstance.close.mockClear();
    modalInstance.update.mockClear();
    broadcastHandlers.clear();
    locationAssign.mockClear();
    locationState.pathname = '/';
    electronStore.current.clearRemoteServerSyncError.mockClear();
    electronStore.current.connectRemoteServer.mockClear();
    electronStore.current.dataSyncConfig = { active: true, storageMode: 'cloud' };
    electronStore.current.isInitRemoteServerConfig = true;
    electronStore.current.refreshServerConfig.mockClear();
    translations.current = {};
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        assign: locationAssign,
        get pathname() {
          return locationState.pathname;
        },
        search: '',
        hash: '',
        origin: originalLocation.origin,
      },
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
      writable: true,
    });
  });

  it('redirects to the login surface instead of the expired modal when no session is live', () => {
    electronStore.current.dataSyncConfig = { storageMode: 'cloud' };

    render(<AuthRequiredModal />);

    act(() => {
      broadcastHandlers.get('authorizationRequired')?.({ reason: 'no-token' });
    });

    expect(createModalMock).not.toHaveBeenCalled();
    expect(locationAssign).toHaveBeenCalledWith('/onboarding');
  });

  it('stays put when the signed-out instance is already on /onboarding', () => {
    electronStore.current.dataSyncConfig = { storageMode: 'cloud' };
    locationState.pathname = '/onboarding';

    render(<AuthRequiredModal />);

    act(() => {
      broadcastHandlers.get('authorizationRequired')?.({ reason: 'no-token' });
    });

    expect(createModalMock).not.toHaveBeenCalled();
    expect(locationAssign).not.toHaveBeenCalled();
  });

  it('still opens the modal when a live session expires', () => {
    render(<AuthRequiredModal />);

    act(() => {
      broadcastHandlers.get('authorizationRequired')?.({ reason: 'refresh:invalid_grant' });
    });

    expect(createModalMock).toHaveBeenCalledOnce();
    expect(locationAssign).not.toHaveBeenCalled();
  });

  it('drops session-auth-expired while the remote config has not initialized', () => {
    electronStore.current.isInitRemoteServerConfig = false;

    render(<AuthRequiredModal />);

    act(() => {
      sessionAuthEvents.emit('session-auth-expired', {
        reason: 'boot-probe',
        source: 'trpc',
        timestamp: Date.now(),
      });
    });

    expect(createModalMock).not.toHaveBeenCalled();
    expect(locationAssign).not.toHaveBeenCalled();
  });

  it('closes the modal when desktop authorization succeeds', () => {
    render(<AuthRequiredModal />);

    act(() => {
      broadcastHandlers.get('authorizationRequired')?.({ reason: 'refresh:invalid_grant' });
    });

    expect(createModalMock).toHaveBeenCalledOnce();

    act(() => {
      broadcastHandlers.get('authorizationSuccessful')?.();
    });

    expect(modalInstance.close).toHaveBeenCalledOnce();
    expect(electronStore.current.refreshServerConfig).toHaveBeenCalledOnce();
  });

  it('renders the title from auth translations after the namespace becomes available', () => {
    const { result } = renderHook(() => useAuthRequiredModal());

    act(() => {
      result.current.open();
    });

    const [modalProps] = createModalMock.mock.calls[0] as [ModalProps];
    translations.current['auth:authModal.title'] = 'Session Expired';

    render(<>{modalProps.title}</>);

    expect(screen.getByText('Session Expired')).toBeInTheDocument();
    expect(screen.queryByText('authModal.title')).not.toBeInTheDocument();
  });

  it('keeps the close button available while removing the Later action', () => {
    translations.current = {
      'auth:authModal.later': 'Later',
      'auth:authModal.signIn': 'Sign In Again',
      'auth:authModal.signingIn': 'Signing in...',
    };
    const { result } = renderHook(() => useAuthRequiredModal());

    act(() => {
      result.current.open();
    });

    const [modalProps] = createModalMock.mock.calls[0] as [ModalProps];

    expect(modalProps.maskClosable).toBe(false);
    expect(modalProps.styles?.close).toBeUndefined();

    render(
      <>
        {modalProps.content}
        {modalProps.footer}
      </>,
    );

    expect(screen.queryByText('Later')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Sign In Again'));

    expect(electronStore.current.clearRemoteServerSyncError).toHaveBeenCalled();
    expect(electronStore.current.connectRemoteServer).toHaveBeenCalledWith({
      remoteServerUrl: undefined,
      storageMode: 'cloud',
    });

    act(() => {
      modalProps.onOpenChange?.(false);
    });

    act(() => {
      result.current.open();
    });

    expect(createModalMock).toHaveBeenCalledTimes(2);
  });
});
