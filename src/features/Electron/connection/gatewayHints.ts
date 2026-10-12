interface GatewayHintsInput {
  connectionCount: number;
  isConnected: boolean;
  isConnecting: boolean;
  workspaceConnectionState: 'connected' | 'connecting' | 'disconnected' | 'unavailable';
  workspaceScoped: boolean;
}

type GatewayHintKey =
  | 'gateway.statusConnected'
  | 'gateway.statusConnectedConnections'
  | 'gateway.statusConnecting'
  | 'gateway.statusDisconnected'
  | 'gateway.workspaceStatusConnections'
  | 'gateway.workspaceStatusDisconnected'
  | 'gateway.workspaceStatusLoading'
  | 'gateway.workspaceStatusUnavailable';

export interface GatewayHint {
  count?: number;
  key: GatewayHintKey;
}

interface GatewayHints {
  /** Workspace devices in a workspace, this account's connections outside one. */
  connection?: GatewayHint;
  /**
   * This device's own connection: what the dot shows, in or out of a workspace.
   * An Agent can run on a private device that no workspace device list includes.
   */
  device: GatewayHint;
  /** The title-bar dot follows this device, not the workspace device list. */
  showConnectedDot: boolean;
}

const workspaceHint = (
  state: GatewayHintsInput['workspaceConnectionState'],
  count: number,
): GatewayHint => {
  switch (state) {
    case 'unavailable': {
      return { key: 'gateway.workspaceStatusUnavailable' };
    }
    case 'connecting': {
      return { key: 'gateway.workspaceStatusLoading' };
    }
    case 'connected': {
      return { count, key: 'gateway.workspaceStatusConnections' };
    }
    default: {
      return { key: 'gateway.workspaceStatusDisconnected' };
    }
  }
};

export const resolveGatewayHints = ({
  connectionCount,
  isConnected,
  isConnecting,
  workspaceConnectionState,
  workspaceScoped,
}: GatewayHintsInput): GatewayHints => ({
  connection: workspaceScoped
    ? workspaceHint(workspaceConnectionState, connectionCount)
    : isConnected && connectionCount
      ? { count: connectionCount, key: 'gateway.statusConnectedConnections' }
      : undefined,
  device: {
    key: isConnecting
      ? 'gateway.statusConnecting'
      : isConnected
        ? 'gateway.statusConnected'
        : 'gateway.statusDisconnected',
  },
  showConnectedDot: isConnected,
});
