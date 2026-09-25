'use client';

import type { ComposioAppType, McpPresetConnector, OrviloSkillProviderType } from '@orvilo/const';
import {
  getConnectorCatalog,
  matchMcpPresetByConnector,
  MCP_PRESET_CONNECTORS,
  RECOMMENDED_SKILLS,
  RecommendedSkillType,
  resolveConnectorCatalogItem,
} from '@orvilo/const';
import { createStaticStyles } from 'antd-style';
import isEqual from 'fast-deep-equal';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import type React from 'react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useFetchInstalledPlugins } from '@/hooks/useFetchInstalledPlugins';
import { serverConfigSelectors, useServerConfigStore } from '@/store/serverConfig';
import { useToolStore } from '@/store/tool';
import {
  composioStoreSelectors,
  orviloSkillStoreSelectors,
  pluginSelectors,
} from '@/store/tool/selectors';
import { ComposioServerStatus } from '@/store/tool/slices/composioStore';
import { connectorSelectors } from '@/store/tool/slices/connector';
import type { ConnectorWithTools } from '@/store/tool/slices/connector/types';
import { OrviloSkillStatus } from '@/store/tool/slices/orviloSkillStore/types';

import AgentConnectorItem from './AgentConnectorItem';
import ComposioSkillItem from './ComposioSkillItem';
import type { ConnectorDetailType } from './ConnectorDetail';
import McpPresetItem from './McpPresetItem';
import McpSkillItem from './McpSkillItem';
import OrviloSkillItem from './OrviloSkillItem';

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    display: flex;
    flex-direction: column;
    gap: 2px;
  `,
  sectionHeader: css`
    cursor: pointer;
    user-select: none;

    display: flex;
    gap: 4px;
    align-items: center;

    padding-block: 12px 4px;
    padding-inline: 4px;

    font-size: 12px;
    font-weight: 500;
    color: ${cssVar.colorTextSecondary};

    &:hover {
      color: ${cssVar.colorText};
    }
  `,
}));

interface ConnectorListProps {
  /** Opens the custom-connector form pre-filled with a preset's URL and auth. */
  onAddPreset: (preset: McpPresetConnector) => void;
  onSelect: (identifier: string, type: ConnectorDetailType) => void;
  selectedIdentifier?: string;
}

/**
 * Connector inventory for the Connector settings master-detail layout.
 *
 * Only OAuth and MCP surfaces live here: Orvilo/Composio OAuth connectors,
 * the curated hosted-MCP catalog, community/custom MCP tools and agent-owned
 * connectors. Builtin tools are intentionally absent — they always run with
 * allow-all permissions and are not user-configurable on this page.
 */
const ConnectorList = memo<ConnectorListProps>(({ onSelect, onAddPreset, selectedIdentifier }) => {
  const { t } = useTranslation('setting');
  const [collapsed, setCollapsed] = useState(() => new Set<string>());

  const isOrviloSkillEnabled = useServerConfigStore(serverConfigSelectors.enableOrviloSkill);
  const isComposioEnabled = useServerConfigStore(serverConfigSelectors.enableComposio);
  const allOrviloSkillServers = useToolStore(orviloSkillStoreSelectors.getServers, isEqual);
  const allComposioServers = useToolStore(composioStoreSelectors.getServers, isEqual);
  const installedPluginList = useToolStore(pluginSelectors.installedPluginMetaList, isEqual);
  const customConnectors = useToolStore(connectorSelectors.customConnectors, isEqual);
  const isConnectorsInit = useToolStore((s) => s.isConnectorsInit);
  const fetchConnectors = useToolStore((s) => s.fetchConnectors);
  const agentBoundConnectors = useToolStore(connectorSelectors.agentBoundConnectors, isEqual);
  const isAgentBoundInit = useToolStore((s) => s.isAgentBoundInit);
  const fetchAgentBoundConnectors = useToolStore((s) => s.fetchAgentBoundConnectors);
  const activeWorkspaceId = useActiveWorkspaceId();

  const [useFetchOrviloSkillConnections, useFetchUserComposioConnections] = useToolStore((s) => [
    s.useFetchOrviloSkillConnections,
    s.useFetchUserComposioConnections,
  ]);

  useFetchInstalledPlugins();
  useFetchOrviloSkillConnections(isOrviloSkillEnabled);
  useFetchUserComposioConnections(isComposioEnabled);

  // Load custom connectors (new connector store) so user-added OAuth MCP
  // connectors appear in the list. `connector.list` is scope-filtered, so a
  // fetch that resolved before the workspace id landed holds stale rows even
  // though `isConnectorsInit` latches — refetch whenever the scope changes.
  useEffect(() => {
    fetchConnectors();
  }, [activeWorkspaceId, fetchConnectors]);

  // Load agent-owned connectors (across all agents) for the Agent Connectors
  // section — likewise scope-filtered.
  useEffect(() => {
    fetchAgentBoundConnectors();
  }, [activeWorkspaceId, fetchAgentBoundConnectors]);

  const getOrviloSkillServerByProvider = useCallback(
    (providerId: string) => {
      return allOrviloSkillServers.find((server) => server.identifier === providerId);
    },
    [allOrviloSkillServers],
  );

  // Component scope, not memo scope: the rendered `ComposioSkillItem` below
  // resolves its server through this too, and a resolver defined inside the
  // memo is invisible to the JSX that renders the memo's output.
  const getComposioServerByIdentifier = useCallback(
    (identifier: string) => allComposioServers.find((server) => server.identifier === identifier),
    [allComposioServers],
  );

  // Separate the inventory into categories:
  // 1. OAuth connectors (Orvilo and Composio)
  // 2. Curated hosted MCP servers (presets — added ones resolve to a connector)
  // 3. Community MCP Tools (type === 'plugin')
  // 4. Custom MCP Tools (type === 'customPlugin') and custom connectors
  const { communitySkillItems, communityMCPs, customMCPs } = useMemo(() => {
    type ConnectorItem =
      | { provider: OrviloSkillProviderType; type: 'orvilo' }
      | { serverType: ComposioAppType; type: 'composio' };

    const connectorItems: ConnectorItem[] = [];

    const addedConnectorIds = new Set<string>();
    const connectorAvailability = {
      composio: isComposioEnabled,
      orvilo: isOrviloSkillEnabled,
    };

    // If RECOMMENDED_SKILLS is configured, use it to order the catalog; builtin
    // entries are skipped — builtin tools are not listed on this page.
    if (RECOMMENDED_SKILLS.length > 0) {
      for (const skill of RECOMMENDED_SKILLS) {
        if (skill.type === RecommendedSkillType.Builtin) continue;
        const connector = resolveConnectorCatalogItem(skill.id, connectorAvailability);
        if (connector && !addedConnectorIds.has(skill.id)) {
          connectorItems.push(connector);
          addedConnectorIds.add(skill.id);
        }
      }

      // Add every remaining connector through the shared ownership resolver.
      // This keeps discovery complete without rendering one identifier through
      // both Orvilo and Composio authorization systems.
      for (const connector of getConnectorCatalog(connectorAvailability)) {
        const identifier =
          connector.type === 'orvilo' ? connector.provider.id : connector.serverType.identifier;
        if (!addedConnectorIds.has(identifier)) {
          connectorItems.push(connector);
          addedConnectorIds.add(identifier);
        }
      }
    } else {
      connectorItems.push(...getConnectorCatalog(connectorAvailability));
    }

    // Sort connectors: connected ones first
    const getIsConnected = (item: ConnectorItem) => {
      switch (item.type) {
        case 'orvilo': {
          return (
            getOrviloSkillServerByProvider(item.provider.id)?.status === OrviloSkillStatus.CONNECTED
          );
        }
        case 'composio': {
          return (
            getComposioServerByIdentifier(item.serverType.identifier)?.status ===
            ComposioServerStatus.ACTIVE
          );
        }
      }
    };
    connectorItems.sort((a, b) => {
      const isConnectedA = getIsConnected(a);
      const isConnectedB = getIsConnected(b);

      if (isConnectedA && !isConnectedB) return -1;
      if (!isConnectedA && isConnectedB) return 1;
      return 0;
    });

    // Separate installed plugins into community and custom
    const communityPlugins = installedPluginList.filter((plugin) => plugin.type === 'plugin');
    const customPlugins = installedPluginList.filter((plugin) => plugin.type === 'customPlugin');

    return {
      communityMCPs: communityPlugins,
      communitySkillItems: connectorItems,
      customMCPs: customPlugins,
    };
  }, [
    installedPluginList,
    isOrviloSkillEnabled,
    isComposioEnabled,
    getOrviloSkillServerByProvider,
    getComposioServerByIdentifier,
  ]);

  // A preset that already has a connector shows Connected in the MCP section
  // and is removed from Custom Connectors below, so one logical connector
  // renders as one row.
  const presetConnectorMap = useMemo(() => {
    const map = new Map<string, ConnectorWithTools>();
    for (const connector of customConnectors) {
      const preset = matchMcpPresetByConnector(connector);
      if (preset && !map.has(preset.id)) map.set(preset.id, connector);
    }
    return map;
  }, [customConnectors]);

  const otherCustomConnectors = useMemo(
    () => customConnectors.filter((c) => !matchMcpPresetByConnector(c)),
    [customConnectors],
  );

  const renderCommunityMCPs = () =>
    communityMCPs.map((plugin) => (
      <McpSkillItem
        avatar={plugin.avatar}
        isSelected={selectedIdentifier === plugin.identifier}
        key={plugin.identifier}
        title={plugin.title || plugin.identifier}
        onSelect={() => onSelect(plugin.identifier, 'plugin')}
      />
    ));

  const renderCustomMCPs = () =>
    customMCPs.map((plugin) => (
      <McpSkillItem
        avatar={plugin.avatar}
        isSelected={selectedIdentifier === plugin.identifier}
        key={plugin.identifier}
        title={plugin.title || plugin.identifier}
        onSelect={() => onSelect(plugin.identifier, 'mcp-connector')}
      />
    ));

  // Custom connectors from the connector store (user-added OAuth MCP servers)
  // minus ones already represented by a preset row in the MCP section.
  const renderCustomConnectors = () =>
    otherCustomConnectors.map((c) => (
      <McpSkillItem
        isSelected={selectedIdentifier === c.identifier}
        key={c.id}
        title={c.name || c.identifier}
        onSelect={() => onSelect(c.identifier, 'mcp-connector')}
      />
    ));

  const toggleSection = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderSection = (key: string, label: string, children: React.ReactNode) => {
    const isCollapsed = collapsed.has(key);
    return (
      <>
        <div className={styles.sectionHeader} onClick={() => toggleSection(key)}>
          {isCollapsed ? <ChevronRightIcon size={10} /> : <ChevronDownIcon size={10} />}
          {label}
        </div>
        {!isCollapsed && children}
      </>
    );
  };

  const hasCommunityTools = communityMCPs.length > 0;
  const hasCustomConnectors = customMCPs.length > 0 || otherCustomConnectors.length > 0;
  // Orvilo/Composio OAuth connectors provide tools, so they sit with the
  // other tool-granting connectors.
  const hasCommunityConnectors = communitySkillItems.length > 0;
  const hasAgentConnectors = agentBoundConnectors.length > 0;

  return (
    <div className={styles.container}>
      {hasCommunityConnectors &&
        renderSection(
          'communityConnectors',
          t('skillGroup.communityConnectors', 'OAuth Connectors'),
          communitySkillItems.map((item) => {
            if (item.type === 'orvilo') {
              return (
                <OrviloSkillItem
                  isSelected={selectedIdentifier === item.provider.id}
                  key={item.provider.id}
                  provider={item.provider}
                  server={getOrviloSkillServerByProvider(item.provider.id)}
                  onSelect={() => onSelect(item.provider.id, 'orvilo-connector')}
                />
              );
            }
            return (
              <ComposioSkillItem
                isSelected={selectedIdentifier === item.serverType.identifier}
                key={item.serverType.identifier}
                server={getComposioServerByIdentifier(item.serverType.identifier)}
                serverType={item.serverType}
                onSelect={() => onSelect(item.serverType.identifier, 'plugin')}
              />
            );
          }),
        )}

      {renderSection(
        'mcpPresets',
        t('skillGroup.mcp', 'MCP'),
        MCP_PRESET_CONNECTORS.map((preset) => {
          const connector = presetConnectorMap.get(preset.id);
          return (
            <McpPresetItem
              connector={connector}
              isSelected={Boolean(connector) && selectedIdentifier === connector?.identifier}
              key={preset.id}
              preset={preset}
              onAdd={() => onAddPreset(preset)}
              onSelect={() => connector && onSelect(connector.identifier, 'mcp-connector')}
            />
          );
        }),
      )}

      {hasCommunityTools &&
        renderSection(
          'communityTools',
          t('skillGroup.communityTools', 'Community Tools'),
          renderCommunityMCPs(),
        )}

      {hasCustomConnectors &&
        renderSection(
          'customConnectors',
          t('skillGroup.customConnectors', 'Custom Connectors'),
          <>
            {renderCustomConnectors()}
            {renderCustomMCPs()}
          </>,
        )}

      {hasAgentConnectors &&
        renderSection(
          'agentConnectors',
          t('skillGroup.agentConnectors', 'Agent Connectors'),
          agentBoundConnectors.map((c) => (
            <AgentConnectorItem
              connector={c}
              isSelected={selectedIdentifier === c.id}
              key={c.id}
              onSelect={() => onSelect(c.id, 'agent-connector')}
            />
          )),
        )}
    </div>
  );
});

ConnectorList.displayName = 'ConnectorList';

export default ConnectorList;
