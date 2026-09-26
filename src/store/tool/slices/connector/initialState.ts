import type { AgentBoundConnector, ConnectorWithTools } from './types';

export interface ConnectorState {
  /**
   * All agent-owned connectors across every agent in the current scope, for the
   * unified connector-settings page. Distinct from `agentConnectors`
   * (keyed per-agent, includes mounted rows) — this is the flat aggregate.
   */
  agentBoundConnectors: AgentBoundConnector[];
  /** Agent-scoped connectors (owned + mounted), keyed by agentId. */
  agentConnectors: Record<string, ConnectorWithTools[]>;
  agentConnectorsInit: Record<string, boolean>;
  connectorCreating: boolean;
  connectors: ConnectorWithTools[];
  /** Scope of the last accepted base connector list. Undefined means no list has loaded. */
  connectorsScopeId: string | null | undefined;
  connectorSyncing: Record<string, boolean>;
  isAgentBoundInit: boolean;
  isConnectorsInit: boolean;
}

export const initialConnectorState: ConnectorState = {
  agentBoundConnectors: [],
  agentConnectors: {},
  agentConnectorsInit: {},
  connectorCreating: false,
  connectors: [],
  connectorSyncing: {},
  connectorsScopeId: undefined,
  isAgentBoundInit: false,
  isConnectorsInit: false,
};
