import {
  COLLABORATION_GATEWAY_PROTOCOL_VERSION,
  GATEWAY_PROTOCOL_VERSION_HEADER,
} from '@orvilo/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRoomPublisher, gatewayConnectUrl, LOCAL_ROOM_BUS_KEY } from '../roomPublisher';

vi.mock('../ticket', () => ({
  signGatewayPublishToken: vi.fn(async () => 'publish-token'),
}));

const kick = (scope: 'project' | 'task' | 'workspace') =>
  ({
    kind: 'kick' as const,
    reason: 'project_member.removed',
    scope,
    scopeId: 'prj_1',
    userId: 'user-9',
    workspaceId: 'ws-1',
  }) as const;

const respond = (status: number, headers: Record<string, string> = {}) =>
  new Response('{}', { headers, status });

const currentHeaders = {
  [GATEWAY_PROTOCOL_VERSION_HEADER]: String(COLLABORATION_GATEWAY_PROTOCOL_VERSION),
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  delete (globalThis as Record<symbol, unknown>)[LOCAL_ROOM_BUS_KEY];
});

describe('httpRoomPublisher capability handshake', () => {
  it('delivers a project kick to a v2 gateway', async () => {
    const fetchMock = vi.fn(async () => respond(202, currentHeaders));
    vi.stubGlobal('fetch', fetchMock);

    const publisher = createRoomPublisher('http://gateway.test');
    await expect(publisher.publish('project:prj_1', kick('project'))).resolves.toBeUndefined();
  });

  it('treats a scoped-kick 202 without the version marker as undelivered — retryable', async () => {
    // A pre-v2 gateway acks the envelope but only executes workspace kicks —
    // throwing here is what keeps the outbox row pending until the fleet
    // upgrades instead of silently dropping the revocation.
    const fetchMock = vi.fn(async () => respond(202));
    vi.stubGlobal('fetch', fetchMock);

    const publisher = createRoomPublisher('http://gateway.test');
    await expect(publisher.publish('project:prj_1', kick('project'))).rejects.toThrow(
      'does not support project-scoped kicks',
    );
  });

  it.each(['1', 'abc'])('rejects a scoped-kick ack stamped with protocol %s', async (stamped) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respond(202, { [GATEWAY_PROTOCOL_VERSION_HEADER]: stamped })),
    );

    const publisher = createRoomPublisher('http://gateway.test');
    await expect(publisher.publish('task:task_1', kick('task'))).rejects.toThrow(
      'task-scoped kicks',
    );
  });

  it('lets workspace kicks through ungated — pre-v2 gateways executed them', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respond(202)),
    );

    const publisher = createRoomPublisher('http://gateway.test');
    await expect(publisher.publish('workspace:ws-1', kick('workspace'))).resolves.toBeUndefined();
  });

  it('broadcasts need no capability check', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respond(202)),
    );

    const publisher = createRoomPublisher('http://gateway.test');
    await expect(
      publisher.publish('project:prj_1', {
        kind: 'broadcast',
        message: { type: 'pong' },
      }),
    ).resolves.toBeUndefined();
  });

  it('delivers concealment only when the gateway proves v3 support', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respond(202, currentHeaders)),
    );

    const publisher = createRoomPublisher('http://gateway.test');
    await expect(
      publisher.setUserPresenceVisibility('user-9', false, 'hidden-epoch'),
    ).resolves.toBeUndefined();
  });

  it('rejects a concealment silently acked by an old gateway', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respond(202, { [GATEWAY_PROTOCOL_VERSION_HEADER]: '2' })),
    );

    const publisher = createRoomPublisher('http://gateway.test');
    await expect(
      publisher.setUserPresenceVisibility('user-9', false, 'hidden-epoch'),
    ).rejects.toThrow('does not support presence visibility control');
  });
});

