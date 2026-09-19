'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import type { ImperativeModalProps, ModalInstance } from '@lobehub/ui/base-ui';
import { Button, createModal, ModalFooter } from '@lobehub/ui/base-ui';
import { useWatchBroadcast } from '@orvilo/electron-client-ipc';
import debug from 'debug';
import { AlertCircle, LogIn } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { sessionAuthEvents } from '@/layout/AuthProvider/SessionAuth/events';
import { useElectronStore } from '@/store/electron';
import { buildOnboardingRedirectUrl } from '@/utils/onboardingRedirect';

const log = debug('orvilo-client:auth-required-modal');

interface AuthRequiredModalContentProps {
  onActionReady: (api: { signIn: () => Promise<void> }) => void;
  onSigningInChange?: (isSigningIn: boolean) => void;
}

const AuthRequiredModalContent = memo<AuthRequiredModalContentProps>(
  ({ onActionReady, onSigningInChange }) => {
    const { t } = useTranslation('auth');
    const [isSigningIn, setIsSigningIn] = useState(false);

    const [dataSyncConfig, connectRemoteServer, clearRemoteServerSyncError] = useElectronStore(
      (s) => [s.dataSyncConfig, s.connectRemoteServer, s.clearRemoteServerSyncError],
    );

    useEffect(() => {
      onSigningInChange?.(isSigningIn);
    }, [isSigningIn, onSigningInChange]);

    useWatchBroadcast('authorizationFailed', () => {
      setIsSigningIn(false);
    });

    const signIn = useCallback(async () => {
      setIsSigningIn(true);
      clearRemoteServerSyncError();

      await connectRemoteServer({
        remoteServerUrl: dataSyncConfig?.remoteServerUrl,
        storageMode: dataSyncConfig?.storageMode || 'cloud',
      });
    }, [clearRemoteServerSyncError, connectRemoteServer, dataSyncConfig]);

    useEffect(() => {
      onActionReady({ signIn });
    }, [onActionReady, signIn]);

    return <p style={{ margin: 0 }}>{t('authModal.description')}</p>;
  },
);

AuthRequiredModalContent.displayName = 'AuthRequiredModalContent';

interface FooterProps {
  isSigningIn: boolean;
  onSignIn: () => void;
}

const AuthRequiredFooter = memo<FooterProps>(({ isSigningIn, onSignIn }) => {
  const { t } = useTranslation('auth');
  return (
    <ModalFooter>
      <Button icon={<Icon icon={LogIn} />} loading={isSigningIn} type="primary" onClick={onSignIn}>
        {isSigningIn ? t('authModal.signingIn') : t('authModal.signIn')}
      </Button>
    </ModalFooter>
  );
});
AuthRequiredFooter.displayName = 'AuthRequiredFooter';

const AuthRequiredModalTitle = memo(() => {
  const { t } = useTranslation('auth');

  return (
    <Flexbox horizontal align="center" gap={8}>
      <Icon icon={AlertCircle} />
      {t('authModal.title')}
    </Flexbox>
  );
});
AuthRequiredModalTitle.displayName = 'AuthRequiredModalTitle';

export const useAuthRequiredModal = () => {
  const instanceRef = useRef<ModalInstance | null>(null);

  const close = useCallback(() => {
    instanceRef.current?.close();
    instanceRef.current = null;
  }, []);

  const open = useCallback(() => {
    if (instanceRef.current) return;

    let isSigningIn = false;
    let signIn: () => Promise<void> = async () => {};

    const renderFooter = () => (
      <AuthRequiredFooter isSigningIn={isSigningIn} onSignIn={() => signIn()} />
    );

    instanceRef.current = createModal({
      content: (
        <AuthRequiredModalContent
          onActionReady={(api) => {
            signIn = api.signIn;
          }}
          onSigningInChange={(next) => {
            if (isSigningIn === next) return;
            isSigningIn = next;
            instanceRef.current?.update?.({
              footer: renderFooter(),
              maskClosable: false,
            } as Partial<ImperativeModalProps>);
          }}
        />
      ),
      footer: renderFooter(),
      maskClosable: false,
      onOpenChange: (nextOpen) => {
        if (!nextOpen) {
          instanceRef.current = null;
        }
      },
      title: <AuthRequiredModalTitle />,
    });
  }, []);

  return { close, open };
};

const AuthRequiredModal = memo(() => {
  const { close, open } = useAuthRequiredModal();
  const [isRemoteServerActive, refreshServerConfig] = useElectronStore((s) => [
    Boolean(s.dataSyncConfig?.active),
    s.refreshServerConfig,
  ]);

  useEffect(() => {
    if (isRemoteServerActive) close();
  }, [close, isRemoteServerActive]);

  useWatchBroadcast('authorizationSuccessful', () => {
    close();
    void refreshServerConfig();
  });

  // The main-process proxy spots auth failures at the transport layer; the
  // tRPC error link spots them as 401 responses. Both funnel into the shared
  // session-auth event — the modal below is the desktop recovery adapter.
  useWatchBroadcast('authorizationRequired', (payload) => {
    const reason = payload?.reason ?? 'unknown';
    const state = useElectronStore.getState();
    if (state.isConnectionDrawerOpen) {
      log('authorizationRequired ignored (connection drawer open). reason=%s', reason);
      return;
    }
    // Wait until remote sync config has loaded once (avoid a flash before SWR resolves).
    if (!state.isInitRemoteServerConfig) {
      log(
        'authorizationRequired ignored (remote server config not initialized). reason=%s',
        reason,
      );
      return;
    }

    sessionAuthEvents.emit('session-auth-expired', {
      reason,
      source: 'desktop-proxy',
      timestamp: Date.now(),
    });
  });

  useEffect(() => {
    return sessionAuthEvents.on('session-auth-expired', ({ reason, source }) => {
      // The desktop adapter only owns signals raised on this machine — a web
      // client never mounts this component anyway, and the tRPC path is
      // identical on both.
      const { dataSyncConfig, isInitRemoteServerConfig } = useElectronStore.getState();

      // "Expired" only exists while a session is live. On a signed-out or
      // never-authenticated instance the same 401 bursts (in-flight requests,
      // first-boot probes) carry no session to lose — send the user straight
      // to the login surface instead of an expiry modal. `/onboarding`
      // renders LoginStep on signed-out desktop; the current location is
      // threaded as the post-login callback.
      if (isInitRemoteServerConfig && !dataSyncConfig?.active) {
        log(
          'session-auth-expired with no live session — redirecting to login. source=%s reason=%s',
          source,
          reason,
        );
        if (window.location.pathname !== '/onboarding') {
          window.location.assign(
            buildOnboardingRedirectUrl(
              window.location.pathname + window.location.search + window.location.hash,
            ),
          );
        }
        return;
      }

      log('session-auth-expired: opening modal. source=%s reason=%s', source, reason);
      open();
    });
  }, [open]);

  return null;
});

AuthRequiredModal.displayName = 'AuthRequiredModal';

export default AuthRequiredModal;
