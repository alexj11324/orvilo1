interface GatewayHintsInput {
  connectionCount: number;
  connectionState: 'connected' | 'connecting' | 'disconnected' | 'unavailable';
  isConnected: boolean;
  isConnecting: boolean;
}

type GatewayHintKey =
  | 'gateway.statusConnected'
  | 'gateway.statusConnectedConnections'
  | 'gateway.statusConnecting'
  | 'gateway.statusDisconnected'
  | 'gateway.statusLoading'
  | 'gateway.statusNoConnections'
  | 'gateway.statusUnavailable';

export interface GatewayHint {
  count?: number;
  key: GatewayHintKey;
}

interface GatewayHints {
  /** Connections across this account's device inventory. */
  connection: GatewayHint;
  /** This device's own connection, independent of the device inventory. */
  device: GatewayHint;
  /** The title-bar dot follows this device. */
  showConnectedDot: boolean;
}

const connectionHint = (
  state: GatewayHintsInput['connectionState'],
  count: number,
): GatewayHint => {
  switch (state) {
    case 'unavailable': {
      return { key: 'gateway.statusUnavailable' };
    }
    case 'connecting': {
      return { key: 'gateway.statusLoading' };
    }
    case 'connected': {
      return count > 0
        ? { count, key: 'gateway.statusConnectedConnections' }
        : { key: 'gateway.statusNoConnections' };
    }
    default: {
      return { key: 'gateway.statusNoConnections' };
    }
  }
};

export const resolveGatewayHints = ({
  connectionCount,
  connectionState,
  isConnected,
  isConnecting,
}: GatewayHintsInput): GatewayHints => ({
  connection: connectionHint(connectionState, connectionCount),
  device: {
    key: isConnecting
      ? 'gateway.statusConnecting'
      : isConnected
        ? 'gateway.statusConnected'
        : 'gateway.statusDisconnected',
  },
  showConnectedDot: isConnected,
});
