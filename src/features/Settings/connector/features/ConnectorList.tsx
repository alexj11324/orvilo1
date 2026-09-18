'use client';

import { Center, Empty } from '@lobehub/ui';
import { McpIcon } from '@lobehub/ui/icons';
import type { ComposioAppType, OrviloSkillProviderType } from '@orvilo/const';
import {
  getConnectorCatalog,
  RECOMMENDED_SKILLS,
  RecommendedSkillType,
  resolveConnectorCatalogItem,
} from '@orvilo/const';
import type { OrviloBuiltinTool } from '@orvilo/types';
import { createStaticStyles } from 'antd-style';
import isEqual from 'fast-deep-equal';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import type React from 'react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import { useFetchInstalledPlugins } from '@/hooks/useFetchInstalledPlugins';
import { serverConfigSelectors, useServerConfigStore } from '@/store/serverConfig';
import { useToolStore } from '@/store/tool';
import {
  builtinToolSelectors,
  composioStoreSelectors,
  orviloSkillStoreSelectors,
  pluginSelectors,
} from '@/store/tool/selectors';
import { ComposioServerStatus } from '@/store/tool/slices/composioStore';
import { connectorSelectors } from '@/store/tool/slices/connector';
import { OrviloSkillStatus } from '@/store/tool/slices/orviloSkillStore/types';

import AgentConnectorItem from './AgentConnectorItem';
import BuiltinSkillItem from './BuiltinSkillItem';
import ComposioSkillItem from './ComposioSkillItem';
import type { ConnectorDetailType } from './ConnectorDetail';
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
  onSelect: (identifier: string, type: ConnectorDetailType) => void;
  selectedIdentifier?: string;
}

/**
 * Connector inventory for the Connector settings master-detail layout.
 *
 * Every section here grants an agent API-level permissions: builtin tools,
 * MCP plugins (community and custom), OAuth connectors (Orvilo / Composio) and
 * agent-owned connectors. Platform skills — market, user-authored and builtin
 * prompt skills — are not connectors and are no longer listed anywhere.
 */
