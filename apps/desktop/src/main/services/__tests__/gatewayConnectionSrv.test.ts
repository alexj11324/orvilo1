import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { App } from '@/core/App';

import GatewayConnectionService from '../gatewayConnectionSrv';

const sockets = vi.hoisted(() => [] as Array<{ close: ReturnType<typeof vi.fn> }>);

vi.mock('ws', () => {
  class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;

    close = vi.fn();
    off = vi.fn();
    on = vi.fn();
    once = vi.fn();
    readyState = FakeWebSocket.CONNECTING;
    send = vi.fn();

    constructor() {
      sockets.push(this);
    }
  }

  return { default: FakeWebSocket, WebSocket: FakeWebSocket };
});

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.0' },
  powerSaveBlocker: { isStarted: () => false, start: () => 1, stop: () => {} },
}));

const createService = () =>
  new GatewayConnectionService({
    browserManager: { broadcastToAllWindows: vi.fn() },
    storeManager: { get: vi.fn(), set: vi.fn() },
  } as unknown as App);

describe('GatewayConnectionService', () => {
  beforeEach(() => {
    sockets.length = 0;
  });

  it('leaves one open socket when two connects overlap', async () => {
    const service = createService();
    const tokens: Array<(token: string) => void> = [];
    service.setTokenProvider(
      () =>
        new Promise<string>((resolve) => {
          tokens.push(resolve);
        }),
    );

    // Sign-in and startup both connect; the second starts while the first is
    // still waiting on its token.
    const first = service.connect();
    const second = service.connect();

    await vi.waitFor(() => expect(tokens.length).toBeGreaterThan(0));
    tokens[0]('not-a-jwt');
    await vi.waitFor(() => expect(tokens.length).toBe(2));
    tokens[1]('not-a-jwt');
    await Promise.all([first, second]);

    // A client that is replaced without being closed keeps reconnecting with the
    // same connection id, and the two then evict each other once a second.
    const open = sockets.filter((socket) => socket.close.mock.calls.length === 0);
    expect(sockets).toHaveLength(2);
    expect(open).toHaveLength(1);

    await service.disconnect();
  });
});
