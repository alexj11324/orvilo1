import { getComposioAppByIdentifier, getOrviloSkillProviderById } from '@orvilo/const';
import { PencilIcon, RefreshCwIcon, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { confirmModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ConnectorToolPermission } from '@/database/schemas';
import { ConnectorSourceType } from '@/database/schemas';
import { useResourceManageable } from '@/hooks/useResourceManageable';
import { useToolStore } from '@/store/tool';
import { connectorSelectors } from '@/store/tool/slices/connector';

import CustomConnectorModal from '../CustomConnectorModal';
import { getConnectorLifecycleActions } from './lifecycleActions';
import { getLocalizedConnectorDetail } from './localization';
import ToolPermissionGroup from './ToolPermissionGroup';

interface ConnectorDetailProps {
  /**
   * Title of the owning agent when this is an agent-dimension connector. Drives
   * the delete/uninstall confirmation copy — deleting an agent connector also
   * removes its tool from that agent.
   */
  agentTitle?: string | null;
  /**
   * Connect entry shown instead of Disconnect while a user-added connector is
   * not connected. The settings page supplies the flow that fits the connector
   * (e.g. the Linear / GitHub OAuth start); without one, none is offered.
   */
  connectAction?: ReactNode;
  connectorId: string;
  lifecycleActions?: ReactNode;
  /**
   * Extra content rendered between the description and the tool-permission list.
   * Used by the unified settings' agent connectors to show the owning agent +
   * a jump-to-use action.
   */
  middleSlot?: ReactNode;
  onDelete?: () => void;
}

/**
 * Tooltip wrapper for the manage gate. Disabled native buttons swallow hover
 * events, so the tooltip needs an enabled wrapper element to anchor on; when
 * there is no gate message, render children untouched.
 */
const ManageTooltip = ({ children, title }: { children: ReactNode; title?: string }) =>
  title ? (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex">{children}</span>} />
        <TooltipContent>{title}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : (
    children
  );

const ConnectorDetail = memo<ConnectorDetailProps>(
  ({ agentTitle, connectAction, connectorId, lifecycleActions, middleSlot, onDelete }) => {
    const { t } = useTranslation('tool');
    const { t: ts } = useTranslation('setting');

    const [customModalOpen, setCustomModalOpen] = useState(false);

    const connector = useToolStore(connectorSelectors.connectorById(connectorId));
    const { readTools, createTools, updateTools, deleteTools } = useToolStore(
      connectorSelectors.connectorToolsGrouped(connectorId),
    );
    const syncing = useToolStore(connectorSelectors.isSyncing(connectorId));

    const syncConnectorTools = useToolStore((s) => s.syncConnectorTools);
    const syncBuiltinTool = useToolStore((s) => s.syncBuiltinTool);
    const syncPluginTools = useToolStore((s) => s.syncPluginTools);
    const resetConnectorPermissions = useToolStore((s) => s.resetConnectorPermissions);
    const disconnectConnector = useToolStore((s) => s.disconnectConnector);
    const deleteConnector = useToolStore((s) => s.deleteConnector);
    const uninstallBuiltinTool = useToolStore((s) => s.uninstallBuiltinTool);
    const uninstallMCPPlugin = useToolStore((s) => s.uninstallMCPPlugin);
    const fetchConnectors = useToolStore((s) => s.fetchConnectors);
    const updateToolPermission = useToolStore((s) => s.updateToolPermission);

    const isMcpConnector = connector?.sourceType === ConnectorSourceType.custom;
    const isGitHubMcp =
      (connector?.metadata?.githubMcp as { type?: string } | undefined)?.type ===
      'github_user_connection';
    const isBuiltin = connector?.sourceType === ConnectorSourceType.builtin;
    const isMarketplace = connector?.sourceType === ConnectorSourceType.marketplace;

    // Only the creator or a workspace owner may manage this connector — the
    // server enforces the same rule, this keeps the UI honest about it.
    const canManage = useResourceManageable(connector?.userId);
    const manageTooltip = canManage
      ? undefined
      : t(
          'connector.manageOnlyCreator',
          'Only the creator or a workspace owner can manage this connector',
        );

    // Deleting/uninstalling revokes the user's authorization; spell out the
    // consequence. For an agent-owned connector it ALSO unpins the tool from
    // that agent (server-side, see `connector.delete`) — surface that instead.
    const deleteConfirmContent = isGitHubMcp
      ? t('connector.deleteGitHubMcpConfirmContent')
      : connector?.agentId
        ? t('connector.deleteAgentConfirmContent', {
            agent: agentTitle || t('connector.thisAgent', 'this agent'),
            defaultValue:
              'This connector belongs to the agent “{{agent}}”. Deleting it will also remove this tool from that agent.',
          })
        : t('connector.deleteAccountConfirmContent', {
            defaultValue:
              'This removes the connector and its authorization from your account. Any agent that uses it will need to be re-authorized afterwards.',
          });

    const notifyActionError = useCallback(
      (error: unknown) => {
        const httpStatus = (error as { data?: { httpStatus?: number } })?.data?.httpStatus;
        toast.error(
          httpStatus === 403
            ? t(
                'connector.manageOnlyCreator',
                'Only the creator or a workspace owner can manage this connector',
              )
            : t('connector.actionFailed', 'Operation failed, please try again'),
        );
      },
      [t],
    );

    // Custom connector sync hits the remote MCP server with stored credentials
    // and rewrites tool rows — creator/owner only (enforced server-side too).
    // Builtin/marketplace bootstrap syncs are no-ops for non-managers.
    const canSync = canManage || connector?.sourceType !== ConnectorSourceType.custom;

    const handleSync = useCallback(async () => {
      if (!connector) return;
      try {
        if (connector.sourceType === ConnectorSourceType.builtin) {
          await syncBuiltinTool(connector.identifier);
        } else if (connector.sourceType === ConnectorSourceType.marketplace) {
          await syncPluginTools(connector.identifier);
        } else {
          await syncConnectorTools(connectorId);
        }
      } catch (error) {
        notifyActionError(error);
      }
    }, [
      connector,
      connectorId,
      notifyActionError,
      syncBuiltinTool,
      syncPluginTools,
      syncConnectorTools,
    ]);

    const handleUninstall = () => {
      if (!connector) return;
      confirmModal({
        content: deleteConfirmContent,
        okButtonProps: { danger: true },
        onOk: async () => {
          try {
            if (isBuiltin) {
              await uninstallBuiltinTool(connector.identifier);
            } else if (isMarketplace) {
              await uninstallMCPPlugin(connector.identifier);
            }
            await deleteConnector(connectorId);
            onDelete?.();
          } catch (error) {
            notifyActionError(error);
          }
        },
        title: t('connector.uninstallConfirm', 'Uninstall this tool?'),
      });
    };

    if (!connector) return null;

    const lifecycle = getConnectorLifecycleActions({
      isEnabled: connector.isEnabled,
      sourceType: connector.sourceType as 'builtin' | 'custom' | 'marketplace',
      status: connector.status,
    });

    const orviloProvider = isMarketplace
      ? getOrviloSkillProviderById(connector.identifier)
      : undefined;
    const composioApp = isMarketplace
      ? getComposioAppByIdentifier(connector.identifier)
      : undefined;
    const { name: connectorName, description: connectorDescription } = getLocalizedConnectorDetail({
      composioApp,
      connector,
      orviloProvider,
      t: ts,
    });

    // Sync button label: re-sync tool list from manifest (does NOT reset permissions)
    const syncLabel =
      connector?.sourceType === ConnectorSourceType.custom
        ? t('connector.sync', 'Sync')
        : t('connector.refresh', 'Refresh');

    const hasTools =
      readTools.length > 0 ||
      createTools.length > 0 ||
      updateTools.length > 0 ||
      deleteTools.length > 0;

    const handlePermissionChange = async (toolId: string, permission: ConnectorToolPermission) => {
      try {
        await updateToolPermission(toolId, permission);
      } catch (error) {
        notifyActionError(error);
      }
    };

    const handleBatchPermission = async (
      toolIds: string[],
      permission: ConnectorToolPermission,
    ) => {
      try {
        await Promise.all(toolIds.map((id) => updateToolPermission(id, permission)));
      } catch (error) {
        notifyActionError(error);
      }
    };

    return (
      <div className={'flex h-full flex-col'}>
        {/* Header — full-bleed bar with bottom border, aligned with the left pane's header */}
        <div
          className={
            'flex h-10.5 shrink-0 items-center justify-between gap-2 border-be border-sidebar-border px-4'
          }
        >
          <div className={'text-[14px] font-medium'}>{connectorName}</div>
          <div className={'flex gap-2'}>
            {/* Reset permissions: restore all tools to auto (fully open) */}
            <ManageTooltip title={manageTooltip}>
              <Button
                disabled={!canManage}
                size="sm"
                onClick={async () => {
                  try {
                    await resetConnectorPermissions(connectorId);
                  } catch (error) {
                    notifyActionError(error);
                  }
                }}
              >
                {t('connector.resetPermissions', 'Reset permissions')}
              </Button>
            </ManageTooltip>
            {/* Sync/Refresh: re-sync tool list from manifest */}
            <ManageTooltip title={canSync ? undefined : manageTooltip}>
              <Button disabled={!canSync} loading={syncing} size="sm" onClick={handleSync}>
                <RefreshCwIcon data-icon="inline-start" size={14} />
                {syncLabel}
              </Button>
            </ManageTooltip>
            {/* Edit button for custom MCP connectors — only http type has a server URL to edit */}
            {isMcpConnector && !isGitHubMcp && connector?.mcpConnectionType === 'http' && (
              <ManageTooltip title={manageTooltip}>
                <Button disabled={!canManage} size="sm" onClick={() => setCustomModalOpen(true)}>
                  <PencilIcon data-icon="inline-start" size={14} />
                  {t('connector.edit', 'Edit')}
                </Button>
              </ManageTooltip>
            )}
            {lifecycleActions !== undefined ? (
              lifecycleActions
            ) : (
              <>
                {/* Connect / Disconnect follow the connection state; Delete is for connectors the user added */}
                {lifecycle.connect && connectAction}
                {lifecycle.disconnect && (
                  <ManageTooltip title={manageTooltip}>
                    <Button
                      disabled={!canManage}
                      size="sm"
                      variant="destructive"
                      onClick={async () => {
                        try {
                          await disconnectConnector(connectorId);
                        } catch (error) {
                          notifyActionError(error);
                        }
                      }}
                    >
                      {t('connector.disconnect', 'Disconnect')}
                    </Button>
                  </ManageTooltip>
                )}
                {lifecycle.delete && (
                  <>
                    <ManageTooltip title={manageTooltip}>
                      <Button
                        disabled={!canManage}
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          confirmModal({
                            content: deleteConfirmContent,
                            okButtonProps: { danger: true },
                            onOk: async () => {
                              try {
                                await deleteConnector(connectorId);
                                onDelete?.();
                              } catch (error) {
                                notifyActionError(error);
                              }
                            },
                            title: t('connector.deleteConfirm', 'Delete this connector?'),
                          });
                        }}
                      >
                        <Trash2 data-icon="inline-start" size={14} />
                        {t('connector.delete', 'Delete')}
                      </Button>
                    </ManageTooltip>
                  </>
                )}
                {/* Uninstall for builtin and marketplace tools */}
                {lifecycle.uninstall && (
                  <ManageTooltip title={manageTooltip}>
                    <Button
                      disabled={!canManage}
                      size="sm"
                      variant="destructive"
                      onClick={handleUninstall}
                    >
                      <Trash2 data-icon="inline-start" size={14} />
                      {t('connector.uninstall', 'Uninstall')}
                    </Button>
                  </ManageTooltip>
                )}
              </>
            )}
          </div>
        </div>

        {/* Body */}
        <div className={'flex min-h-0 flex-1 flex-col p-4'}>
          {/* Description */}
          {connectorDescription && (
            <div className={'mbe-4 text-[14px] leading-[1.6] text-muted-foreground'}>
              {connectorDescription}
            </div>
          )}

          {middleSlot}

          {hasTools ? (
            <div className={'flex-1 overflow-y-auto'}>
              <ToolPermissionGroup
                disabled={!canManage}
                label={t('connector.readOnlyTools', 'Read-only tools')}
                tools={readTools}
                onBatchPermission={handleBatchPermission}
                onPermissionChange={handlePermissionChange}
              />
              <ToolPermissionGroup
                disabled={!canManage}
                label={t('connector.createTools', 'Create tools')}
                tools={createTools}
                onBatchPermission={handleBatchPermission}
                onPermissionChange={handlePermissionChange}
              />
              <ToolPermissionGroup
                disabled={!canManage}
                label={t('connector.updateTools', 'Update tools')}
                tools={updateTools}
                onBatchPermission={handleBatchPermission}
                onPermissionChange={handlePermissionChange}
              />
              <ToolPermissionGroup
                disabled={!canManage}
                label={t('connector.deleteTools', 'Delete tools')}
                tools={deleteTools}
                onBatchPermission={handleBatchPermission}
                onPermissionChange={handlePermissionChange}
              />
            </div>
          ) : (
            <div className={'text-[14px] text-(--ant-color-text-tertiary)'}>
              {t('connector.noTools', 'No tool permissions to configure.')}
            </div>
          )}

          {/* Edit modal — only http connectors have a server URL to edit */}
          {isMcpConnector && !isGitHubMcp && connector?.mcpConnectionType === 'http' && (
            <CustomConnectorModal
              connectorId={connectorId}
              open={customModalOpen}
              onClose={() => setCustomModalOpen(false)}
              onEditSuccess={() => {
                fetchConnectors();
              }}
            />
          )}
        </div>
      </div>
    );
  },
);

ConnectorDetail.displayName = 'ConnectorDetail';

export default ConnectorDetail;
