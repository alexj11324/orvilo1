import { isRecord } from '@orvilo/utils/object';

import { WORKSPACE_LIST_KEY } from '@/business/client/hooks/useFetchWorkspaces';
import { teammatesClient } from '@/features/Teammates/api/client';
import { teammatesKeys } from '@/features/Teammates/api/keys';
import { mutate } from '@/libs/swr';
import {
  type ClientMessage,
  type CollaborationRoom,
  getCollaborationStoreState,
  type PresenceState,
  roomKey,
  type ServerActivityEvent,
  type ServerMessage,
} from '@/store/collaboration';
import { getUserStoreState } from '@/store/user';

/**
 * Refcounted WebSocket lifecycle for collaboration rooms, kept outside React
 * so multiple mounted consumers (top-bar avatar stack + a task board) share
 * one socket per room and the last unmount tears it down.
 *
 * Lifecycle per room: authorize (fresh ticket every attempt) → connect →
 * snapshot → steady state. Reconnect uses capped exponential backoff and
 * ALWAYS re-authorizes — the ticket is short-lived, so replaying the old one
 * would just fail again. `revoked` tears the room down and refreshes the
 * member/workspace lists so the revoked state surfaces in real data, not just
 * in the presence layer.
 */

const HEARTBEAT_INTERVAL_MS = 15_000;
const PRUNE_INTERVAL_MS = 10_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_CAP_MS = 30_000;

interface RoomConnection {
  attempt: number;
  generation: number;
  heartbeatTimer?: ReturnType<typeof setInterval>;
  pendingPresence?: PresenceState;
  pruneTimer?: ReturnType<typeof setInterval>;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  refCount: number;
  room: CollaborationRoom;
  /** Opaque replay cursor from the last `collaboration.snapshot` response. */
  snapshotCursor?: string;
  socket?: WebSocket;
  ticketExpiresAt?: number;
}

const connections = new Map<string, RoomConnection>();

const sharesPresence = (): boolean => getUserStoreState().preference.showInCollaboration !== false;

const reconnectDelay = (attempt: number): number =>
  Math.min(RECONNECT_CAP_MS, RECONNECT_BASE_MS * 2 ** attempt) + Math.random() * 500;

const send = (record: RoomConnection, message: ClientMessage): void => {
  // Keep the receive socket alive when the user hides their issue presence.
  // The server-signed ticket enforces the same choice at the gateway.
  if (message.type === 'presence' && !sharesPresence()) return;
  const socket = record.socket;
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(message));
};

const refreshAuthzData = async (): Promise<void> => {
  await Promise.allSettled([
    mutate(WORKSPACE_LIST_KEY),
    mutate(teammatesKeys.members(false)),
    mutate(teammatesKeys.invitations()),
  ]);
};

/**
 * `invalidate` notices carry only `{entity, entityId}` — the authorized API is
 * the re-fetch path, so refresh every cached variant of the owning domain
 * instead of guessing which query shape holds the row. Cached keys are
 * `[root, ...]` (workspace id appended by augmentKey), so a root-prefix match
 * covers list, board and detail caches at once.
 */
const isTaskCacheKey = (key: unknown): boolean =>
  Array.isArray(key) && typeof key[0] === 'string' && key[0].startsWith('task:');

const isProjectCacheKey = (key: unknown): boolean =>
  Array.isArray(key) && typeof key[0] === 'string' && key[0].startsWith('project/');

const refreshForInvalidate = async (
  entity: 'project' | 'task' | 'workspace',
  entityId: string,
): Promise<void> => {
  if (entity === 'task') {
    await mutate(isTaskCacheKey);
    return;
  }
  if (entity === 'project') {
    await Promise.allSettled([
      mutate(isProjectCacheKey),
      mutate(teammatesKeys.projectMembers(entityId)),
    ]);
    return;
  }
  // workspace — member/invite/workspace changes; the project list can move too
  // when membership changes what this caller may see.
  await Promise.allSettled([refreshAuthzData(), mutate(isProjectCacheKey)]);
};

/** Replayed events arrive as `unknown[]` — an eventId is the dedup key. */
const isActivityEvent = (value: unknown): value is ServerActivityEvent =>
  isRecord(value) && typeof value.eventId === 'string' && typeof value.action === 'string';

