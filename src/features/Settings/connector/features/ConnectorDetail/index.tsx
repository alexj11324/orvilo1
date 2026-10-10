'use client';

import { getComposioAppByIdentifier, getOrviloSkillProviderById } from '@orvilo/const';
import { agentDisplayName } from '@orvilo/types';
import isEqual from 'fast-deep-equal';
import { SquareArrowOutUpRight, Unplug, Wrench } from 'lucide-react';
import { lazy, memo, Suspense, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { confirmModal } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { ConnectorDetail, CustomConnectorModal } from '@/features/Connectors';
import { useSkillConnect } from '@/features/Connectors/useSkillConnect';
import { usePermission } from '@/hooks/usePermission';
import { useToolStore } from '@/store/tool';
import { composioStoreSelectors, orviloSkillStoreSelectors } from '@/store/tool/selectors';
import { ComposioServerStatus } from '@/store/tool/slices/composioStore';
import { connectorSelectors } from '@/store/tool/slices/connector';
import { OrviloSkillStatus } from '@/store/tool/slices/orviloSkillStore/types';
import { pluginSelectors } from '@/store/tool/slices/plugin/selectors';

import { type ConnectorDetailType, fromMcpPresetSelectionId } from '../connectorSelection';
import { type ConnectorPresetActions } from '../useConnectorPresetActions';
import { getNoPermissionsTitle } from './localization';
import NotConnectedDetail from './NotConnectedDetail';

// Lazy so `ConnectorDetail`'s static import graph stays free of the
// agent-navigation chain (`useNavigateToAgent` → chat store).
const AgentConnectorUsage = lazy(() => import('../AgentConnectorUsage'));
// Lazy for the same reason: the preset Connect flow pulls the workspace, host and OAuth modules.
const PresetConnectButton = lazy(() => import('./PresetConnectButton'));
const McpPresetDetail = lazy(() => import('./McpPresetDetail'));

export type { ConnectorDetailType };

interface ConnectorDetailProps {
  identifier: string;
  onDelete?: () => void;
  presetActions: ConnectorPresetActions;
  type: ConnectorDetailType;
}

interface OrviloConnectorActionProps {
  catalog?: 'composio' | 'orvilo';
  identifier: string;
  label: string;
  onDisconnected?: () => void;
}

/** Connect / Disconnect for an OAuth catalog connector (Orvilo or Composio). */
const OrviloConnectorAction = memo<OrviloConnectorActionProps>(
  ({ catalog = 'orvilo', identifier, label, onDisconnected }) => {
    const { t } = useTranslation('setting');
    const { allowed: canCreate } = usePermission('create_content');
    const { allowed: canEdit } = usePermission('edit_own_content');
    const { handleConnect, handleDisconnect, isConnected, isConnecting } = useSkillConnect({
      identifier,
      type: catalog,
    });

    const handleConfirmDisconnect = useCallback(() => {
      if (!canEdit) return;

      confirmModal({
        cancelText: t('cancel', { ns: 'common' }),
        content: t('tools.orviloSkill.disconnectConfirm.desc', { name: label }),
        okButtonProps: { danger: true },
        okText: t('tools.orviloSkill.disconnect'),
        onOk: async () => {
          const disconnected = await handleDisconnect();
          if (disconnected) onDisconnected?.();
        },
        title: t('tools.orviloSkill.disconnectConfirm.title', { name: label }),
      });
    }, [canEdit, handleDisconnect, label, onDisconnected, t]);

    if (isConnected) {
      return (
        <Button
          aria-busy={isConnecting}
          disabled={!canEdit || isConnecting}
          size="sm"
          variant="destructive"
          onClick={handleConfirmDisconnect}
        >
          {isConnecting && <Spinner />}
          <Unplug size={14} />
          {t('tools.orviloSkill.disconnect')}
        </Button>
      );
    }

    return (
      <Button
        aria-busy={isConnecting}
        disabled={!canCreate || !canEdit || isConnecting}
        size="sm"
        variant="outline"
        onClick={() => {
          if (!canCreate || !canEdit) return;
          handleConnect();
        }}
      >
        {isConnecting && <Spinner />}
        <SquareArrowOutUpRight size={14} />
        {t('tools.orviloSkill.connect')}
      </Button>
    );
  },
);

OrviloConnectorAction.displayName = 'OrviloConnectorAction';

/**
 * Right panel for the Settings > Connector master-detail layout.
 *
 * - 'builtin'/'plugin'/'mcp-connector': syncs the connector entry, renders the
 *   tool-permission editor
 * - 'orvilo-connector': the Orvilo OAuth connector lifecycle + permission editor
 * - 'agent-connector': an agent-owned connector, resolved from the agent-bound
 *   pool by id (agent connectors can share a slug with a base connector)
 */
const ConnectorDetailBody = memo<ConnectorDetailProps>(
  ({ identifier, type, onDelete, presetActions }) => {
    const { t: ts } = useTranslation('setting');

    const [syncing, setSyncing] = useState(false);
    const [noManifest, setNoManifest] = useState(false);
    const [migrateOpen, setMigrateOpen] = useState(false);

    const { allowed: canCreate } = usePermission('create_content');
    const { allowed: canEdit } = usePermission('edit_own_content');

    const syncBuiltinTool = useToolStore((s) => s.syncBuiltinTool);
    const syncPluginTools = useToolStore((s) => s.syncPluginTools);
    const syncToolsFromClient = useToolStore((s) => s.syncToolsFromClient);
    const fetchConnectors = useToolStore((s) => s.fetchConnectors);
    const connector = useToolStore(connectorSelectors.connectorByIdentifier(identifier));
    // For agent connectors the `identifier` slot carries the connector id; resolve
    // the row from the agent-bound pool to show its owning-agent usage block.
    const agentBoundConnector = useToolStore((s) =>
      type === 'agent-connector'
        ? (s.agentBoundConnectors ?? []).find((c) => c.id === identifier)
        : undefined,
    );

    // Legacy `user_installed_plugins` custom MCP that was never migrated to a
    // connector. Such a row has no `user_connectors` entry, so the panel falls
    // into the "no configurable permissions" empty state. We offer to upgrade it
    // in place via the connector migration flow instead of leaving a dead end.
    const legacyPlugin = useToolStore(pluginSelectors.getCustomPluginById(identifier), isEqual);
    const canMigrateLegacy =
      (type === 'mcp-connector' || type === 'plugin') && Boolean(legacyPlugin?.customParams?.mcp);

    // For orvilo-connector: get the server's tool list from the store
    const orviloServer = useToolStore(orviloSkillStoreSelectors.getServerByIdentifier(identifier));
    const orviloProvider =
      type === 'orvilo-connector' ? getOrviloSkillProviderById(identifier) : undefined;
    const orviloLabel =
      type === 'orvilo-connector'
        ? orviloProvider?.label || orviloServer?.name || identifier
        : identifier;

    const composioServer = useToolStore(composioStoreSelectors.getServerByIdentifier(identifier));
    const catalogConnected =
      orviloServer?.status === OrviloSkillStatus.CONNECTED ||
      composioServer?.status === ComposioServerStatus.ACTIVE;

    const noPermissionsTitle = getNoPermissionsTitle(identifier, type, ts);

    const renderOrviloConnectorAction = (onDisconnected?: () => void) => {
      if (type !== 'orvilo-connector') return undefined;

      return (
        <OrviloConnectorAction
          identifier={identifier}
          label={orviloLabel}
          onDisconnected={onDisconnected}
        />
      );
    };

    useEffect(() => {
      setNoManifest(false);
      const ensureConnector = async () => {
        setSyncing(true);
        try {
          if (type === 'builtin') {
            await syncBuiltinTool(identifier);
          } else if (type === 'orvilo-connector') {
            // Use tools from the orvilo skill server (already fetched via OAuth flow)
            const tools = (orviloServer?.tools ?? []).map((t) => ({
              description: t.description,
              inputSchema: t.inputSchema as Record<string, unknown>,
              toolName: t.name,
            }));
            if (tools.length === 0) {
              setNoManifest(true);
            } else {
              await syncToolsFromClient({
                identifier,
                name: orviloServer?.name || identifier,
                sourceType: 'marketplace',
                tools,
              });
            }
          } else if (type === 'plugin') {
            await syncPluginTools(identifier);
          } else {
            await fetchConnectors();
          }
        } catch {
          setNoManifest(true);
        } finally {
          setSyncing(false);
        }
      };

      ensureConnector();
    }, [
      fetchConnectors,
      identifier,
      orviloServer?.name,
      orviloServer?.tools,
      syncBuiltinTool,
      syncPluginTools,
      syncToolsFromClient,
      type,
    ]);

    // Agent-owned connector (unified settings): the `identifier` slot
    // carries the connector id (not the slug — agent connectors can share a slug
    // with a base connector). Reuse the same ConnectorDetail as base connectors so
    // tool-permission editing, sync and delete behave identically; it resolves the
    // row from the agent-bound pool via the id-aware connector selectors.
    if (type === 'agent-connector') {
      const usageAgentId = agentBoundConnector?.agentId;
      return (
        <ConnectorDetail
          connectorId={identifier}
          agentTitle={agentDisplayName({
            name: agentBoundConnector?.agentName,
            title: agentBoundConnector?.agentTitle,
          })}
          middleSlot={
            usageAgentId ? (
              <Suspense fallback={null}>
                <AgentConnectorUsage
                  agentId={usageAgentId}
                  agentTitle={agentDisplayName({
                    name: agentBoundConnector?.agentName,
                    title: agentBoundConnector?.agentTitle,
                  })}
                />
              </Suspense>
            ) : undefined
          }
          onDelete={onDelete}
        />
      );
    }

    // Connector types: builtin tool / plugin / mcp-connector / orvilo-connector
    if (syncing) {
      return (
        <div className="p-6">
          <div aria-busy="true" className="flex flex-col gap-3">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton className="h-4 w-full" key={index} />
            ))}
          </div>
        </div>
      );
    }

    const composioApp =
      type === 'plugin' && !connector ? getComposioAppByIdentifier(identifier) : undefined;
    const isCatalogEntry = type === 'orvilo-connector' || Boolean(composioApp);

    // A catalog connector that is listed but not connected: explain and offer Connect
    // (never Disconnect / Delete — there is nothing to revoke or remove yet).
    if ((noManifest || !connector) && isCatalogEntry && !catalogConnected && !canMigrateLegacy) {
      const catalog = type === 'orvilo-connector' ? 'orvilo' : 'composio';
      const label = type === 'orvilo-connector' ? orviloLabel : (composioApp?.label ?? identifier);
      return (
        <NotConnectedDetail
          action={<OrviloConnectorAction catalog={catalog} identifier={identifier} label={label} />}
          title={label}
        />
      );
    }

    if (noManifest || !connector) {
      return (
        <div className={'p-6 text-[14px] text-(--ant-color-text-tertiary)'}>
          <div className={'mbe-2 flex items-center justify-between gap-3'}>
            <div className={'text-[16px] font-semibold text-foreground'}>
              {type === 'orvilo-connector' ? orviloLabel : noPermissionsTitle}
            </div>
            {canMigrateLegacy ? (
              <Button
                disabled={!canCreate || !canEdit}
                size="sm"
                variant="default"
                onClick={() => {
                  if (!canCreate || !canEdit) return;
                  setMigrateOpen(true);
                }}
              >
                <Wrench size={14} />
                {ts('tools.legacyConnector.configure')}
              </Button>
            ) : (
              renderOrviloConnectorAction()
            )}
          </div>
          {canMigrateLegacy
            ? ts('tools.legacyConnector.upgradeDesc')
            : ts('tools.noConfigurablePermissions')}
          {canMigrateLegacy && legacyPlugin && (
            <CustomConnectorModal
              legacyPlugin={legacyPlugin}
              open={migrateOpen}
              onClose={() => setMigrateOpen(false)}
              onEditSuccess={async () => {
                setMigrateOpen(false);
                setNoManifest(false);
                // The migration created a `user_connectors` row keyed by the same
                // identifier; refresh so this panel resolves it and swaps to the
                // permission editor.
                await fetchConnectors();
              }}
            />
          )}
        </div>
      );
    }

    return (
      <ConnectorDetail
        connectorId={connector.id}
        lifecycleActions={renderOrviloConnectorAction(() => setNoManifest(true))}
        connectAction={
          type === 'mcp-connector' ? (
            <Suspense fallback={null}>
              <PresetConnectButton connector={connector} presetActions={presetActions} />
            </Suspense>
          ) : undefined
        }
        onDelete={onDelete}
      />
    );
  },
);

ConnectorDetailBody.displayName = 'ConnectorDetailBody';

const ConnectorDetailPanel = memo<ConnectorDetailProps>((props) => {
  const presetId =
    props.type === 'mcp-preset' ? fromMcpPresetSelectionId(props.identifier) : undefined;
  if (presetId) {
    return (
      <Suspense fallback={null}>
        <McpPresetDetail presetActions={props.presetActions} presetId={presetId} />
      </Suspense>
    );
  }
  return <ConnectorDetailBody {...props} />;
});

ConnectorDetailPanel.displayName = 'ConnectorDetailPanel';

export default ConnectorDetailPanel;