describe('localRoomPublisher scoped kicks', () => {
  it('delivers scoped kicks through kickScoped when the bus supports it', async () => {
    const kickScoped = vi.fn();
    (globalThis as Record<symbol, unknown>)[LOCAL_ROOM_BUS_KEY] = {
      kick: vi.fn(),
      kickScoped,
      presence: () => [],
      publish: vi.fn(),
    };

    await createRoomPublisher('').publish('project:prj_1', kick('project'));

    expect(kickScoped).toHaveBeenCalledWith(
      'project:prj_1',
      expect.objectContaining({ scope: 'project', scopeId: 'prj_1', userId: 'user-9' }),
    );
  });

  it('fails a project kick closed when the bus lacks kickScoped — retryable, not silent', async () => {
    const legacyKick = vi.fn();
    (globalThis as Record<symbol, unknown>)[LOCAL_ROOM_BUS_KEY] = {
      kick: legacyKick,
      presence: () => [],
      publish: vi.fn(),
    };

    await expect(createRoomPublisher('').publish('project:prj_1', kick('project'))).rejects.toThrow(
      'project-scoped kicks',
    );
    expect(legacyKick).not.toHaveBeenCalled();
  });

  it('keeps workspace kicks on the legacy bus kick signature', async () => {
    const legacyKick = vi.fn();
    (globalThis as Record<symbol, unknown>)[LOCAL_ROOM_BUS_KEY] = {
      kick: legacyKick,
      presence: () => [],
      publish: vi.fn(),
    };

    await createRoomPublisher('').publish('workspace:ws-1', kick('workspace'));

    expect(legacyKick).toHaveBeenCalledWith('workspace:ws-1', 'user-9', 'project_member.removed');
  });

  it('conceals through a capable local bus', async () => {
    const setUserPresenceVisibility = vi.fn();
    (globalThis as Record<symbol, unknown>)[LOCAL_ROOM_BUS_KEY] = {
      kick: vi.fn(),
      presence: () => [],
      publish: vi.fn(),
      setUserPresenceVisibility,
    };

    await createRoomPublisher('').setUserPresenceVisibility('user-9', false, 'hidden-epoch');

    expect(setUserPresenceVisibility).toHaveBeenCalledWith('user-9', false, 'hidden-epoch');
  });

  it('fails concealment when an old local bus cannot enforce it', async () => {
    (globalThis as Record<symbol, unknown>)[LOCAL_ROOM_BUS_KEY] = {
      kick: vi.fn(),
      presence: () => [],
      publish: vi.fn(),
    };

    await expect(
      createRoomPublisher('').setUserPresenceVisibility('user-9', false, 'hidden-epoch'),
    ).rejects.toThrow('does not support presence visibility control');
  });

  it('conceals through the public gateway URL when no internal URL is set', async () => {
    // Deployments that expose only COLLABORATION_GATEWAY_PUBLIC_URL must still
    // deliver concealment — otherwise the toggle save rolls back every time.
    vi.stubEnv('COLLABORATION_GATEWAY_PUBLIC_URL', 'wss://gateway.example/collaboration');
    const fetchMock = vi.fn(async () => respond(202, currentHeaders));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createRoomPublisher('').setUserPresenceVisibility('user-9', false, 'hidden-epoch'),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://gateway.example/internal/publish',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('still fails concealment when the public gateway URL is not a ws endpoint', async () => {
    vi.stubEnv('COLLABORATION_GATEWAY_PUBLIC_URL', 'gateway.example/collaboration');

    await expect(
      createRoomPublisher('').setUserPresenceVisibility('user-9', false, 'hidden-epoch'),
    ).rejects.toThrow('conceal control is unavailable');
  });

  it('allows concealment to no-op when collaboration is disabled', async () => {
    vi.stubEnv('COLLABORATION_GATEWAY_PUBLIC_URL', '');
    vi.stubEnv('COLLABORATION_GATEWAY_URL', '');
    vi.stubEnv('NODE_ENV', 'production');

    await expect(
      createRoomPublisher('').setUserPresenceVisibility('user-9', false, 'hidden-epoch'),
    ).resolves.toBeUndefined();
  });

  it('routes the default development control to the standalone localhost gateway', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const fetchMock = vi.fn(async () => respond(202, currentHeaders));
    vi.stubGlobal('fetch', fetchMock);

    await createRoomPublisher().setUserPresenceVisibility('user-9', false, 'hidden-epoch');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3012/internal/publish',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('gatewayConnectUrl', () => {
  it('fails closed when only the internal http publish URL is configured', () => {
    // Deployments point COLLABORATION_GATEWAY_URL at the gateway's internal
    // HTTP base; that hostname is not dialable by browsers, so it must not be
    // minted into room tickets.
    vi.stubEnv('COLLABORATION_GATEWAY_URL', 'http://collaboration-gateway:3012');
    vi.stubEnv('COLLABORATION_GATEWAY_PUBLIC_URL', '');
    vi.stubEnv('NODE_ENV', 'production');

    expect(gatewayConnectUrl()).toBeNull();
  });

  it('returns the public ws endpoint when configured', () => {
    vi.stubEnv('COLLABORATION_GATEWAY_PUBLIC_URL', 'wss://orvilo.example.com/collaboration');
    vi.stubEnv('COLLABORATION_GATEWAY_URL', 'http://collaboration-gateway:3012');
    vi.stubEnv('NODE_ENV', 'production');

    expect(gatewayConnectUrl()).toBe('wss://orvilo.example.com/collaboration');
  });
});
