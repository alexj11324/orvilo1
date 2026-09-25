// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getCollaborationStoreState } from '@/store/collaboration';

import {
  acquireRoomConnection,
  refreshCollaborationConnections,
  releaseRoomConnection,
} from './connection';

const { authorize, snapshotQuery, mutateMock } = vi.hoisted(() => ({
  authorize: vi.fn(),
  mutateMock: vi.fn(),
  snapshotQuery: vi.fn(),
}));

const { userState } = vi.hoisted(() => ({
  userState: { preference: { showInCollaboration: true } },
}));

vi.mock('@/store/user', () => ({ getUserStoreState: () => userState }));

vi.mock('@/features/Teammates/api/client', () => ({
  teammatesClient: {
    collaboration: {
      authorize: { mutate: authorize },
      snapshot: { query: snapshotQuery },
    },
  },
}));

vi.mock('@/business/client/hooks/useFetchWorkspaces', () => ({
  WORKSPACE_LIST_KEY: 'teammates:workspaces',
}));

vi.mock('@/libs/swr', () => ({ mutate: mutateMock }));

const room = { id: 'p-1', scope: 'project' as const };
const key = 'project:p-1';

const statusOf = () => getCollaborationStoreState().rooms[key]?.status;
const activitiesOf = () => getCollaborationStoreState().rooms[key]?.activities ?? {};

class MockWebSocket {
  static readonly CLOSED = 3;
  static readonly OPEN = 1;

  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onopen: (() => void) | null = null;
  readyState = MockWebSocket.OPEN;
  sent: string[] = [];

  constructor(public url: string) {
    sockets.push(this);
  }

  send = (data: string) => {
    this.sent.push(data);
  };

  close = () => {
    this.readyState = MockWebSocket.CLOSED;
  };

  /** Test-side socket events. */
  fireOpen = () => this.onopen?.();
  fireClose = () => {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  };
  fireMessage = (message: unknown) => this.onmessage?.({ data: JSON.stringify(message) });
}

const sockets: MockWebSocket[] = [];
const lastSocket = () => sockets.at(-1)!;

const ticket = {
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  gatewayUrl: 'wss://gateway.test/collaboration',
  token: 'ticket-1',
};

const activityEvent = (eventId: string) => ({
  action: 'task.update',
  actor: { id: 'agent-1', kind: 'agent' as const },
  entityVersion: 1,
  eventId,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  occurredAt: new Date().toISOString(),
  phase: 'committed' as const,
  projectId: 'p-1',
  target: { anchor: 'card' as const, entityId: 't-1', entityType: 'task' as const },
  workspaceId: 'ws-1',
});

const flush = async () => {
  // Let the authorize microtask chain settle.
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
};

describe('room connection authorize failures', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    authorize.mockReset();
    snapshotQuery.mockReset();
    mutateMock.mockReset();
    sockets.length = 0;
    userState.preference.showInCollaboration = true;
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    releaseRoomConnection(room);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('parks a permanent authorize failure instead of retrying forever', async () => {
    authorize.mockRejectedValue({ data: { code: 'BAD_REQUEST' } });

    acquireRoomConnection(room);
    await flush();

    expect(statusOf()).toBe('revoked');

    // Hours of backoff must not produce another authorize call.
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(authorize).toHaveBeenCalledTimes(1);
  });

  it.each(['FORBIDDEN', 'UNAUTHORIZED', 'NOT_FOUND'])(
    'treats %s as terminal — no reconnect loop',
    async (code) => {
      authorize.mockRejectedValue({ data: { code } });

      acquireRoomConnection(room);
      await flush();

      expect(statusOf()).toBe('revoked');
      await vi.advanceTimersByTimeAsync(60 * 1000);
      expect(authorize).toHaveBeenCalledTimes(1);
    },
  );

  it('keeps retrying transient failures', async () => {
    authorize.mockRejectedValue(new Error('socket hangup'));

    acquireRoomConnection(room);
    await flush();

    expect(statusOf()).toBe('reconnecting');

    await vi.advanceTimersByTimeAsync(60 * 1000);
    expect(authorize.mock.calls.length).toBeGreaterThan(1);
  });
});

