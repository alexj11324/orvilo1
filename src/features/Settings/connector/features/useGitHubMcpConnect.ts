import { toast } from '@lobehub/ui/base-ui';
import { isDesktop } from '@orvilo/const';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { githubOAuthService } from '@/services/githubOAuth';
import { useElectronStore } from '@/store/electron';
import { electronSyncSelectors } from '@/store/electron/selectors';
import { useToolStore } from '@/store/tool';

export const useGitHubMcpConnect = (onConnected: (connectorId: string) => void) => {
  const { t } = useTranslation('tool');
  const connectGitHubMcp = useToolStore((s) => s.connectGitHubMcp);
  const popup = useRef<Window | null>(null);
  const completing = useRef(false);
  const [connecting, setConnecting] = useState(false);
  const [grantConnected, setGrantConnected] = useState<boolean>();
  const [waiting, setWaiting] = useState(false);

  const finish = useCallback(async () => {
    if (completing.current) return;
    completing.current = true;
    try {
      const result = await connectGitHubMcp();
      if (result.status !== 'connected') return;
      popup.current?.close();
      popup.current = null;
      setWaiting(false);
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
      // Polling reconciles on the next interval/focus event.
    }
  }, [finish]);

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

  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => {
      if (popup.current?.closed) {
        popup.current = null;
        setWaiting(false);
        return;
      }
      void checkGrant();
    }, 2500);
    const onFocus = () => void checkGrant();
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'orvilo-github-oauth') {
        return;
      }
      if (event.data.success) {
        void finish();
      } else {
        popup.current = null;
        setWaiting(false);
        toast.error(t('connector.actionFailed'));
      }
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('message', onMessage);
    const timeout = window.setTimeout(() => setWaiting(false), 120_000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(timeout);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('message', onMessage);
    };
  }, [checkGrant, finish, t, waiting]);

  const connect = async () => {
    setConnecting(true);
    try {
      if (isDesktop) {
        const serverUrl = electronSyncSelectors.remoteServerUrl(useElectronStore.getState());
        window.open(new URL('/oauth/github/start', serverUrl).toString(), '_blank');
        setWaiting(true);
        await checkGrant();
        return;
      }

      popup.current = window.open('', 'orvilo-github-mcp-oauth', 'width=600,height=700');
      if (!popup.current) throw new Error('GitHub authorization window was blocked');

      const result = await connectGitHubMcp();
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
    } catch {
      popup.current?.close();
      popup.current = null;
      setWaiting(false);
      toast.error(t('connector.actionFailed'));
    } finally {
      setConnecting(false);
    }
  };

  return { connect, connecting: connecting || waiting, grantConnected };
};
