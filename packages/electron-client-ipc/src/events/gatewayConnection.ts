export type GatewayConnectionStatus =
  'connected' | 'connecting' | 'disconnected' | 'reconnecting' | 'authenticating';

/**
 * Why this machine is (or is not) connected, in terms a user can act on.
 * `GatewayConnectionStatus` only describes the WebSocket; this explains the
 * conditions around it (disabled, signed out, registration rejected, ...).
 */
export type GatewayLocalPhase =
  | 'disabled'
  | 'notConfigured'
  | 'signInRequired'
  | 'registering'
  | 'registerFailed'
  | 'connecting'
  | 'connected'
  | 'gatewayUnreachable';

export interface GatewayLocalState {
  /** Epoch ms when the phase was recorded. */
  at: number;
  phase: GatewayLocalPhase;
  /** Short, token-free explanation for failure phases. */
  reason?: string;
}

export interface GatewayConnectionBroadcastEvents {
  gatewayConnectionStatusChanged: (params: {
    localState?: GatewayLocalState;
    status: GatewayConnectionStatus;
  }) => void;
}
