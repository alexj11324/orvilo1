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
  /**
   * Project the room's resource belongs to: the project id for `project:*`
   * rooms and the owning project for `task:*` rooms. Lets a project-scoped
   * revocation reach the member's task-room sockets of the same project
   * without the gateway needing a database lookup.
   */
  projectId?: string;
  /** Wire room key (`{scope}:{id}`). */
  room: string;
  workspaceId: string;
}

export interface RoomAuthorization {
  /** ISO-8601 expiry of the minted ticket — clients `Date.parse` it. */
  expiresAt: string;
  gatewayUrl: string;
  token: string;
}

// ── Outbox → gateway publish envelope ──────────────────

/**
 * What the server-side publish hook accepts. `broadcast` fans a room message
 * out verbatim; `kick` tears down the revoked member's live connections for
 * one authorization scope — a workspace revoke drops every room of the
 * tenant, a project revoke drops only that project's room plus its task
 * rooms, a task revoke drops the single task room.
 */
export type RoomPublishEnvelope =
  | { kind: 'broadcast'; message: CollaborationServerMessage }
  | {
      /**
       * `workspace_members.authz_version` stamped by the revoking write. A
       * connection re-authorized at a NEWER version was granted after this
       * revoke and survives the kick — a late/replayed revoke must not tear
       * down a fresh grant. Absent means "apply to every version" (legacy).
       */
      authzVersion?: number;
      /** Originating outbox event id — observability/dedup correlation. */
      eventId?: string;
      kind: 'kick';
      reason: string;
      /** Resource scope the revocation applies to. */
      scope: 'project' | 'task' | 'workspace';
      /** Resource id inside the scope. */
      scopeId: string;
      userId: string;
      /** Tenant the kick applies to — guards cross-workspace accidents. */
      workspaceId: string;
    };

export interface RoomPublishRequest {
  publish: RoomPublishEnvelope;
  /** Wire room key — the room the event was projected for; the kick envelope itself carries the revocation scope. */
  room: string;
}

// ── Polling snapshot (non-WS clients) ──────────────────

export interface RoomSnapshotResult {
  /**
   * Activity history authorized for this room. Incremental pages (a `cursor`
   * was supplied) replay an overlap window behind the cursor on purpose — a
   * long-open transaction can commit a row whose `occurredAt` predates the
   * cursor — so the same `eventId` may be served twice. Consumers MUST dedup
   * on `eventId` (merge into an id-keyed map, not append).
   */
  activities: ServerActivityEvent[];
  /** Opaque server cursor; pass back as `cursor` for the next incremental page. */
  nextCursor?: string;
  presence: PresenceEntry[];
  /**
   * Set when the supplied cursor could not be decoded — the page is the
   * newest history slice and the consumer should treat it as a fresh resync
   * (re-baseline its dedup set), not as a continuation of the old position.
   */
  resyncRequired?: boolean;
}

/** Aggregate types the outbox projects onto rooms. */
export const COLLABORATION_AGGREGATE_SCOPES = ['project', 'task', 'workspace'] as const;
export type CollaborationAggregateScope = (typeof COLLABORATION_AGGREGATE_SCOPES)[number];

/** Mapping helper: an outbox aggregate routes to the room of the same scope. */
export const roomForAggregate = (
  scope: CollaborationAggregateScope,
  id: string,
): CollaborationRoom => ({ id, scope });
