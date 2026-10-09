/**
 * Selection model of the Connector settings master-detail layout.
 *
 * Every row is selectable, including connectors that are not connected yet:
 * their detail pane is where the Connect action and the explanation live, so
 * a click on a row can never be a silent no-op.
 */
export type ConnectorDetailType =
  'agent-connector' | 'builtin' | 'mcp-connector' | 'mcp-preset' | 'orvilo-connector' | 'plugin';

export interface SelectedConnector {
  identifier: string;
  type: ConnectorDetailType;
}

const MCP_PRESET_PREFIX = 'mcp-preset:';

/**
 * A curated MCP preset that has no connector yet is selected by its preset id,
 * namespaced because ids such as `github` are shared with the OAuth catalog.
 */
export const toMcpPresetSelectionId = (presetId: string): string =>
  `${MCP_PRESET_PREFIX}${presetId}`;

export const fromMcpPresetSelectionId = (identifier: string): string | undefined =>
  identifier.startsWith(MCP_PRESET_PREFIX) ? identifier.slice(MCP_PRESET_PREFIX.length) : undefined;

export interface ConnectorSelectionSources {
  /** Ids of agent-owned connectors. */
  agentConnectorIds: readonly string[];
  /** Identifiers of every connector in the connector store. */
  connectorIdentifiers: readonly string[];
  /** Whether the identifier is a Composio catalog entry the list offers. */
  isComposioCatalogId: (identifier: string) => boolean;
  /** Whether the identifier is an Orvilo catalog entry the list offers. */
  isOrviloCatalogId: (identifier: string) => boolean;
  /** Identifiers of installed community / custom plugins. */
  pluginIdentifiers: readonly string[];
  /** Ids of the curated MCP presets the list offers. */
  presetIds: readonly string[];
  /** Identifiers of connected or pending Orvilo / Composio servers. */
  serverIdentifiers: readonly string[];
}

/**
 * Whether the selected row still exists in the list. A not-connected catalog
 * entry has no server or connector record, yet it is a real row — treating it
 * as gone would bounce the selection straight back to the first connected row.
 */
export const isSelectionResolvable = (
  selected: SelectedConnector,
  sources: ConnectorSelectionSources,
): boolean => {
  const { identifier, type } = selected;
  switch (type) {
    case 'agent-connector': {
      return sources.agentConnectorIds.includes(identifier);
    }
    case 'mcp-preset': {
      const presetId = fromMcpPresetSelectionId(identifier);
      return presetId !== undefined && sources.presetIds.includes(presetId);
    }
    case 'orvilo-connector': {
      return (
        sources.serverIdentifiers.includes(identifier) || sources.isOrviloCatalogId(identifier)
      );
    }
    case 'plugin': {
      return (
        sources.serverIdentifiers.includes(identifier) ||
        sources.pluginIdentifiers.includes(identifier) ||
        sources.isComposioCatalogId(identifier)
      );
    }
    default: {
      return (
        sources.connectorIdentifiers.includes(identifier) ||
        sources.pluginIdentifiers.includes(identifier)
      );
    }
  }
};
