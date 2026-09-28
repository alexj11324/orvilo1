'use client';

import { createStaticStyles } from 'antd-style';
import isEqual from 'fast-deep-equal';
import { memo, useEffect, useState } from 'react';

import NavHeader from '@/features/NavHeader';
import { useToolStore } from '@/store/tool';
import {
  composioStoreSelectors,
  orviloSkillStoreSelectors,
  pluginSelectors,
} from '@/store/tool/selectors';
import { ComposioServerStatus } from '@/store/tool/slices/composioStore';
import { connectorSelectors } from '@/store/tool/slices/connector';
import { OrviloSkillStatus } from '@/store/tool/slices/orviloSkillStore/types';

import ConnectorDetailPanel, { type ConnectorDetailType } from './features/ConnectorDetail';
import LeftPanel from './features/LeftPanel';

export interface SelectedConnector {
  identifier: string;
  type: ConnectorDetailType;
}

const styles = createStaticStyles(({ css }) => ({
  detail: css`
    overflow-y: auto;
    flex: 1;
  `,
  root: css`
    overflow: hidden;
    display: flex;
    flex: 1;
    height: 100%;
  `,
}));

/**
 * The Connector settings master-detail surface.
 *
 * This used to be `ToolSettings` with a `viewMode: 'skill' | 'connector'` switch
 * shared with the platform skill-management page. That page is retired, so this
 * component no longer reads the skill stores (builtin / market / user skills),
 * no longer honours the `?skill=` deep link, and its detail panel only knows
 * connector kinds. Builtin tools are not listed here at all — they run with
 * allow-all permissions and carry no user-facing configuration.
 */
export const ConnectorSettings = memo(() => {
  const [selected, setSelected] = useState<SelectedConnector | null>(null);

  const allOrviloSkillServers = useToolStore(orviloSkillStoreSelectors.getServers, isEqual);
  const allComposioServers = useToolStore(composioStoreSelectors.getServers, isEqual);
  const customConnectors = useToolStore(connectorSelectors.customConnectors, isEqual);
  const installedPluginList = useToolStore(pluginSelectors.installedPluginMetaList, isEqual);
  const agentBoundConnectors = useToolStore(connectorSelectors.agentBoundConnectors, isEqual);

  // Auto-select the first row the list can actually show a detail for, in the
  // list's own section order: connected OAuth connector, then custom MCP
  // connector (a preset resolves to one of these), community plugin, legacy
  // custom plugin, then agent-owned connector.
  useEffect(() => {
    if (selected) {
      // The connector list is scope-bound and can refill when the workspace
      // context resolves — drop a selection whose row no longer exists so the
      // picker below re-runs instead of showing a phantom detail.
      const stillResolvable =
        allOrviloSkillServers.some((s) => s.identifier === selected.identifier) ||
        allComposioServers.some((s) => s.identifier === selected.identifier) ||
        customConnectors.some((c) => c.identifier === selected.identifier) ||
        installedPluginList.some((p) => p.identifier === selected.identifier) ||
        agentBoundConnectors.some((c) => c.id === selected.identifier);
      if (stillResolvable) return;
      setSelected(null);
    }

    const orviloConnected = allOrviloSkillServers.find(
      (server) => server.status === OrviloSkillStatus.CONNECTED,
    );
    if (orviloConnected) {
      setSelected({ identifier: orviloConnected.identifier, type: 'orvilo-connector' });
      return;
    }

    const composioActive = allComposioServers.find(
      (server) => server.status === ComposioServerStatus.ACTIVE,
    );
    if (composioActive) {
      setSelected({ identifier: composioActive.identifier, type: 'plugin' });
      return;
    }

    if (customConnectors[0]) {
      setSelected({ identifier: customConnectors[0].identifier, type: 'mcp-connector' });
      return;
    }

    const communityPlugin = installedPluginList.find((plugin) => plugin.type === 'plugin');
    if (communityPlugin) {
      setSelected({ identifier: communityPlugin.identifier, type: 'plugin' });
      return;
    }

    const customPlugin = installedPluginList.find((plugin) => plugin.type === 'customPlugin');
    if (customPlugin) {
      setSelected({ identifier: customPlugin.identifier, type: 'mcp-connector' });
      return;
    }

    if (agentBoundConnectors[0]) {
      setSelected({ identifier: agentBoundConnectors[0].id, type: 'agent-connector' });
    }
  }, [
    selected,
    allOrviloSkillServers,
    allComposioServers,
    customConnectors,
    installedPluginList,
    agentBoundConnectors,
  ]);

  return (
    <>
      <NavHeader />
      <div className={styles.root}>
        <LeftPanel
          selectedIdentifier={selected?.identifier}
          onSelect={(identifier, type) => setSelected({ identifier, type })}
        />

        {selected && (
          <div className={styles.detail}>
            <ConnectorDetailPanel
              identifier={selected.identifier}
              type={selected.type}
              onDelete={() => setSelected(null)}
            />
          </div>
        )}
      </div>
    </>
  );
});

ConnectorSettings.displayName = 'ConnectorSettings';

export default ConnectorSettings;
