export type ConnectorSourceKind = 'builtin' | 'custom' | 'marketplace';

export interface ConnectorLifecycleInput {
  /** The connector record is enabled (Disconnect sets this to false). */
  isEnabled: boolean;
  sourceType: ConnectorSourceKind;
  /** Server-side authorization status, `connected` once OAuth completed. */
  status: string;
}

export interface ConnectorLifecycleActions {
  /** Offer a Connect entry — the connector exists but is not connected. */
  connect: boolean;
  /** Delete the connector record the user added. */
  delete: boolean;
  /** Revoke an active connection. Only meaningful while connected. */
  disconnect: boolean;
  /** Uninstall a builtin / marketplace tool. */
  uninstall: boolean;
}

export const isConnectorConnected = ({
  isEnabled,
  status,
}: Pick<ConnectorLifecycleInput, 'isEnabled' | 'status'>): boolean =>
  isEnabled && status === 'connected';

/**
 * Which lifecycle actions the detail pane may offer. They follow the same
 * connection state the list row uses, so a row that says "Connect" never opens
 * a pane that says "Disconnect".
 *
 * Only records in `custom` source are user-added connectors (Delete);
 * builtin and marketplace tools are installed, not authored (Uninstall).
 */
export const getConnectorLifecycleActions = (
  input: ConnectorLifecycleInput,
): ConnectorLifecycleActions => {
  const connected = isConnectorConnected(input);
  const isCustom = input.sourceType === 'custom';
  return {
    connect: isCustom && !connected,
    delete: isCustom,
    disconnect: isCustom && connected,
    uninstall: input.sourceType === 'builtin' || input.sourceType === 'marketplace',
  };
};
