import type { InvalidateNotice, ServerActivityEvent } from './activity';
import type { CollaborationActor } from './actor';
import type { PresenceEntry, PresenceState } from './presence';
import type { CollaborationRoom } from './room';

// ── Client → Server ────────────────────────────────────

export interface ClientPresenceMessage {
  state: PresenceState;
  type: 'presence';
}

export interface ClientPingMessage {
  type: 'ping';
}

export type CollaborationClientMessage = ClientPingMessage | ClientPresenceMessage;

// ── Server → Client ────────────────────────────────────

export interface ServerSnapshotMessage {
  /** Activity history authorized for this room's audience. */
  activities: ServerActivityEvent[];
  connectionId: string;
  presence: PresenceEntry[];
  type: 'snapshot';
}

export interface ServerPresenceMessage {
  actor: CollaborationActor;
  connectionId: string;
  state: PresenceState;
  type: 'presence';
}

export interface ServerPresenceGoneMessage {
  connectionId: string;
  type: 'presence-gone';
}

export interface ServerActivityMessage {
  event: ServerActivityEvent;
  type: 'activity';
}

/**
 * Sent before the gateway drops a connection whose authorization was revoked
 * (member removed/suspended, delegation revoked). Presence TTL is the cleanup
 * path for dead sockets — this is the revocation path for live ones.
 */
export interface ServerRevokedMessage {
  reason: string;
  type: 'revoked';
}

export interface ServerPongMessage {
  type: 'pong';
}

export interface ServerInvalidateMessage extends InvalidateNotice {}

export type CollaborationServerMessage =
  | ServerActivityMessage
  | ServerInvalidateMessage
  | ServerPresenceGoneMessage
  | ServerPresenceMessage
  | ServerPongMessage
  | ServerRevokedMessage
  | ServerSnapshotMessage;

// ── Room ticket (authorize response → gateway proof) ───

export const COLLABORATION_TICKET_PURPOSE = 'collaboration-room' as const;
export const COLLABORATION_TICKET_ISSUER = 'urn:lobehub:internal' as const;
export const COLLABORATION_TICKET_AUDIENCE = 'urn:orvilo:collaboration-gateway' as const;

/** Claims the gateway re-verifies after RS256 validation. */
export interface RoomTicketClaims {
  actor: CollaborationActor;
  /** `workspace_members.authz_version` snapshot at issue time. */
  authzVersion?: number;
  /** Wire room key (`{scope}:{id}`). */
  room: string;
  workspaceId: string;
}

export interface RoomAuthorization {
  expiresAt: number;
  gatewayUrl: string;
  token: string;
}

// ── Outbox → gateway publish envelope ──────────────────

/**
 * What the server-side publish hook accepts. `broadcast` fans a room message
 * out verbatim; `kick` tears down every connection of one actor across the
 * workspace's rooms (revocation is workspace-scoped, not room-scoped).
 */
export type RoomPublishEnvelope =
  | { kind: 'broadcast'; message: CollaborationServerMessage }
  | { kind: 'kick'; reason: string; userId: string };

export interface RoomPublishRequest {
  publish: RoomPublishEnvelope;
  /** Wire room key. Kicks still name the workspace room they were projected for. */
  room: string;
}

// ── Polling snapshot (non-WS clients) ──────────────────

export interface RoomSnapshotResult {
  activities: ServerActivityEvent[];
  /** Opaque server cursor; pass back as `cursor` for the next incremental page. */
  nextCursor?: string;
  presence: PresenceEntry[];
}

/** Aggregate types the outbox projects onto rooms. */
export const COLLABORATION_AGGREGATE_SCOPES = ['project', 'task', 'workspace'] as const;
export type CollaborationAggregateScope = (typeof COLLABORATION_AGGREGATE_SCOPES)[number];

/** Mapping helper: an outbox aggregate routes to the room of the same scope. */
export const roomForAggregate = (
  scope: CollaborationAggregateScope,
  id: string,
): CollaborationRoom => ({ id, scope });