/**
 * Replay outbox events that landed while the socket was down. The gateway's
 * join snapshot hardcodes `activities: []`, so history is recovered through
 * the authorized `collaboration.snapshot` endpoint with a per-room cursor —
 * each response advances the cursor so the next reconnect resumes where this
 * one stopped.
 */
const syncRoomSnapshot = async (
  key: string,
  record: RoomConnection,
  generation: number,
): Promise<void> => {
  try {
    const snapshot = await teammatesClient.collaboration.snapshot.query({
      cursor: record.snapshotCursor,
      room: record.room,
    });
    if (record.generation !== generation) return;
    record.snapshotCursor = snapshot.nextCursor ?? record.snapshotCursor;

    const store = getCollaborationStoreState();
    for (const event of snapshot.activities) {
      if (isActivityEvent(event)) store.applyActivity(key, event);
    }
  } catch (error) {
    if (record.generation !== generation) return;
    console.error('[Collaboration] snapshot replay failed', error);
  }
};

const teardown = (key: string, record: RoomConnection): void => {
  record.generation += 1;
  if (record.heartbeatTimer) clearInterval(record.heartbeatTimer);
  if (record.pruneTimer) clearInterval(record.pruneTimer);
  if (record.reconnectTimer) clearTimeout(record.reconnectTimer);
  record.heartbeatTimer = undefined;
  record.pruneTimer = undefined;
  record.reconnectTimer = undefined;
  const socket = record.socket;
  record.socket = undefined;
  if (socket && socket.readyState !== WebSocket.CLOSED) {
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
    socket.close();
  }
};

/**
 * Authorize failures that no retry can fix: the tenant context is missing,
 * the caller is not a member, or the room is gone. Retrying these just spams
 * the API forever — park the room instead.
 */
const PERMANENT_AUTHORIZE_CODES = new Set([
  'BAD_REQUEST',
  'FORBIDDEN',
  'NOT_FOUND',
  'UNAUTHORIZED',
]);

const isPermanentAuthorizeFailure = (error: unknown): boolean => {
  const code = (error as { data?: { code?: string } } | null)?.data?.code;
  return typeof code === 'string' && PERMANENT_AUTHORIZE_CODES.has(code);
};

const scheduleReconnect = (key: string, record: RoomConnection): void => {
  if (record.refCount <= 0 || record.reconnectTimer) return;
  getCollaborationStoreState().setRoomStatus(key, 'reconnecting');
  record.reconnectTimer = setTimeout(() => {
    record.reconnectTimer = undefined;
    void connect(key, record);
  }, reconnectDelay(record.attempt));
  record.attempt += 1;
};

const handleMessage = (key: string, record: RoomConnection, raw: string): void => {
  let message: ServerMessage;
  try {
    message = JSON.parse(raw) as ServerMessage;
  } catch {
    return;
  }

  const store = getCollaborationStoreState();
  const now = Date.now();

  switch (message.type) {
    case 'snapshot': {
      store.applySnapshot(
        key,
        {
          activities: message.activities,
          connectionId: message.connectionId,
          presence: message.presence,
        },
        now,
      );
      break;
    }
    case 'presence': {
      store.applyPresence(
        key,
        { actor: message.actor, connectionId: message.connectionId, state: message.state },
        now,
      );
      break;
    }
    case 'presence-gone': {
      store.applyPresenceGone(key, message.connectionId);
      break;
    }
    case 'activity': {
      store.applyActivity(key, message.event);
      break;
    }
    case 'invalidate': {
      // Deliberately payload-free: re-fetch through the authorized API so the
      // room's audience never learns entity details in-band.
      void refreshForInvalidate(message.entity, message.entityId);
      break;
    }
    case 'revoked': {
      teardown(key, record);
      store.setRoomStatus(key, 'revoked');
      // The membership grant behind this session is gone — refresh the real
      // data so the UI reflects it instead of trusting the closed channel.
      void refreshAuthzData();
      break;
    }
    case 'pong': {
      break;
    }
  }
};

