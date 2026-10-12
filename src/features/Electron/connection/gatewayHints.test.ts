import { describe, expect, it } from 'vitest';

import { resolveGatewayHints } from './gatewayHints';

const base = {
  connectionCount: 0,
  isConnected: true,
  isConnecting: false,
  workspaceConnectionState: 'disconnected' as const,
  workspaceScoped: true,
};

describe('resolveGatewayHints', () => {
  it('marks this device as connected in a workspace that lists no shared device', () => {
    expect(resolveGatewayHints(base)).toEqual({
      connection: { key: 'gateway.workspaceStatusDisconnected' },
      device: { key: 'gateway.statusConnected' },
      showConnectedDot: true,
    });
  });

  it('shows no dot while this device is disconnected, whatever the workspace reports', () => {
    const hints = resolveGatewayHints({
      ...base,
      connectionCount: 2,
      isConnected: false,
      workspaceConnectionState: 'connected',
    });

    expect(hints.showConnectedDot).toBe(false);
    expect(hints.device.key).toBe('gateway.statusDisconnected');
    expect(hints.connection).toEqual({ count: 2, key: 'gateway.workspaceStatusConnections' });
  });

  it('says the workspace device list is still loading instead of hiding the line', () => {
    expect(
      resolveGatewayHints({ ...base, workspaceConnectionState: 'connecting' }).connection,
    ).toEqual({ key: 'gateway.workspaceStatusLoading' });
  });

  it("reports this account's connections outside a workspace only when there are some", () => {
    const personal = { ...base, workspaceScoped: false };

    expect(resolveGatewayHints(personal).connection).toBeUndefined();
    expect(resolveGatewayHints({ ...personal, connectionCount: 1 }).connection).toEqual({
      count: 1,
      key: 'gateway.statusConnectedConnections',
    });
  });
});
