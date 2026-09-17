import { Flexbox, Icon, stopPropagation } from '@lobehub/ui';
import { Checkbox } from '@lobehub/ui/base-ui';
import { Loader2, SquareArrowOutUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePermission } from '@/hooks/usePermission';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';
import { useToolStore } from '@/store/tool';
import { orviloSkillStoreSelectors } from '@/store/tool/selectors';
import { OrviloSkillStatus } from '@/store/tool/slices/orviloSkillStore/types';

import { SKILL_ICON_GAP } from './constants';

const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 15_000;

interface OrviloSkillServerItemProps {
  /**
   * Optional agent ID to use instead of currentAgentConfig
   * Used in group profile to specify which member's plugins to toggle
   */
  agentId?: string;
  /**
   * Rendered inside the label so the row lines up with the managed skill rows;
   * passing it through the menu's own icon slot would size and space it
   * differently.
   */
  icon?: ReactNode;
  /**
   * Display label for the provider
   */
  label: string;
  /**
   * Provider ID (e.g., 'linear', 'github')
   */
  provider: string;
}

const OrviloSkillServerItem = memo<OrviloSkillServerItemProps>(
  ({ provider, icon, label, agentId }) => {
    const { t } = useTranslation('setting');
    const [isConnecting, setIsConnecting] = useState(false);
    const [isToggling, setIsToggling] = useState(false);
    const [isWaitingAuth, setIsWaitingAuth] = useState(false);
    const { allowed: canCreate } = usePermission('create_content');
    const { allowed: canEdit } = usePermission('edit_own_content');

    const oauthWindowRef = useRef<Window | null>(null);
    const windowCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const server = useToolStore(orviloSkillStoreSelectors.getServerByIdentifier(provider));
    const checkStatus = useToolStore((s) => s.checkOrviloSkillStatus);
    const getAuthorizeUrl = useToolStore((s) => s.getOrviloSkillAuthorizeUrl);

    // Get effective agent ID (agentId prop or current active agent)
    const activeAgentId = useAgentStore((s) => s.activeAgentId);
    const effectiveAgentId = agentId || activeAgentId || '';

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
      if (server?.status === OrviloSkillStatus.CONNECTED && isWaitingAuth) {
        cleanup();
      }
    }, [server?.status, isWaitingAuth, cleanup]);

    const startFallbackPolling = useCallback(() => {
      if (pollIntervalRef.current) return;

      pollIntervalRef.current = setInterval(async () => {
        try {
          await checkStatus(provider);
        } catch (error) {
          console.error('[OrviloSkill] Failed to check status:', error);
        }
      }, POLL_INTERVAL_MS);

      pollTimeoutRef.current = setTimeout(() => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        setIsWaitingAuth(false);
      }, POLL_TIMEOUT_MS);
    }, [checkStatus, provider]);

    const startWindowMonitor = useCallback(
      (oauthWindow: Window) => {
        windowCheckIntervalRef.current = setInterval(() => {
          try {
            if (oauthWindow.closed) {
              if (windowCheckIntervalRef.current) {
                clearInterval(windowCheckIntervalRef.current);
                windowCheckIntervalRef.current = null;
              }
              oauthWindowRef.current = null;
              checkStatus(provider);
            }
          } catch {
            console.info(
              '[OrviloSkill] COOP blocked window.closed access, falling back to polling',
            );
            if (windowCheckIntervalRef.current) {
              clearInterval(windowCheckIntervalRef.current);
              windowCheckIntervalRef.current = null;
            }
            startFallbackPolling();
          }
        }, 500);
      },
      [checkStatus, provider, startFallbackPolling],
    );

    const openOAuthWindow = useCallback(
      (authorizeUrl: string) => {
        cleanup();
        setIsWaitingAuth(true);

        const oauthWindow = window.open(authorizeUrl, '_blank', 'width=600,height=700');
        if (oauthWindow) {
          oauthWindowRef.current = oauthWindow;
          startWindowMonitor(oauthWindow);
        } else {
          startFallbackPolling();
        }
      },
      [cleanup, startWindowMonitor, startFallbackPolling],
    );

    const pluginId = server ? server.identifier : '';
    const plugins =
      useAgentStore(agentSelectors.getAgentConfigById(effectiveAgentId))?.plugins || [];
    const checked = plugins.includes(pluginId);
    const updateAgentConfigById = useAgentStore((s) => s.updateAgentConfigById);

    // Toggle plugin for the effective agent
    const togglePlugin = useCallback(
      async (pluginIdToToggle: string) => {
        if (!effectiveAgentId) return;
        const currentPlugins = plugins;
        const hasPlugin = currentPlugins.includes(pluginIdToToggle);
        const newPlugins = hasPlugin
          ? currentPlugins.filter((id) => id !== pluginIdToToggle)
          : [...currentPlugins, pluginIdToToggle];
        await updateAgentConfigById(effectiveAgentId, { plugins: newPlugins });
      },
      [effectiveAgentId, plugins, updateAgentConfigById],
    );

    // Listen for OAuth success message from popup window
    useEffect(() => {
      const handleMessage = async (event: MessageEvent) => {
        // Verify origin for security
        if (event.origin !== window.location.origin) return;

        if (event.data?.type === 'ORVILO_SKILL_AUTH_SUCCESS' && event.data?.provider === provider) {
          console.info('[OrviloSkill] OAuth success message received for provider:', provider);

          // Cleanup polling/window monitoring
          cleanup();

          // Refresh status to get the connected state
          await checkStatus(provider);

          // Auto-enable the plugin after successful OAuth
          // Need to get the latest server state after checkStatus
          const latestServer = useToolStore
            .getState()
            .orviloSkillServers?.find((s) => s.identifier === provider);
          if (latestServer?.status === OrviloSkillStatus.CONNECTED) {
            const newPluginId = latestServer.identifier;
            const currentAgentPlugins =
              agentSelectors.getAgentConfigById(effectiveAgentId)(useAgentStore.getState())
                ?.plugins || [];
            const isAlreadyEnabled = currentAgentPlugins.includes(newPluginId);
            if (canEdit && !isAlreadyEnabled) {
              console.info('[OrviloSkill] Auto-enabling plugin:', newPluginId);
              togglePlugin(newPluginId);
            }
          }
        }
      };

      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
    }, [canEdit, provider, cleanup, checkStatus, togglePlugin, effectiveAgentId]);

    const handleConnect = async () => {
      if (!canCreate || !canEdit) return;
      // Only block reconnection when already connected
      if (server?.isConnected) return;

      setIsConnecting(true);
      try {
        // Use /oauth/callback/success as redirect URI with provider param for auto-enable
        // Skip redirectUri on desktop (app:// protocol) since the system browser can't navigate to it
        const redirectUri = window.location.protocol.startsWith('http')
          ? `${window.location.origin}/oauth/callback/success?provider=${encodeURIComponent(provider)}`
          : undefined;
        const { authorizeUrl } = await getAuthorizeUrl(provider, { redirectUri });
        openOAuthWindow(authorizeUrl);
      } catch (error) {
        console.error('[OrviloSkill] Failed to get authorize URL:', error);
      } finally {
        setIsConnecting(false);
      }
    };

    const handleToggle = async () => {
      if (!canEdit || !server) return;
      setIsToggling(true);
      await togglePlugin(pluginId);
      setIsToggling(false);
    };

    const renderRightControl = () => {
      if (isConnecting) {
        return (
          <Flexbox horizontal align="center" gap={4} onClick={stopPropagation}>
            <Icon spin icon={Loader2} />
          </Flexbox>
        );
      }

      if (!server) {
        return (
          <Flexbox
            horizontal
            align="center"
            gap={4}
            style={{ cursor: canCreate && canEdit ? 'pointer' : 'not-allowed', opacity: 0.65 }}
            onClick={(e) => {
              e.stopPropagation();
              if (!canCreate || !canEdit) return;
              handleConnect();
            }}
          >
            {t('tools.orviloSkill.connect', { defaultValue: 'Connect' })}
            <Icon icon={SquareArrowOutUpRight} size="small" />
          </Flexbox>
        );
      }

      switch (server.status) {
        case OrviloSkillStatus.CONNECTED: {
          if (isToggling) {
            return <Icon spin icon={Loader2} />;
          }
          return (
            <Checkbox
              checked={checked}
              disabled={!canEdit}
              onClick={(e) => {
                e.stopPropagation();
                if (!canEdit) return;
                handleToggle();
              }}
            />
          );
        }
        case OrviloSkillStatus.CONNECTING: {
          if (isWaitingAuth) {
            return (
              <Flexbox horizontal align="center" gap={4} onClick={stopPropagation}>
                <Icon spin icon={Loader2} />
              </Flexbox>
            );
          }
          return (
            <Flexbox
              horizontal
              align="center"
              gap={4}
              style={{ cursor: canEdit ? 'pointer' : 'not-allowed', opacity: 0.65 }}
              onClick={async (e) => {
                e.stopPropagation();
                if (!canEdit) return;
                try {
                  const redirectUri = window.location.protocol.startsWith('http')
                    ? `${window.location.origin}/oauth/callback/success?provider=${encodeURIComponent(provider)}`
                    : undefined;
                  const { authorizeUrl } = await getAuthorizeUrl(provider, { redirectUri });
                  openOAuthWindow(authorizeUrl);
                } catch (error) {
                  console.error('[OrviloSkill] Failed to get authorize URL:', error);
                }
              }}
            >
              {t('tools.orviloSkill.authorize', { defaultValue: 'Authorize' })}
              <Icon icon={SquareArrowOutUpRight} size="small" />
            </Flexbox>
          );
        }
        case OrviloSkillStatus.NOT_CONNECTED: {
          return (
            <Flexbox
              horizontal
              align="center"
              gap={4}
              style={{ cursor: canCreate && canEdit ? 'pointer' : 'not-allowed', opacity: 0.65 }}
              onClick={(e) => {
                e.stopPropagation();
                if (!canCreate || !canEdit) return;
                handleConnect();
              }}
            >
              {t('tools.orviloSkill.connect', { defaultValue: 'Connect' })}
              <Icon icon={SquareArrowOutUpRight} size="small" />
            </Flexbox>
          );
        }
        case OrviloSkillStatus.ERROR: {
          return (
            <span style={{ color: 'red', fontSize: 12 }}>
              {t('tools.orviloSkill.error', { defaultValue: 'Error' })}
            </span>
          );
        }
        default: {
          return null;
        }
      }
    };

    return (
      <Flexbox
        horizontal
        align={'center'}
        gap={24}
        justify={'space-between'}
        onClick={(e) => {
          e.stopPropagation();
          if (canEdit && server?.status === OrviloSkillStatus.CONNECTED) {
            handleToggle();
          }
        }}
      >
        <Flexbox horizontal align={'center'} gap={SKILL_ICON_GAP}>
          {icon}
          {label}
        </Flexbox>
        {renderRightControl()}
      </Flexbox>
    );
  },
);

export default OrviloSkillServerItem;