const connect = async (key: string, record: RoomConnection): Promise<void> => {
  const generation = record.generation;
  const store = getCollaborationStoreState();
  const room = record.room;
  store.setRoomStatus(key, record.attempt > 0 ? 'reconnecting' : 'connecting');

  try {
    const ticket = await teammatesClient.collaboration.authorize.mutate({ room });
    if (record.generation !== generation) return; // torn down while authorizing

    const params = new URLSearchParams({ room: key, token: ticket.token });
    const url = `${ticket.gatewayUrl}?${params.toString()}`;
    const socket = new WebSocket(url);
    record.socket = socket;
    record.ticketExpiresAt = Date.parse(ticket.expiresAt) || undefined;

    socket.onopen = () => {
      if (record.generation !== generation) return;
      store.setRoomStatus(key, 'online');
      record.attempt = 0;
      // Always publish on open — even `{}` registers the connection so
      // presence-only consumers (the top-bar avatar stack) are visible to the
      // room, and the heartbeat below keeps the entry inside its TTL.
      send(record, { state: record.pendingPresence ?? {}, type: 'presence' });
      // Replay whatever the room missed while the socket was down.
      void syncRoomSnapshot(key, record, generation);
    };

    socket.onmessage = (event: MessageEvent<string>) => {
      if (record.generation !== generation) return;
      handleMessage(key, record, typeof event.data === 'string' ? event.data : '');
    };

    socket.onclose = () => {
      if (record.generation !== generation) return;
      if (record.socket === socket) record.socket = undefined;
      scheduleReconnect(key, record);
    };

    socket.onerror = () => {
      // The close event follows; reconnect policy lives there.
    };
  } catch (error) {
    if (record.generation !== generation) return;
    if (isPermanentAuthorizeFailure(error)) {
      // Terminal denial — same end state as a server `revoked`: no socket,
      // no reconnect loop, the room just stays unauthorized.
      teardown(key, record);
      store.setRoomStatus(key, 'revoked');
      // The grant behind this denial may be gone — refresh the real data so
      // member/workspace lists reflect it instead of trusting the dead room.
      void refreshAuthzData();
      return;
    }
    console.error('[Collaboration] authorize/connect failed', error);
    scheduleReconnect(key, record);
  }
};

/**
 * Attach to a room's shared connection. Returns a send function for presence
 * updates; `releaseRoomConnection` detaches and tears the socket down when
 * the last consumer leaves.
 */
export const acquireRoomConnection = (
  room: CollaborationRoom,
): ((state: PresenceState) => void) => {
  const key = roomKey(room);
  let record = connections.get(key);
  if (!record) {
    record = { attempt: 0, generation: 0, refCount: 0, room };
    connections.set(key, record);
  }
  record.refCount += 1;

  if (record.refCount === 1) {
    record.pruneTimer = setInterval(() => {
      getCollaborationStoreState().pruneRoom(key, Date.now());
    }, PRUNE_INTERVAL_MS);
    record.heartbeatTimer = setInterval(() => {
      // Re-send the LAST presence state rather than a bare ping: the gateway
      // expires presence after a 45s TTL, and the state is a wholesale replace
      // — resending `pendingPresence` keeps cursor/typing intact while keeping
      // cursor-less connections (top bar) registered.
      send(record!, { state: record!.pendingPresence ?? {}, type: 'presence' });
    }, HEARTBEAT_INTERVAL_MS);
    void connect(key, record);
  }

  return (state: PresenceState) => {
    record!.pendingPresence = state;
    send(record!, { state, type: 'presence' });
  };
};

export const releaseRoomConnection = (room: CollaborationRoom): void => {
  const key = roomKey(room);
  const record = connections.get(key);
  if (!record) return;

  record.refCount -= 1;
  if (record.refCount > 0) return;

  connections.delete(key);
  teardown(key, record);
  getCollaborationStoreState().clearRoom(key);
};

/** Reauthorize open rooms after the personal visibility setting is saved. */
export const refreshCollaborationConnections = (): void => {
  for (const [key, record] of connections) {
    if (record.refCount <= 0) continue;
    record.generation += 1;
    if (record.reconnectTimer) clearTimeout(record.reconnectTimer);
    record.reconnectTimer = undefined;
    const socket = record.socket;
    record.socket = undefined;
    if (socket && socket.readyState !== WebSocket.CLOSED) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      socket.close();
    }
    record.pendingPresence = undefined;
    record.attempt = 0;
    void connect(key, record);
  }
};

/** Escape hatch for tests and the revoked path. */
export const dropRoomConnection = (room: CollaborationRoom): void => {
  const key = roomKey(room);
  const record = connections.get(key);
  if (!record) return;
  connections.delete(key);
  teardown(key, record);
};
