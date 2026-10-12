interface GatewayHintsInput {
  connectionCount: number;
  connectionState: 'connected' | 'connecting' | 'disconnected' | 'unavailable';
  isConnected: boolean;
  isConnecting: boolean;
}

export interface GatewayHint {
  count?: number;
  key: 'gateway.statusConnectedConnections' | 'gateway.statusConnecting' | 'gateway.statusDisconnected' | 'gateway.statusLoading' | 'gateway.statusUnavailable';
}

export const resolveGatewayHints = ({connectionCount, connectionState, isConnected, isConnecting}: GatewayHintsInput): {connection:GatewayHint; showConnectedDot:boolean} => {
  const connected = isConnected || connectionState === 'connected';
  return {
    connection: isConnecting ? {key:'gateway.statusConnecting'}
      : connected ? {key:'gateway.statusConnectedConnections',count:Math.max(1,connectionCount)}
      : connectionState === 'unavailable' ? {key:'gateway.statusUnavailable'}
      : connectionState === 'connecting' ? {key:'gateway.statusLoading'}
      : {key:'gateway.statusDisconnected'},
    showConnectedDot: connected,
  };
};
