'use client';

import { Center, Icon, Tooltip } from '@lobehub/ui';
import { Avatar, Button } from '@lobehub/ui/base-ui';
import { type ComposioAppType } from '@orvilo/const';
import { cssVar } from 'antd-style';
import { CircleCheck, Loader2, SquareArrowOutUpRight } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import NavItem from '@/features/NavPanel/components/NavItem';
import { usePermission } from '@/hooks/usePermission';
import { useToolStore } from '@/store/tool';
import { type ComposioServer } from '@/store/tool/slices/composioStore';
import { ComposioServerStatus } from '@/store/tool/slices/composioStore';

const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 15_000;

interface ComposioSkillItemProps {
  isSelected?: boolean;
  onSelect: () => void;
  server?: ComposioServer;
  serverType: ComposioAppType;
}

/**
 * A row for a Composio OAuth connector in the Connector settings list.
 *
 * The row owns the inline connect / re-authorize affordance for the same reason
 * as the Orvilo row: a not-yet-connected connector must not open a blank detail
 * panel.
 */
const ComposioSkillItem = memo<ComposioSkillItemProps>(
  ({ serverType, server, isSelected, onSelect }) => {
    const { t } = useTranslation('setting');
    const { allowed: canCreate, reason: createReason } = usePermission('create_content');
    const { allowed: canEdit, reason: editReason } = usePermission('edit_own_content');
    const [isConnecting, setIsConnecting] = useState(false);
    const [isWaitingAuth, setIsWaitingAuth] = useState(false);

    const oauthWindowRef = useRef<Window | null>(null);
    const windowCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const createComposioConnection = useToolStore((s) => s.createComposioConnection);
    const refreshComposioConnectionStatus = useToolStore((s) => s.refreshComposioConnectionStatus);
    const reauthorizeComposioConnection = useToolStore((s) => s.reauthorizeComposioConnection);

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
      if (server?.status === ComposioServerStatus.ACTIVE && isWaitingAuth) {
        cleanup();
      }
    }, [server?.status, isWaitingAuth, cleanup]);

    const startFallbackPolling = useCallback(
      (identifier: string) => {
        if (pollIntervalRef.current) return;

        pollIntervalRef.current = setInterval(async () => {
          try {
            await refreshComposioConnectionStatus(identifier);
          } catch (error) {
            console.info('[Composio] Polling check (expected during auth):', error);
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
      [refreshComposioConnectionStatus],
    );

    const startWindowMonitor = useCallback(
      (oauthWindow: Window, identifier: string) => {
        windowCheckIntervalRef.current = setInterval(async () => {
          try {
            if (oauthWindow.closed) {
              if (windowCheckIntervalRef.current) {
                clearInterval(windowCheckIntervalRef.current);
                windowCheckIntervalRef.current = null;
              }
              oauthWindowRef.current = null;
              startFallbackPolling(identifier);
            }
          } catch {
            console.info('[Composio] COOP blocked window.closed access, falling back to polling');
            if (windowCheckIntervalRef.current) {
              clearInterval(windowCheckIntervalRef.current);
              windowCheckIntervalRef.current = null;
            }
            startFallbackPolling(identifier);
          }
        }, 500);
      },
      [startFallbackPolling],
    );

    const openOAuthWindow = useCallback(
      (redirectUrl: string, identifier: string) => {
        cleanup();
        setIsWaitingAuth(true);

        const oauthWindow = window.open(redirectUrl, '_blank', 'width=600,height=700');
        if (oauthWindow) {
          oauthWindowRef.current = oauthWindow;
          startWindowMonitor(oauthWindow, identifier);
        } else {
          startFallbackPolling(identifier);
        }
      },
      [cleanup, startWindowMonitor, startFallbackPolling],
    );

    const handleConnect = async () => {
      if (!canCreate || !canEdit) return;
      if (server) return;

      setIsConnecting(true);
      try {
        const newServer = await createComposioConnection({
          appSlug: serverType.appSlug,
          identifier: serverType.identifier,
          label: serverType.label,
        });

        if (newServer) {
          if (newServer.status === ComposioServerStatus.ACTIVE) {
            await refreshComposioConnectionStatus(newServer.identifier);
          } else if (newServer.redirectUrl) {
            openOAuthWindow(newServer.redirectUrl, newServer.identifier);
          }
        }
      } catch (error) {
        console.error('[Composio] Failed to connect server:', error);
      } finally {
        setIsConnecting(false);
      }
    };

    const handleReauthorize = async () => {
      if (!canCreate || !canEdit || !server) return;
      setIsConnecting(true);
      try {
        const newServer = await reauthorizeComposioConnection(server.identifier);
        if (newServer?.redirectUrl) {
          openOAuthWindow(newServer.redirectUrl, newServer.identifier);
        }
      } catch (error) {
        console.error('[Composio] Failed to re-authorize server:', error);
      } finally {
        setIsConnecting(false);
      }
    };

    const isConnected = server?.status === ComposioServerStatus.ACTIVE;
    const isPending = server?.status === ComposioServerStatus.PENDING_AUTH;
    const isError = server?.status === ComposioServerStatus.ERROR;

    // Compact connect/status control for the list row. Mirrors the ChatInput
    // skills dropdown UX: connected → green check; pending/errored →
    // Re-authorize; not connected → Connect. All open the OAuth flow inline so
    // users can tell what is connected instead of hitting a blank detail panel.
    const renderNavExtra = () => {
      if (isConnecting || isWaitingAuth) {
        return <Button disabled icon={<Icon spin icon={Loader2} />} size="small" type="text" />;
      }
      if (isConnected) {
        return (
          <Tooltip title={t('tools.composio.connected')}>
            <Center width={20}>
              <Icon icon={CircleCheck} size={16} style={{ color: cssVar.colorSuccess }} />
            </Center>
          </Tooltip>
        );
      }
      if (isPending || isError) {
        return (
          <Tooltip title={!canCreate ? createReason : editReason}>
            <Button
              disabled={!canCreate || !canEdit}
              icon={<Icon icon={SquareArrowOutUpRight} />}
              size="small"
              type="text"
              onClick={handleReauthorize}
            >
              {t('tools.composio.reauthorize', { defaultValue: 'Re-authorize' })}
            </Button>
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
            {t('tools.composio.connect', { defaultValue: 'Connect' })}
          </Button>
        </Tooltip>
      );
    };

    const renderNavIcon = () => {
      const { icon, label } = serverType;
      if (typeof icon === 'string') return <Avatar alt={label} avatar={icon} size={18} />;
      return <Icon fill={cssVar.colorText} icon={icon} size={18} />;
    };

    return (
      <NavItem
        active={isSelected}
        extra={renderNavExtra()}
        icon={renderNavIcon}
        title={serverType.label}
        titleColor={!isConnected ? cssVar.colorTextDescription : undefined}
        // Only connected connectors open the detail panel. When not active
        // (disconnected / pending / error) the row is inert and the only
        // affordance is the inline Connect / Re-authorize button — otherwise
        // clicking opens a blank detail panel that reads as a bug.
        onClick={isConnected ? onSelect : undefined}
      />
    );
  },
);

ComposioSkillItem.displayName = 'ComposioSkillItem';

export default ComposioSkillItem;
