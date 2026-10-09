'use client';

import { isDesktop, matchMcpPresetByConnector, type McpPresetConnector } from '@orvilo/const';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  getActiveWorkspaceId,
  useActiveWorkspaceId,
} from '@/business/client/hooks/useActiveWorkspaceId';
import { toast } from '@/components/toast';
import { usePermission } from '@/hooks/usePermission';
import { useResourceManageable } from '@/hooks/useResourceManageable';
import { getHostPort } from '@/platform';
import { useToolStore } from '@/store/tool';
import { connectorSelectors } from '@/store/tool/slices/connector';
import type { ConnectorWithTools } from '@/store/tool/slices/connector/types';

import { connectLinearMcpPreset } from './connectLinearMcpPreset';

interface UseMcpPresetConnectOptions {
  /** A GitHub App authorization is in flight (owned by the GitHub connect hook). */
  connecting?: boolean;
  /** The connector already pointing at the preset's endpoint, if any. */
  connector?: ConnectorWithTools;
  /** Non-Linear presets: open the form (or the managed GitHub flow). */
  onAdd: () => void;
  preset: McpPresetConnector;
}

/**
 * The Connect action of a curated MCP preset, shared by the list row and the
 * detail pane so both start the same flow with the same permission gate.
 */
export const useMcpPresetConnect = ({
  connecting,
  connector,
  onAdd,
  preset,
}: UseMcpPresetConnectOptions) => {
  const { t } = useTranslation('setting');
  const { t: tt } = useTranslation('tool');
  const { allowed: canCreate, reason: createReason } = usePermission('create_content');
  const { allowed: canEdit, reason: editReason } = usePermission('edit_own_content');
  const canManage = useResourceManageable(connector?.userId);
  const [isConnecting, setIsConnecting] = useState(false);
  const activeWorkspaceId = useActiveWorkspaceId();
  const isListReady = useToolStore(connectorSelectors.isConnectorListReady(activeWorkspaceId));
  const createConnector = useToolStore((s) => s.createConnector);
  const startConnectorOAuth = useToolStore((s) => s.startConnectorOAuth);
  const fetchConnectors = useToolStore((s) => s.fetchConnectors);
  const updateConnector = useToolStore((s) => s.updateConnector);

  const busy = Boolean(isConnecting || connecting);
  const canConnect = canCreate && canEdit && canManage;
  const disabled = !canConnect || (preset.id === 'linear' && !isListReady) || busy;
  const disabledReason = !canManage
    ? tt('connector.manageOnlyCreator')
    : !canCreate
      ? createReason
      : editReason;

  const connect = async () => {
    if (preset.id !== 'linear') {
      onAdd();
      return;
    }

    // Recheck at click time as well as render time: a workspace switch can
    // happen before React commits the disabled state for the new scope.
    const currentState = useToolStore.getState();
    if (!connectorSelectors.isConnectorListReady(getActiveWorkspaceId())(currentState)) return;
    const currentConnector = connectorSelectors
      .customConnectors(currentState)
      .find((candidate) => matchMcpPresetByConnector(candidate, [preset]));
    if (currentConnector?.status === 'connected' && currentConnector.isEnabled) return;
    setIsConnecting(true);
    try {
      const result = await connectLinearMcpPreset(preset, currentConnector, {
        checkStatus: async (connectorId) => {
          await fetchConnectors();
          return (
            connectorSelectors.connectorById(connectorId)(useToolStore.getState())?.status ===
            'connected'
          );
        },
        createConnector,
        fetchConnectors,
        ...(isDesktop && {
          openExternalLink: async (url: string) => {
            await getHostPort().openExternal(url);
          },
        }),
        startConnectorOAuth,
        updateConnector,
      });
      if (result.status === 'blocked') {
        toast.error(t('tools.mcpPreset.popupBlocked'));
      } else if (result.status === 'external') {
        toast.info(t('tools.mcpPreset.externalAuthPending'));
      } else if (result.status === 'success') {
        if (result.synced === false) toast.warning(t('tools.mcpPreset.syncFailed'));
        else toast.success(t('tools.mcpPreset.success'));
        if (result.refreshFailed) toast.error(t('tools.mcpPreset.refreshFailed'));
      } else if (result.status === 'error') {
        toast.error(
          t('tools.mcpPreset.authError', {
            reason: result.error || t('tools.mcpPreset.unknownError'),
          }),
        );
      } else if (result.status === 'timed-out') {
        toast.warning(t('tools.mcpPreset.timedOut'));
      } else if (result.status === 'dismissed' || result.status === 'cancelled') {
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

  return { busy, connect, disabled, disabledReason };
};
