'use client';

import { Center, Icon, Tooltip } from '@lobehub/ui';
import { Avatar, Button, toast } from '@lobehub/ui/base-ui';
import { isDesktop, matchMcpPresetByConnector, type McpPresetConnector } from '@orvilo/const';
import { cssVar } from 'antd-style';
import { CircleCheck, Loader2, SquareArrowOutUpRight } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  getActiveWorkspaceId,
  useActiveWorkspaceId,
} from '@/business/client/hooks/useActiveWorkspaceId';
import NavItem from '@/features/NavPanel/components/NavItem';
import { usePermission } from '@/hooks/usePermission';
import { electronSystemService } from '@/services/electron/system';
import { useToolStore } from '@/store/tool';
import { connectorSelectors } from '@/store/tool/slices/connector';
import type { ConnectorWithTools } from '@/store/tool/slices/connector/types';

import { connectLinearMcpPreset } from './connectLinearMcpPreset';

interface McpPresetItemProps {
  /**
   * The custom connector already pointing at this preset's endpoint, when one
   * exists. Linear starts OAuth from the row; GitHub opens token setup.
   */
  connector?: ConnectorWithTools;
  isSelected?: boolean;
  onAdd: () => void;
  onSelect: () => void;
  preset: McpPresetConnector;
}

/**
 * A row for a curated hosted MCP server (GitHub, Linear, Notion, …) in the
 * Connector settings list. Linear uses the connector's OAuth flow directly;
 * GitHub requires a user-provided token for its hosted MCP endpoint.
 */
const McpPresetItem = memo<McpPresetItemProps>(
  ({ preset, connector, isSelected, onAdd, onSelect }) => {
    const { t } = useTranslation('setting');
    const { allowed: canCreate, reason: createReason } = usePermission('create_content');
    const { allowed: canEdit, reason: editReason } = usePermission('edit_own_content');
    const [isConnecting, setIsConnecting] = useState(false);
    const activeWorkspaceId = useActiveWorkspaceId();
    const isListReady = useToolStore(connectorSelectors.isConnectorListReady(activeWorkspaceId));
    const createConnector = useToolStore((s) => s.createConnector);
    const startConnectorOAuth = useToolStore((s) => s.startConnectorOAuth);
    const fetchConnectors = useToolStore((s) => s.fetchConnectors);

    const isAdded = Boolean(connector);
    const isConnected = connector?.status === 'connected';

    const handleConnect = async () => {
      // Recheck at click time as well as render time: a workspace switch can
      // happen before React commits the disabled state for the new scope.
      const currentState = useToolStore.getState();
      if (!connectorSelectors.isConnectorListReady(getActiveWorkspaceId())(currentState)) return;
      const currentConnector = connectorSelectors
        .customConnectors(currentState)
        .find((candidate) => matchMcpPresetByConnector(candidate, [preset]));
      if (currentConnector?.status === 'connected') return;
      if (preset.id !== 'linear') {
        onAdd();
        return;
      }

      setIsConnecting(true);
      try {
        const result = await connectLinearMcpPreset(preset, currentConnector?.id, {
          createConnector,
          fetchConnectors,
          ...(isDesktop && {
            openExternalLink: (url: string) => electronSystemService.openExternalLink(url),
          }),
          startConnectorOAuth,
        });
        if (result.status === 'blocked') {
          toast.error(t('tools.mcpPreset.popupBlocked'));
        } else if (result.status === 'external') {
          toast.info(t('tools.mcpPreset.externalAuthPending'));
        } else if (result.status === 'success') {
          if (result.synced === false) toast.warning(t('tools.mcpPreset.syncFailed'));
          else toast.success(t('tools.mcpPreset.success'));
        } else if (result.status === 'error') {
          toast.error(
            t('tools.mcpPreset.authError', {
              reason: result.error || t('tools.mcpPreset.unknownError'),
            }),
          );
        } else if (result.status === 'dismissed') {
          toast.warning(t('tools.mcpPreset.cancelled'));
        }
      } catch (error) {
        toast.error(
          t('tools.mcpPreset.authError', {
            reason: error instanceof Error ? error.message : t('tools.mcpPreset.unknownError'),
          }),
        );
      } finally {
        setIsConnecting(false);
      }
    };

    const renderNavExtra = () => {
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
            disabled={!canCreate || !canEdit || !isListReady || isConnecting}
            size="small"
            type="text"
            icon={
              <Icon icon={isConnecting ? Loader2 : SquareArrowOutUpRight} spin={isConnecting} />
            }
            onClick={handleConnect}
          >
            {preset.id === 'github'
              ? t('tools.mcpPreset.tokenSetup')
              : t('tools.orviloSkill.connect')}
          </Button>
        </Tooltip>
      );
    };

    const renderNavIcon = () => {
      const { icon, label } = preset;
      if (typeof icon === 'string') return <Avatar alt={label} avatar={icon} size={18} />;
      return <Icon fill={cssVar.colorText} icon={icon} size={18} />;
    };

    return (
      <NavItem
        active={isSelected}
        extra={renderNavExtra()}
        icon={renderNavIcon}
        title={preset.label}
        titleColor={!isConnected ? cssVar.colorTextDescription : undefined}
        // Same contract as OrviloSkillItem: only added connectors open the
        // detail panel; otherwise the inline Connect button is the affordance.
        onClick={isAdded ? onSelect : undefined}
      />
    );
  },
);

McpPresetItem.displayName = 'McpPresetItem';

export default McpPresetItem;