describe('room presence lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    authorize.mockReset().mockResolvedValue(ticket);
    snapshotQuery.mockReset().mockResolvedValue({ activities: [], presence: [] });
    mutateMock.mockReset();
    sockets.length = 0;
    userState.preference.showInCollaboration = true;
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    releaseRoomConnection(room);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('publishes a baseline presence on open even when nothing was pushed yet', async () => {
    acquireRoomConnection(room);
    await flush();
    const socket = lastSocket();
    socket.fireOpen();

    // Presence-only consumers (the top-bar stack) never push a cursor — the
    // initial `{}` is what registers them in the room at all.
    expect(socket.sent).toContainEqual(JSON.stringify({ state: {}, type: 'presence' }));
  });

  it('heartbeat replays the last presence state instead of a bare ping', async () => {
    const publish = acquireRoomConnection(room);
    publish({ typing: true });
    await flush();
    const socket = lastSocket();
    socket.fireOpen();

    expect(socket.sent).toContainEqual(
      JSON.stringify({ state: { typing: true }, type: 'presence' }),
    );

    socket.sent.length = 0;
    await vi.advanceTimersByTimeAsync(15_000);

    // The gateway expires presence after 45s — resending the last state keeps
    // the entry alive without clobbering cursor/typing fields.
    expect(socket.sent).toContainEqual(
      JSON.stringify({ state: { typing: true }, type: 'presence' }),
    );
    expect(socket.sent.some((raw) => raw.includes('"ping"'))).toBe(false);
  });

  it('keeps receiving while the user hides their issue presence', async () => {
    userState.preference.showInCollaboration = false;
    const publish = acquireRoomConnection(room);
    publish({ selection: { entityId: 'task-1', entityType: 'task' } });
    await flush();
    const socket = lastSocket();
    socket.fireOpen();
    await vi.advanceTimersByTimeAsync(15_000);
    socket.fireMessage({
      actor: { id: 'other-user', kind: 'human' },
      connectionId: 'other-connection',
      state: { cursor: { entityId: 'task-2', entityType: 'task', u: 0.5, v: 0.5 } },
      type: 'presence',
    });

    expect(socket.sent).toEqual([]);
    expect(statusOf()).toBe('online');
    expect(getCollaborationStoreState().rooms[key]?.presence['other-connection']?.actor.id).toBe(
      'other-user',
    );
  });

  it('reauthorizes active rooms after the visibility preference changes', async () => {
    acquireRoomConnection(room);
    await flush();
    const oldSocket = lastSocket();
    oldSocket.fireOpen();

    userState.preference.showInCollaboration = false;
    refreshCollaborationConnections();
    await flush();
    const hiddenSocket = lastSocket();
    hiddenSocket.fireOpen();

    expect(oldSocket.readyState).toBe(MockWebSocket.CLOSED);
    expect(hiddenSocket).not.toBe(oldSocket);
    expect(hiddenSocket.sent).toEqual([]);
    expect(authorize).toHaveBeenCalledTimes(2);
  });
});

describe('server messages', () => {
  const connect = async () => {
    acquireRoomConnection(room);
    await flush();
    const socket = lastSocket();
    socket.fireOpen();
    await flush();
    return socket;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    authorize.mockReset().mockResolvedValue(ticket);
    snapshotQuery.mockReset().mockResolvedValue({ activities: [], presence: [] });
    mutateMock.mockReset();
    sockets.length = 0;
    userState.preference.showInCollaboration = true;
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    releaseRoomConnection(room);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('replays missed room activity after reconnect using the stored cursor', async () => {
    snapshotQuery.mockResolvedValue({
      activities: [activityEvent('evt-1')],
      nextCursor: 'cursor-1',
      presence: [],
    });

    let socket = await connect();
    expect(snapshotQuery).toHaveBeenCalledWith({ cursor: undefined, room });
    expect(activitiesOf()['evt-1']).toBeDefined();

    // Drop the socket and ride the backoff into a second connection — the
    // replay must resume from the cursor the first snapshot returned.
    socket.fireClose();
    await vi.advanceTimersByTimeAsync(60_000);
    socket = lastSocket();
    socket.fireOpen();
    await flush();

    expect(snapshotQuery).toHaveBeenLastCalledWith({ cursor: 'cursor-1', room });

    // The gateway's join snapshot hardcodes activities: [] — it must merge,
    // not wipe the replayed event.
    socket.fireMessage({ activities: [], connectionId: 'conn-2', presence: [], type: 'snapshot' });
    expect(activitiesOf()['evt-1']).toBeDefined();
  });

  it('routes workspace invalidate notices to the authz caches', async () => {
    const socket = await connect();
    socket.fireMessage({ entity: 'workspace', entityId: 'ws-1', type: 'invalidate' });
    await flush();

    expect(mutateMock).toHaveBeenCalledWith('teammates:workspaces');
    expect(mutateMock).toHaveBeenCalledWith(['teammates:members', { includeDeleted: false }]);
    expect(mutateMock).toHaveBeenCalledWith(['teammates:invitations']);
  });

  it('routes project invalidate notices to project caches + project members', async () => {
    const socket = await connect();
    socket.fireMessage({ entity: 'project', entityId: 'p-1', type: 'invalidate' });
    await flush();

    expect(mutateMock).toHaveBeenCalledWith(['teammates:projectMembers', 'p-1']);
    const matcher = mutateMock.mock.calls
      .map(([keyOrFn]) => keyOrFn)
      .find((candidate) => typeof candidate === 'function');
    expect(matcher).toBeDefined();
    expect(matcher!(['project/detail', 'scope', 'p-1'])).toBe(true);
    expect(matcher!(['task:list', 'x'])).toBe(false);
  });

  it('routes task invalidate notices to the whole task cache domain', async () => {
    const socket = await connect();
    socket.fireMessage({ entity: 'task', entityId: 't-1', type: 'invalidate' });
    await flush();

    const matcher = mutateMock.mock.calls[0]?.[0];
    expect(typeof matcher).toBe('function');
    expect(matcher(['task:list', 'agent-1', 'all'])).toBe(true);
    expect(matcher(['task:detail', 't-1'])).toBe(true);
    expect(matcher(['project/list', 'scope'])).toBe(false);
  });
});
