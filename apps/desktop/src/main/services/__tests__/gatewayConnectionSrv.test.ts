import { GatewayClient } from '@orvilo/device-gateway-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { App } from '@/core/App';

import GatewayConnectionService from '../gatewayConnectionSrv';

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
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('closes the earlier client when two connects overlap', async () => {
    // Stub the socket lifecycle on the real client so no connection is opened.
    const connect = vi.spyOn(GatewayClient.prototype, 'connect').mockResolvedValue();
    const disconnect = vi.spyOn(GatewayClient.prototype, 'disconnect').mockResolvedValue();

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
    const [earlier, later] = connect.mock.contexts;
    expect(connect).toHaveBeenCalledTimes(2);
    expect(disconnect.mock.contexts).toEqual([earlier]);
    expect(later).not.toBe(earlier);
  });
});
