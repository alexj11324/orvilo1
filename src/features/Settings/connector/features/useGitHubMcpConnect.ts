import { toast } from '@lobehub/ui/base-ui';
import { isDesktop } from '@orvilo/const';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  newOAuthAttempt,
  OAUTH_SESSION_TIMEOUT_MS,
  waitForOAuthSession,
} from '@/features/Connectors/oauthSession';
import { githubOAuthService } from '@/services/githubOAuth';
import { useElectronStore } from '@/store/electron';
import { electronSyncSelectors } from '@/store/electron/selectors';
import { useToolStore } from '@/store/tool';

export const useGitHubMcpConnect = (onConnected: (connectorId: string) => void) => {
  const { t } = useTranslation('tool');
  const connectGitHubMcp = useToolStore((s) => s.connectGitHubMcp);
  const popup = useRef<Window | null>(null);
  const sessionAbort = useRef<AbortController | null>(null);
  const completing = useRef(false);
  const attempt = useRef('');
  const [connecting, setConnecting] = useState(false);
  const [grantConnected, setGrantConnected] = useState<boolean>();
  const [timedOut, setTimedOut] = useState(false);
  const [waiting, setWaiting] = useState(false);

  const finish = useCallback(async () => {
    if (completing.current) return;
    completing.current = true;
    try {
      const result = await connectGitHubMcp();
      if (result.status !== 'connected') return;
      popup.current?.close();
      popup.current = null;
      sessionAbort.current?.abort();
      setWaiting(false);
      setTimedOut(false);
      setGrantConnected(true);
      onConnected(result.connectorId);
    } catch {
      setWaiting(false);
      toast.error(t('connector.actionFailed'));
    } finally {
      completing.current = false;
    }
  }, [connectGitHubMcp, onConnected, t]);

  const checkGrant = useCallback(async () => {
    try {
      const status = await githubOAuthService.status();
      setGrantConnected(status.data.connected);
      if (status.data.connected) await finish();
    } catch {
      // Polling reconciles on the next focus event.
    }
  }, [finish]);

  const grantIsConnected = useCallback(async () => {
    try {
      return (await githubOAuthService.status()).data.connected;
    } catch {
      return false;
    }
  }, []);

  const runSession = useCallback(
    async (sessionPopup: Window | null) => {
      const controller = new AbortController();
      sessionAbort.current?.abort();
      sessionAbort.current = controller;
      const result = await waitForOAuthSession({
        attempt: attempt.current,
        checkStatus: grantIsConnected,
        messageType: 'orvilo-github-oauth',
        popup: sessionPopup,
        signal: controller.signal,
        timeoutMs: OAUTH_SESSION_TIMEOUT_MS,
      });
      // A newer attempt or an explicit cancel superseded this session.
      if (controller.signal.aborted || sessionAbort.current !== controller) return;
      sessionAbort.current = null;
      setWaiting(false);
      switch (result.status) {
        case 'success': {
          await finish();
          break;
        }
        case 'timed-out': {
          setTimedOut(true);
          toast.warning(t('connector.authTimedOut'));
          break;
        }
        case 'error': {
          toast.error(t('connector.actionFailed'));
          break;
        }
        default: {
          break;
        }
      }
    },
    [finish, grantIsConnected, t],
  );

  useEffect(() => {
    void (async () => {
      try {
        const status = await githubOAuthService.status();
        setGrantConnected(status.data.connected);
      } catch {
        // The connect action still reports a concrete error when invoked.
      }
    })();
  }, []);

  // While an attempt is pending, refocus reconciles a grant that completed
  // outside the popup (e.g. consent approved on another device).
  useEffect(() => {
    if (!waiting) return;
    const onFocus = () => void checkGrant();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [checkGrant, waiting]);

  // Unmount must release the pending attempt's listeners/timers.
  useEffect(
    () => () => {
      sessionAbort.current?.abort();
    },
    [],
  );

  const cancel = useCallback(() => {
    sessionAbort.current?.abort();
    sessionAbort.current = null;
    popup.current?.close();
    popup.current = null;
    setWaiting(false);
  }, []);

  const connect = async () => {
    setTimedOut(false);
    attempt.current = newOAuthAttempt();
    setConnecting(true);
    try {
      if (isDesktop) {
        const result = await connectGitHubMcp(attempt.current);
        if (result.status === 'connected') {
          setGrantConnected(true);
          onConnected(result.connectorId);
          return;
        }
        const serverUrl = electronSyncSelectors.remoteServerUrl(useElectronStore.getState());
        const startUrl = new URL('/oauth/github/start', serverUrl);
        startUrl.searchParams.set('attempt', attempt.current);
        const opened = window.open(startUrl.toString(), '_blank');
        setWaiting(true);
        void runSession(opened);
        return;
      }

      popup.current = window.open('', 'orvilo-github-mcp-oauth', 'width=600,height=700');
      if (!popup.current) throw new Error('GitHub authorization window was blocked');

      const result = await connectGitHubMcp(attempt.current);
      if (result.status === 'connected') {
        popup.current.close();
        popup.current = null;
        setGrantConnected(true);
        onConnected(result.connectorId);
        return;
      }

      setGrantConnected(false);
      popup.current.location.href = result.authorizationUrl;
      setWaiting(true);
      void runSession(popup.current);
    } catch {
      sessionAbort.current?.abort();
      popup.current?.close();
      popup.current = null;
      setWaiting(false);
      toast.error(t('connector.actionFailed'));
    } finally {
      setConnecting(false);
    }
  };

  return { cancel, connect, connecting: connecting || waiting, grantConnected, timedOut };
};
