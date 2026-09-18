// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OrviloDatabase } from '@/database/type';

import { gatewayConnectUrl } from '../roomPublisher';
import { CollaborationService } from '../service';

describe('gatewayConnectUrl', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('prefers the public URL, then the internal URL', () => {
    vi.stubEnv('COLLABORATION_GATEWAY_PUBLIC_URL', 'wss://gw.example.com/collab');
    vi.stubEnv('COLLABORATION_GATEWAY_URL', 'http://gateway-internal:3012');
    expect(gatewayConnectUrl()).toBe('wss://gw.example.com/collab');

    // An empty-string env counts as unset, not as a URL.
    vi.stubEnv('COLLABORATION_GATEWAY_PUBLIC_URL', '');
    expect(gatewayConnectUrl()).toBe('http://gateway-internal:3012');
  });

  it('falls back to localhost only in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('COLLABORATION_GATEWAY_PUBLIC_URL', '');
    vi.stubEnv('COLLABORATION_GATEWAY_URL', '');
    expect(gatewayConnectUrl()).toBe('ws://localhost:3012/collaboration');
  });

  it('returns null when unconfigured outside development', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('COLLABORATION_GATEWAY_PUBLIC_URL', '');
    vi.stubEnv('COLLABORATION_GATEWAY_URL', '');
    expect(gatewayConnectUrl()).toBeNull();
  });
});

describe('CollaborationService.authorize', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('fails closed when no gateway is configured', async () => {
    // Regression: the old localhost fallback would mint a ticket that sends a
    // production browser to a WebSocket on the user's own machine. The check
    // precedes any authz work, so the stub db is never touched.
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('COLLABORATION_GATEWAY_PUBLIC_URL', '');
    vi.stubEnv('COLLABORATION_GATEWAY_URL', '');
    const service = new CollaborationService({} as OrviloDatabase, 'user-1', 'ws-1');
    await expect(service.authorize({ id: 'ws-1', scope: 'workspace' })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: 'collaboration gateway not configured',
    });
  });
});
