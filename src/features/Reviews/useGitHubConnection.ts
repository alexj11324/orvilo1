import { toast } from '@lobehub/ui/base-ui';
import { isDesktop } from '@orvilo/const';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { githubOAuthService } from '@/services/githubOAuth';
import { useElectronStore } from '@/store/electron';
import { electronSyncSelectors } from '@/store/electron/selectors';

export const useGitHubConnection = (onConnected: () => void | Promise<void>) => {
  const { t } = useTranslation('common');
  const initialGrantRevision = useRef<string | null>(null);
  const completed = useRef(false);
  const [starting, setStarting] = useState(false);
  const [waiting, setWaiting] = useState(false);

  const checkConnection = useCallback(async () => {
    try {
      const status = await githubOAuthService.status();
      if (
        status.data.connected &&
        status.data.grantRevision !== initialGrantRevision.current &&
        !completed.current
      ) {
        completed.current = true;
        setWaiting(false);
        await onConnected();
      }
    } catch {
      // The queue keeps its actionable error; a transient status poll can retry.
    }
  }, [onConnected]);

  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => void checkConnection(), 2500);
    const timeout = window.setTimeout(() => setWaiting(false), 120_000);
    const onFocus = () => void checkConnection();
    const onMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.data?.type === 'orvilo-github-oauth') {
        if (event.data.success) {
          void checkConnection();
        } else {
          setWaiting(false);
          toast.error(t('reviews.connectGitHubFailed'));
        }
      }
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('message', onMessage);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(timeout);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('message', onMessage);
    };
  }, [checkConnection, t, waiting]);

  const connect = async () => {
    const popup = isDesktop ? null : window.open('', '_blank', 'width=600,height=700');
    if (!isDesktop && !popup) {
      toast.error(t('reviews.connectGitHubFailed'));
      return;
    }

    completed.current = false;
    setStarting(true);
    try {
      const status = await githubOAuthService.status();
      initialGrantRevision.current = status.data.connected ? status.data.grantRevision : null;
      if (isDesktop) {
        // The GitHub callback binds to the initiating Web session. Desktop
        // opens that same account's hosted Reviews page, then observes its
        // server-side connection when the user returns to the app.
        const serverUrl = electronSyncSelectors.remoteServerUrl(useElectronStore.getState());
        window.open(new URL('/reviews', serverUrl).toString(), '_blank');
        setWaiting(true);
        return;
      }
      const response = await githubOAuthService.start();
      if (!popup || popup.closed) throw new Error('GitHub authorization window was closed');
      popup.location.href = response.data.authorizationUrl;
      setWaiting(true);
    } catch {
      popup?.close();
      toast.error(t('reviews.connectGitHubFailed'));
    } finally {
      setStarting(false);
    }
  };

  return { connect, starting, waiting };
};