const ConnectorList = memo<ConnectorListProps>(({ onSelect, selectedIdentifier }) => {
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
  const allBuiltinTools = useToolStore((s) => s.builtinTools, isEqual);
  const uninstalledBuiltinTools = useToolStore(
    builtinToolSelectors.uninstalledBuiltinTools,
    isEqual,
  );

  const [useFetchOrviloSkillConnections, useFetchUserComposioConnections, useFetchUninstalled] =
    useToolStore((s) => [
      s.useFetchOrviloSkillConnections,
      s.useFetchUserComposioConnections,
      s.useFetchUninstalledBuiltinTools,
    ]);

  useFetchInstalledPlugins();
  // Keep each SWR handle so a failed fetch surfaces error + Retry instead
  // of a fake-empty list (each hook syncs into the store only on success).
  const orviloSkillsSWR = useFetchOrviloSkillConnections(isOrviloSkillEnabled);
  const composioSWR = useFetchUserComposioConnections(isComposioEnabled);
  const builtinToolsSWR = useFetchUninstalled(true);
  const connectorsError = orviloSkillsSWR.error ?? composioSWR.error ?? builtinToolsSWR.error;
  const reloadConnectors = () => {
    void orviloSkillsSWR.mutate();
    void composioSWR.mutate();
    void builtinToolsSWR.mutate();
  };

  // Load custom connectors (new connector store) so user-added OAuth MCP
  // connectors appear in the list.
  useEffect(() => {
    if (!isConnectorsInit) fetchConnectors();
  }, [isConnectorsInit, fetchConnectors]);

  // Load agent-owned connectors (across all agents) for the Agent Connectors
  // section.
  useEffect(() => {
    if (!isAgentBoundInit) fetchAgentBoundConnectors();
  }, [isAgentBoundInit, fetchAgentBoundConnectors]);

  const getOrviloSkillServerByProvider = useCallback(
    (providerId: string) => {
      return allOrviloSkillServers.find((server) => server.identifier === providerId);
    },
    [allOrviloSkillServers],
  );

  // Separate the inventory into three categories:
  // 1. Integrations (builtin tools plus Orvilo and Composio connectors)
  // 2. Community MCP Tools (type === 'plugin')
  // 3. Custom MCP Tools (type === 'customPlugin') and custom connectors
  const { integrations, communityMCPs, customMCPs } = useMemo(() => {
    // Local resolvers, derived from the props of this memo so the dependency
    // array stays exactly the values the computation reads.
    const getComposioServerByIdentifier = (identifier: string) =>
      allComposioServers.find((server) => server.identifier === identifier);
    const getBuiltinToolByIdentifier = (identifier: string) =>
      allBuiltinTools.find((tool) => tool.identifier === identifier);
    const isBuiltinToolInstalled = (identifier: string) =>
      !uninstalledBuiltinTools.includes(identifier);

    type IntegrationItem =
      | { builtinTool: OrviloBuiltinTool; type: 'builtin' }
      | { provider: OrviloSkillProviderType; type: 'orvilo' }
      | { serverType: ComposioAppType; type: 'composio' };

    const integrationItems: IntegrationItem[] = [];

    const addedBuiltinIds = new Set<string>();
    const addedConnectorIds = new Set<string>();
    const connectorAvailability = {
      composio: isComposioEnabled,
      orvilo: isOrviloSkillEnabled,
    };

    // If RECOMMENDED_SKILLS is configured, use it to build the list
    if (RECOMMENDED_SKILLS.length > 0) {
      for (const skill of RECOMMENDED_SKILLS) {
        if (skill.type === RecommendedSkillType.Builtin) {
          const builtinTool = getBuiltinToolByIdentifier(skill.id);
          if (builtinTool && !builtinTool.hidden) {
            integrationItems.push({ builtinTool, type: 'builtin' });
            addedBuiltinIds.add(skill.id);
          }
        } else {
          const connector = resolveConnectorCatalogItem(skill.id, connectorAvailability);
          if (connector && !addedConnectorIds.has(skill.id)) {
            integrationItems.push(connector);
            addedConnectorIds.add(skill.id);
          }
        }
      }

      // Also add installed builtin tools that are not in RECOMMENDED_SKILLS
      for (const tool of allBuiltinTools) {
        if (
          !tool.hidden &&
          isBuiltinToolInstalled(tool.identifier) &&
          !addedBuiltinIds.has(tool.identifier)
        ) {
          integrationItems.push({ builtinTool: tool, type: 'builtin' });
        }
      }

      // Add every remaining connector through the shared ownership resolver.
      // This keeps discovery complete without rendering one identifier through
      // both Orvilo and Composio authorization systems.
      for (const connector of getConnectorCatalog(connectorAvailability)) {
        const identifier =
          connector.type === 'orvilo' ? connector.provider.id : connector.serverType.identifier;
        if (!addedConnectorIds.has(identifier)) {
          integrationItems.push(connector);
          addedConnectorIds.add(identifier);
        }
      }
    } else {
      // Default behavior: add all non-hidden builtin tools
      for (const tool of allBuiltinTools) {
        if (!tool.hidden) {
          integrationItems.push({ builtinTool: tool, type: 'builtin' });
        }
      }

      integrationItems.push(...getConnectorCatalog(connectorAvailability));
    }

    // Sort integrations: installed/connected ones first
    const getIsConnected = (item: IntegrationItem) => {
      switch (item.type) {
        case 'builtin': {
          return isBuiltinToolInstalled(item.builtinTool.identifier);
        }
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
    const sortedIntegrations = integrationItems.sort((a, b) => {
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
      customMCPs: customPlugins,
      integrations: sortedIntegrations,
    };
  }, [
    installedPluginList,
    isOrviloSkillEnabled,
    isComposioEnabled,
    allComposioServers,
    allBuiltinTools,
    uninstalledBuiltinTools,
    getOrviloSkillServerByProvider,
  ]);

  const hasAnyConnectors =
    integrations.length > 0 ||
    communityMCPs.length > 0 ||
    customMCPs.length > 0 ||
    customConnectors.length > 0 ||
    agentBoundConnectors.length > 0;

  // A failed fetch must read as a failure with Retry, never as the "no
  // connectors" empty (error gated ahead of empty).
  if (connectorsError && !hasAnyConnectors) {
    return (
      <Center className={styles.container} paddingBlock={48}>
        <AsyncError error={connectorsError} variant={'block'} onRetry={reloadConnectors} />
      </Center>
    );
  }

  if (!hasAnyConnectors) {
    return (
      <Center className={styles.container} paddingBlock={48}>
        <Empty
          description={t('tab.connectorDesc')}
          icon={McpIcon}
          title={t('tab.connectorEmpty')}
        />
      </Center>
    );
  }

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
  const renderCustomConnectors = () =>
    customConnectors.map((c) => (
      <McpSkillItem
        isSelected={selectedIdentifier === c.identifier}
        key={c.id}
        title={c.name || c.identifier}
        onSelect={() => onSelect(c.identifier, 'mcp-connector')}
      />
    ));

  const builtinToolItems = integrations.filter((i) => i.type === 'builtin');
  const communitySkillItems = integrations.filter(
    (i) => i.type === 'orvilo' || i.type === 'composio',
  );

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

  const hasBuiltinTools = builtinToolItems.length > 0;
  const hasCommunityTools = communityMCPs.length > 0;
  const hasCustomConnectors = customMCPs.length > 0 || customConnectors.length > 0;
  // Orvilo/Composio OAuth connectors provide tools, so they sit with the
  // other tool-granting connectors.
  const hasCommunityConnectors = communitySkillItems.length > 0;
  const hasAgentConnectors = agentBoundConnectors.length > 0;

  return (
    <div className={styles.container}>
      {hasBuiltinTools &&
        renderSection(
          'builtinTools',
          t('skillGroup.builtinTools', 'Built-in Tools'),
          builtinToolItems.map((item) => {
            if (item.type !== 'builtin') return null;
            const localizedTitle = t(`tools.builtins.${item.builtinTool.identifier}.title`, {
              defaultValue: item.builtinTool.title || item.builtinTool.identifier,
            });
            return (
              <BuiltinSkillItem
                avatar={item.builtinTool.avatar}
                identifier={item.builtinTool.identifier}
                isSelected={selectedIdentifier === item.builtinTool.identifier}
                key={item.builtinTool.identifier}
                title={localizedTitle}
                onSelect={() => onSelect(item.builtinTool.identifier, 'builtin')}
              />
            );
          }),
        )}

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
