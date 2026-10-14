import { describe, expect, it } from 'vitest';

import { resolveGatewayHints } from './gatewayHints';

const base = {
  connectionCount: 0,
  connectionState: 'disconnected' as const,
  isConnected: true,
  isConnecting: false,
};

describe('resolveGatewayHints', () => {
  it('keeps the local connected dot when the inventory has zero connections', () => {
    expect(resolveGatewayHints(base)).toEqual({
      connection: { key: 'gateway.statusNoConnections' },
      device: { key: 'gateway.statusConnected' },
      showConnectedDot: true,
    });
  });

  it('shows the global count independently of the local connection', () => {
    const hints = resolveGatewayHints({
      ...base,
      connectionCount: 2,
      connectionState: 'connected',
      isConnected: false,
    });

    expect(hints.showConnectedDot).toBe(false);
    expect(hints.device.key).toBe('gateway.statusDisconnected');
    expect(hints.connection).toEqual({ count: 2, key: 'gateway.statusConnectedConnections' });
  });

  it.each([
    ['connecting', 'gateway.statusLoading'],
    ['unavailable', 'gateway.statusUnavailable'],
  ] as const)('reports global inventory state %s', (connectionState, key) => {
    expect(resolveGatewayHints({ ...base, connectionState }).connection).toEqual({ key });
  });

  it('returns a readable hint for the current caller even with zero connections', () => {
    const hints = resolveGatewayHints({ ...base, connectionState: 'connected' });

    expect(hints.connection.count).toBeUndefined();
    expect(hints.connection.key).toBe('gateway.statusNoConnections');
  });

  it('keeps the local connecting status independent of the inventory', () => {
    expect(resolveGatewayHints({ ...base, isConnected: false, isConnecting: true })).toEqual({
      connection: { key: 'gateway.statusNoConnections' },
      device: { key: 'gateway.statusConnecting' },
      showConnectedDot: false,
    });
  });
});
