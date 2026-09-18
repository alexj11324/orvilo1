'use client';

import { Button, confirmModal, Skeleton } from '@lobehub/ui/base-ui';
import { getOrviloSkillProviderById } from '@orvilo/const';
import { agentDisplayName } from '@orvilo/types';
import { createStaticStyles } from 'antd-style';
import isEqual from 'fast-deep-equal';
import { SquareArrowOutUpRight, Unplug, Wrench } from 'lucide-react';
import { lazy, memo, Suspense, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ConnectorDetail, CustomConnectorModal } from '@/features/Connectors';
import { useSkillConnect } from '@/features/Connectors/useSkillConnect';
import { usePermission } from '@/hooks/usePermission';
import { useToolStore } from '@/store/tool';
import { orviloSkillStoreSelectors } from '@/store/tool/selectors';
import { connectorSelectors } from '@/store/tool/slices/connector';
import { pluginSelectors } from '@/store/tool/slices/plugin/selectors';

import { getNoPermissionsTitle } from './localization';

// Lazy so `ConnectorDetail`'s static import graph stays free of the
// agent-navigation chain (`useNavigateToAgent` → chat store).
const AgentConnectorUsage = lazy(() => import('../AgentConnectorUsage'));

/**
 * The kinds of entry the Connector settings master-detail panel can render.
 *
 * Every member is a connector: a thing that grants an agent API-level
 * permissions. Prompt/agent skills are deliberately absent — they were part of
 * the retired platform skill-management product chain.
 */
export type ConnectorDetailType =
  'agent-connector' | 'builtin' | 'orvilo-connector' | 'mcp-connector' | 'plugin';

const styles = createStaticStyles(({ css, cssVar }) => ({
  noPermissions: css`
    padding: 24px;
    font-size: 14px;
    color: ${cssVar.colorTextTertiary};
  `,
  noPermissionsHeader: css`
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;

    margin-block-end: 8px;
  `,
  noPermissionsTitle: css`
    font-size: 16px;
    font-weight: 600;
    color: ${cssVar.colorText};
  `,
}));

interface ConnectorDetailProps {
  identifier: string;
  onDelete?: () => void;
  type: ConnectorDetailType;
}

interface OrviloConnectorActionProps {
  identifier: string;
  label: string;
  onDisconnected?: () => void;
}

const OrviloConnectorAction = memo<OrviloConnectorActionProps>(
  ({ identifier, label, onDisconnected }) => {
    const { t } = useTranslation('setting');
    const { allowed: canCreate } = usePermission('create_content');
    const { allowed: canEdit } = usePermission('edit_own_content');
    const { handleConnect, handleDisconnect, isConnected, isConnecting } = useSkillConnect({
      identifier,
      type: 'orvilo',
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
          danger
          disabled={!canEdit}
          icon={<Unplug size={14} />}
          loading={isConnecting}
          size="small"
          onClick={handleConfirmDisconnect}
        >
          {t('tools.orviloSkill.disconnect')}
        </Button>
      );
    }

    return (
      <Button
        disabled={!canCreate || !canEdit}
        icon={<SquareArrowOutUpRight size={14} />}
        loading={isConnecting}
        size="small"
        onClick={() => {
          if (!canCreate || !canEdit) return;
          handleConnect();
        }}
      >
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
const ConnectorDetailPanel = memo<ConnectorDetailProps>(({ identifier, type, onDelete }) => {
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
                agentAvatar={agentBoundConnector?.agentAvatar}
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
      <div style={{ padding: 24 }}>
        <Skeleton.Text rows={6} />
      </div>
    );
  }

  if (noManifest || !connector) {
    return (
      <div className={styles.noPermissions}>
        <div className={styles.noPermissionsHeader}>
          <div className={styles.noPermissionsTitle}>
            {type === 'orvilo-connector' ? orviloLabel : noPermissionsTitle}
          </div>
          {canMigrateLegacy ? (
            <Button
              disabled={!canCreate || !canEdit}
              icon={<Wrench size={14} />}
              size="small"
              type="primary"
              onClick={() => {
                if (!canCreate || !canEdit) return;
                setMigrateOpen(true);
              }}
            >
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
      onDelete={onDelete}
    />
  );
});

ConnectorDetailPanel.displayName = 'ConnectorDetailPanel';

export default ConnectorDetailPanel;
