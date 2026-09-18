'use client';

import { COMPOSIO_APP_TYPES, getOrviloSkillProviderById } from '@orvilo/const';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useToolStore } from '@/store/tool';
import { composioStoreSelectors, orviloSkillStoreSelectors } from '@/store/tool/selectors';
import { ComposioServerStatus } from '@/store/tool/slices/composioStore';
import { OrviloSkillStatus } from '@/store/tool/slices/orviloSkillStore/types';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 15_000;

interface UseSkillConnectOptions {
  identifier: string;
  serverName?: string;
  type: 'composio' | 'orvilo';
}

export const useSkillConnect = ({ identifier, serverName, type }: UseSkillConnectOptions) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isWaitingAuth, setIsWaitingAuth] = useState(false);

  const oauthWindowRef = useRef<Window | null>(null);
  const windowCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Orvilo skill hooks
  const checkOrviloStatus = useToolStore((s) => s.checkOrviloSkillStatus);
  const revokeOrviloConnect = useToolStore((s) => s.revokeOrviloSkill);
  const getAuthorizeUrl = useToolStore((s) => s.getOrviloSkillAuthorizeUrl);
  const orviloServer = useToolStore(orviloSkillStoreSelectors.getServerByIdentifier(identifier));

  // Composio hooks
  const userId = useUserStore(userProfileSelectors.userId);
  const createComposioConnection = useToolStore((s) => s.createComposioConnection);
  const refreshComposioConnectionStatus = useToolStore((s) => s.refreshComposioConnectionStatus);
  const removeComposioConnection = useToolStore((s) => s.removeComposioConnection);
  const composioServer = useToolStore(composioStoreSelectors.getServerByIdentifier(identifier));

  const cleanup = useCallback(() => {
    if (windowCheckIntervalRef.current) {
      clearInterval(windowCheckIntervalRef.current);
      windowCheckIntervalRef.current = null;
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    oauthWindowRef.current = null;
    setIsWaitingAuth(false);
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  useEffect(() => {
    const connected =
      type === 'orvilo'
        ? orviloServer?.status === OrviloSkillStatus.CONNECTED
        : composioServer?.status === ComposioServerStatus.ACTIVE;

    if (connected && isWaitingAuth) {
      cleanup();
    }
  }, [type, orviloServer?.status, composioServer?.status, isWaitingAuth, cleanup]);

  // Listen for OAuth success message from popup window (for Orvilo skills)
  useEffect(() => {
    if (type !== 'orvilo') return;

    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (event.data?.type === 'ORVILO_SKILL_AUTH_SUCCESS' && event.data?.provider === identifier) {
        cleanup();
        await checkOrviloStatus(identifier);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [type, identifier, cleanup, checkOrviloStatus]);

  const startFallbackPolling = useCallback(
    (serverIdOrName: string) => {
      if (pollIntervalRef.current) return;

      pollIntervalRef.current = setInterval(async () => {
        try {
          if (type === 'orvilo') {
            await checkOrviloStatus(serverIdOrName);
          } else {
            await refreshComposioConnectionStatus(serverIdOrName);
          }
        } catch (error) {
          console.error('[SkillStore] Failed to check status:', error);
        }
      }, POLL_INTERVAL_MS);

      pollTimeoutRef.current = setTimeout(() => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        setIsWaitingAuth(false);
      }, POLL_TIMEOUT_MS);
    },
    [type, checkOrviloStatus, refreshComposioConnectionStatus],
  );

  const startWindowMonitor = useCallback(
    (oauthWindow: Window, serverIdOrName: string) => {
      windowCheckIntervalRef.current = setInterval(async () => {
        try {
          if (oauthWindow.closed) {
            if (windowCheckIntervalRef.current) {
              clearInterval(windowCheckIntervalRef.current);
              windowCheckIntervalRef.current = null;
            }
            oauthWindowRef.current = null;
            // Check status and then reset waiting state
            if (type === 'orvilo') {
              await checkOrviloStatus(serverIdOrName);
            } else {
              await refreshComposioConnectionStatus(serverIdOrName);
            }
            setIsWaitingAuth(false);
          }
        } catch {
          if (windowCheckIntervalRef.current) {
            clearInterval(windowCheckIntervalRef.current);
            windowCheckIntervalRef.current = null;
          }
          startFallbackPolling(serverIdOrName);
        }
      }, 500);
    },
    [type, checkOrviloStatus, refreshComposioConnectionStatus, startFallbackPolling],
  );

  const openOAuthWindow = useCallback(
    (redirectUrl: string, serverIdOrName: string) => {
      cleanup();
      setIsWaitingAuth(true);

      const oauthWindow = window.open(redirectUrl, '_blank', 'width=600,height=700');
      if (oauthWindow) {
        oauthWindowRef.current = oauthWindow;
        startWindowMonitor(oauthWindow, serverIdOrName);
      } else {
        startFallbackPolling(serverIdOrName);
      }
    },
    [cleanup, startWindowMonitor, startFallbackPolling],
  );

  // Handle connect for Orvilo
  const handleOrviloConnect = useCallback(async () => {
    if (orviloServer?.isConnected) return;

    setIsConnecting(true);
    try {
      const provider = getOrviloSkillProviderById(identifier);
      if (!provider) return;

      // Skip redirectUri on desktop (app:// protocol) since the system browser can't navigate to it
      const redirectUri = window.location.protocol.startsWith('http')
        ? `${window.location.origin}/oauth/callback/success?provider=${encodeURIComponent(identifier)}`
        : undefined;
      const { authorizeUrl } = await getAuthorizeUrl(identifier, { redirectUri });
      openOAuthWindow(authorizeUrl, identifier);
    } catch (error) {
      console.error('[SkillStore] Failed to get authorize URL:', error);
    } finally {
      setIsConnecting(false);
    }
  }, [identifier, orviloServer?.isConnected, getAuthorizeUrl, openOAuthWindow]);

  // Handle connect for Composio
  const handleComposioConnect = useCallback(async () => {
    if (!userId) return;
    if (composioServer) return;

    const appType = COMPOSIO_APP_TYPES.find((t) => t.identifier === identifier);

    setIsConnecting(true);
    try {
      const newServer = await createComposioConnection({
        appSlug: appType?.appSlug ?? serverName ?? identifier,
        identifier,
        label: appType?.label ?? identifier,
      });

      if (newServer) {
        if (newServer.status === ComposioServerStatus.ACTIVE) {
          await refreshComposioConnectionStatus(newServer.identifier);
        } else if (newServer.redirectUrl) {
          openOAuthWindow(newServer.redirectUrl, newServer.identifier);
        }
      }
    } catch (error) {
      console.error('[SkillStore] Failed to connect server:', error);
    } finally {
      setIsConnecting(false);
    }
  }, [
    userId,
    serverName,
    composioServer,
    identifier,
    createComposioConnection,
    refreshComposioConnectionStatus,
    openOAuthWindow,
  ]);

  const handleConnect = type === 'orvilo' ? handleOrviloConnect : handleComposioConnect;

  const handleDisconnect = useCallback(async () => {
    if (type === 'orvilo' && orviloServer) {
      const provider = orviloServer.identifier;
      await revokeOrviloConnect(provider);

      const latestServer = useToolStore
        .getState()
        .orviloSkillServers.find((server) => server.identifier === provider);

      return latestServer?.status !== OrviloSkillStatus.CONNECTED;
    } else if (type === 'composio' && composioServer) {
      const serverIdentifier = composioServer.identifier;
      await removeComposioConnection(serverIdentifier);

      const latestServer = useToolStore
        .getState()
        .composioServers.find((server) => server.identifier === serverIdentifier);

      return latestServer?.status !== ComposioServerStatus.ACTIVE;
    }

    return true;
  }, [type, orviloServer, composioServer, revokeOrviloConnect, removeComposioConnection]);

  const isConnected =
    type === 'orvilo'
      ? orviloServer?.status === OrviloSkillStatus.CONNECTED
      : composioServer?.status === ComposioServerStatus.ACTIVE;

  return {
    handleConnect,
    handleDisconnect,
    isConnected,
    isConnecting: isConnecting || isWaitingAuth,
  };
};
