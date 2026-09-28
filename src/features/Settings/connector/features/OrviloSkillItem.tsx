'use client';

import { Center, Icon, Tooltip } from '@lobehub/ui';
import { Avatar, Button } from '@lobehub/ui/base-ui';
import { type OrviloSkillProviderType } from '@orvilo/const';
import { cssVar } from 'antd-style';
import { CircleCheck, Loader2, SquareArrowOutUpRight } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import NavItem from '@/features/NavPanel/components/NavItem';
import { usePermission } from '@/hooks/usePermission';
import { useToolStore } from '@/store/tool';
import { type OrviloSkillServer } from '@/store/tool/slices/orviloSkillStore/types';
import { OrviloSkillStatus } from '@/store/tool/slices/orviloSkillStore/types';

const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 15_000;

interface OrviloSkillItemProps {
  isSelected?: boolean;
  onSelect: () => void;
  provider: OrviloSkillProviderType;
  server?: OrviloSkillServer;
}

/**
 * A row for an Orvilo OAuth connector in the Connector settings list.
 *
 * The row owns the inline connect / re-authorize affordance (so the user can
 * tell at a glance what is connected) and hands the detail panel to
 * `ConnectorDetail` when the connector is live.
 */
const OrviloSkillItem = memo<OrviloSkillItemProps>(({ provider, server, isSelected, onSelect }) => {
  const { t } = useTranslation('setting');
  const { allowed: canCreate, reason: createReason } = usePermission('create_content');
  const { allowed: canEdit, reason: editReason } = usePermission('edit_own_content');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isWaitingAuth, setIsWaitingAuth] = useState(false);

  const oauthWindowRef = useRef<Window | null>(null);
  const windowCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkStatus = useToolStore((s) => s.checkOrviloSkillStatus);
  const getAuthorizeUrl = useToolStore((s) => s.getOrviloSkillAuthorizeUrl);

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
        await checkStatus(provider.id);
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
  }, [checkStatus, provider.id]);

  const startWindowMonitor = useCallback(
    (oauthWindow: Window) => {
      windowCheckIntervalRef.current = setInterval(async () => {
        try {
          if (oauthWindow.closed) {
            if (windowCheckIntervalRef.current) {
              clearInterval(windowCheckIntervalRef.current);
              windowCheckIntervalRef.current = null;
            }
            oauthWindowRef.current = null;
            await checkStatus(provider.id);
            setIsWaitingAuth(false);
          }
        } catch {
          console.info('[OrviloSkill] COOP blocked window.closed access, falling back to polling');
          if (windowCheckIntervalRef.current) {
            clearInterval(windowCheckIntervalRef.current);
            windowCheckIntervalRef.current = null;
          }
          startFallbackPolling();
        }
      }, 500);
    },
    [checkStatus, provider.id, startFallbackPolling],
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

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (
        event.data?.type === 'ORVILO_SKILL_AUTH_SUCCESS' &&
        event.data?.provider === provider.id
      ) {
        cleanup();
        await checkStatus(provider.id);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [provider.id, cleanup, checkStatus]);

  const handleConnect = async () => {
    if (!canCreate || !canEdit) return;
    if (server?.isConnected) return;

    setIsConnecting(true);
    try {
      // Skip redirectUri on desktop (app:// protocol) since the system browser can't navigate to it
      const redirectUri = window.location.protocol.startsWith('http')
        ? `${window.location.origin}/oauth/callback/success?provider=${encodeURIComponent(provider.id)}`
        : undefined;
      const { authorizeUrl } = await getAuthorizeUrl(provider.id, { redirectUri });
      openOAuthWindow(authorizeUrl);
    } catch (error) {
      console.error('[OrviloSkill] Failed to get authorize URL:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  const isConnected = server?.status === OrviloSkillStatus.CONNECTED;

  // Compact connect/status control for the list row: connected → green check;
  // otherwise a Connect button that opens the OAuth flow inline, so users can
  // tell what is connected and aren't left staring at a blank detail panel
  // wondering if it's a bug.
  const renderNavExtra = () => {
    if (isConnecting || isWaitingAuth) {
      return <Button disabled icon={<Icon spin icon={Loader2} />} size="small" type="text" />;
    }
    if (isConnected) {
      return (
        <Tooltip title={t('tools.orviloSkill.connected', { defaultValue: 'Connected' })}>
          <Center width={20}>
            <Icon icon={CircleCheck} size={16} style={{ color: cssVar.colorSuccess }} />
          </Center>
        </Tooltip>
      );
    }
    return (
      <Tooltip title={!canCreate ? createReason : editReason}>
        <Button
          disabled={!canCreate || !canEdit}
          icon={<Icon icon={SquareArrowOutUpRight} />}
          size="small"
          type="text"
          onClick={handleConnect}
        >
          {t('tools.orviloSkill.connect')}
        </Button>
      </Tooltip>
    );
  };

  const renderNavIcon = () => {
    const { icon, label } = provider;
    if (typeof icon === 'string') return <Avatar alt={label} avatar={icon} size={18} />;
    return <Icon fill={cssVar.colorText} icon={icon} size={18} />;
  };

  return (
    <NavItem
      active={isSelected}
      extra={renderNavExtra()}
      icon={renderNavIcon}
      title={provider.label}
      titleColor={!isConnected ? cssVar.colorTextDescription : undefined}
      // Only connected connectors open the detail panel. When disconnected,
      // the row is inert and the only affordance is the inline Connect button —
      // otherwise clicking opens a blank detail panel that reads as a bug.
      onClick={isConnected ? onSelect : undefined}
    />
  );
});

OrviloSkillItem.displayName = 'OrviloSkillItem';

export default OrviloSkillItem;
