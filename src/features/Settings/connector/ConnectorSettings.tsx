'use client';

import {
  getComposioAppByIdentifier,
  getOrviloSkillProviderById,
  matchMcpPresetByConnector,
} from '@orvilo/const';
import isEqual from 'fast-deep-equal';
import { memo, useCallback, useEffect, useState } from 'react';

import { CustomConnectorModal } from '@/features/Connectors';
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

import ConnectorDetailPanel from './features/ConnectorDetail';
import {
  fromMcpPresetSelectionId,
  isSelectionResolvable,
  type SelectedConnector,
} from './features/connectorSelection';
import LeftPanel from './features/LeftPanel';
import { useConnectorPresetActions } from './features/useConnectorPresetActions';
import { visibleMcpPresets } from './features/visibleMcpPresets';

export type { SelectedConnector } from './features/connectorSelection';

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
  // Hoisted from the list so the detail pane offers the same Connect actions.
  const selectConnector = useCallback(
    (identifier: string) => setSelected({ identifier, type: 'mcp-connector' }),
    [],
  );
  const presetActions = useConnectorPresetActions(selectConnector);

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
      // A preset that gained a connector (the user just connected it) moves to
      // that connector's pane instead of staying on the not-connected one.
      const presetId =
        selected.type === 'mcp-preset' ? fromMcpPresetSelectionId(selected.identifier) : undefined;
      const presetConnector = presetId
        ? customConnectors.find(
            (c) => matchMcpPresetByConnector(c, visibleMcpPresets)?.id === presetId,
          )
        : undefined;
      if (presetConnector) {
        setSelected({ identifier: presetConnector.identifier, type: 'mcp-connector' });
        return;
      }

      // The connector list is scope-bound and can refill when the workspace
      // context resolves — drop a selection whose row no longer exists so the
      // picker below re-runs instead of showing a phantom detail. Rows that are
      // listed but not connected have no record yet and still count as rows.
      const stillResolvable = isSelectionResolvable(selected, {
        agentConnectorIds: agentBoundConnectors.map((c) => c.id),
        connectorIdentifiers: customConnectors.map((c) => c.identifier),
        isComposioCatalogId: (identifier) => Boolean(getComposioAppByIdentifier(identifier)),
        isOrviloCatalogId: (identifier) => Boolean(getOrviloSkillProviderById(identifier)),
        pluginIdentifiers: installedPluginList.map((p) => p.identifier),
        presetIds: visibleMcpPresets.map((preset) => preset.id),
        serverIdentifiers: [
          ...allOrviloSkillServers.map((server) => server.identifier),
          ...allComposioServers.map((server) => server.identifier),
        ],
      });
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
      <div className={'flex h-full flex-1 overflow-hidden'}>
        <LeftPanel
          presetActions={presetActions}
          selectedIdentifier={selected?.identifier}
          onSelect={(identifier, type) => setSelected({ identifier, type })}
        />

        {selected && (
          <div className={'flex-1 overflow-y-auto'}>
            <ConnectorDetailPanel
              identifier={selected.identifier}
              presetActions={presetActions}
              type={selected.type}
              onDelete={() => setSelected(null)}
            />
          </div>
        )}
      </div>
      <CustomConnectorModal
        open={presetActions.showForm}
        presetPlugin={presetActions.presetPlugin}
        onClose={presetActions.closeForm}
      />
    </>
  );
});

ConnectorSettings.displayName = 'ConnectorSettings';

export default ConnectorSettings;
