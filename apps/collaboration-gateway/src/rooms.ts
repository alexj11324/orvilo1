import type {
  CollaborationActor,
  CollaborationServerMessage,
  PresenceEntry,
  PresenceState,
} from '@orvilo/types';

/** Semantic presence freshness — a client must re-publish within this window. */
export const PRESENCE_TTL_MS = 45_000;

/** How often the hub reaps expired presence entries. */
export const PRESENCE_SWEEP_MS = 5_000;

/**
 * One live socket, abstracted so the hub stays testable without a real `ws`.
 * `send`/`close` are the only socket operations the room contract needs.
 */
export interface GatewayConnection {
  actor: CollaborationActor;
  connectionId: string;
  /** Wire room key (`{scope}:{id}`) — immutable for the connection's life. */
  room: string;
  userId: string;
  workspaceId: string;
  close(code?: number, reason?: string): void;
  send(message: CollaborationServerMessage): void;
}

interface ConnState {
  connection: GatewayConnection;
  /** Last presence update (ms epoch); absence means the client never sent one. */
  lastPresenceAt?: number;
  state?: PresenceState;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Sanitize a client presence payload: the shape is open-ended by contract but
 * must stay a JSON object — the server never trusts actor fields inside it.
 */
const sanitizePresenceState = (value: unknown): PresenceState | null => {
  if (!isRecord(value)) return null;
  const state: PresenceState = {};
  if (isRecord(value.cursor)) state.cursor = value.cursor as PresenceState['cursor'];
  if (isRecord(value.selection)) state.selection = value.selection as PresenceState['selection'];
  if (typeof value.typing === 'boolean') state.typing = value.typing;
  return state;
};

/**
 * Room membership + ephemeral presence. All state is in-memory: presence is
 * ephemeral by design (reconnect rebuilds it), and room activity history lives
 * in the server outbox — the gateway never persists.
 */
export class RoomHub {
  /** room → connectionId → state. Presence rides on the same map. */
  private readonly rooms = new Map<string, Map<string, ConnState>>();

  private roomConns(room: string): Map<string, ConnState> {
    let conns = this.rooms.get(room);
    if (!conns) {
      conns = new Map();
      this.rooms.set(room, conns);
    }
    return conns;
  }

  /** Register a socket. Returns the room's current live presence entries. */
  join = (connection: GatewayConnection): PresenceEntry[] => {
    this.roomConns(connection.room).set(connection.connectionId, { connection });
    return this.presence(connection.room);
  };

  /**
   * Client `{type:'presence'}`: refresh the entry's TTL and fan the update out
   * to everyone else in the room (senders render their own cursor locally).
   * The broadcast actor always comes from the verified ticket, never the
   * client payload.
   */
  updatePresence = (connectionId: string, room: string, rawState: unknown, now = Date.now()) => {
    const state = sanitizePresenceState(rawState);
    if (!state) return;

    const conn = this.roomConns(room).get(connectionId);
    if (!conn) return;

    conn.lastPresenceAt = now;
    conn.state = state;

    this.broadcastExcept(room, connectionId, {
      actor: conn.connection.actor,
      connectionId,
      state,
      type: 'presence',
    });
  };

  /**
   * Socket teardown: drop the connection and tell the room its presence is
   * gone (only if it ever published one).
   */
  leave = (connectionId: string, room: string) => {
    const conns = this.rooms.get(room);
    const conn = conns?.get(connectionId);
    if (!conns || !conn) return;

    conns.delete(connectionId);
    if (conns.size === 0) this.rooms.delete(room);
    if (conn.lastPresenceAt !== undefined) {
      this.broadcast(room, { connectionId, type: 'presence-gone' });
    }
  };

  /** Live presence for a room — the join snapshot and `/internal/presence`. */
  presence = (room: string, now = Date.now()): PresenceEntry[] => {
    const conns = this.rooms.get(room);
    if (!conns) return [];
    const entries: PresenceEntry[] = [];
    for (const [connectionId, conn] of conns) {
      if (
        conn.state !== undefined &&
        conn.lastPresenceAt !== undefined &&
        now - conn.lastPresenceAt <= PRESENCE_TTL_MS
      ) {
        entries.push({
          actor: conn.connection.actor,
          connectionId,
          state: conn.state,
        });
      }
    }
    return entries;
  };

  /** Fan a server message out to every socket in the room. */
  broadcast = (room: string, message: CollaborationServerMessage) => {
    const conns = this.rooms.get(room);
    if (!conns) return;
    for (const conn of conns.values()) {
      this.safeSend(conn, message);
    }
  };

  private broadcastExcept = (
    room: string,
    exceptConnectionId: string,
    message: CollaborationServerMessage,
  ) => {
    const conns = this.rooms.get(room);
    if (!conns) return;
    for (const [connectionId, conn] of conns) {
      if (connectionId !== exceptConnectionId) this.safeSend(conn, message);
    }
  };

  /**
   * Revocation: drop EVERY connection of `userId` inside `workspaceId`'s rooms
   * (kicks are workspace-scoped, not room-scoped). Sends `revoked` first so
   * clients can distinguish a kick from a network drop before `close`.
   */
  kick = (workspaceId: string, userId: string, reason: string) => {
    for (const conns of this.rooms.values()) {
      for (const [connectionId, conn] of conns) {
        const { connection } = conn;
        if (connection.userId !== userId || connection.workspaceId !== workspaceId) continue;
        this.safeSend(conn, { reason, type: 'revoked' });
        try {
          connection.close(4401, 'authorization revoked');
        } catch {
          // A half-dead socket must not abort the remaining kicks.
        }
        conns.delete(connectionId);
      }
    }
  };

  /**
   * Presence TTL sweep: expired entries broadcast `presence-gone` but keep the
   * socket — a client that stopped moving its cursor is still connected.
   */
  sweepExpired = (now = Date.now()) => {
    for (const [room, conns] of this.rooms) {
      for (const [connectionId, conn] of conns) {
        if (conn.lastPresenceAt !== undefined && now - conn.lastPresenceAt > PRESENCE_TTL_MS) {
          conn.lastPresenceAt = undefined;
          conn.state = undefined;
          this.broadcast(room, { connectionId, type: 'presence-gone' });
        }
      }
    }
  };

  /** Total live sockets — for `/health` and tests. */
  get connectionCount() {
    let count = 0;
    for (const conns of this.rooms.values()) count += conns.size;
    return count;
  }

  private safeSend = (conn: ConnState, message: CollaborationServerMessage) => {
    try {
      conn.connection.send(message);
    } catch {
      // Dead sockets surface through 'close'; a failed send is not fatal.
    }
  };
}
