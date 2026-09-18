/**
 * WebSocket protocol contract shared with the collaboration gateway slice.
 * These mirror the agreed wire shapes exactly — keep field names in sync with
 * the backend contract, not with local naming preferences.
 */

export type CollaborationActorKind = 'agent' | 'human' | 'system';

export interface CollaborationActor {
  avatar?: string;
  color?: string;
  id: string;
  kind: CollaborationActorKind;
  name?: string;
  onBehalfOfUserId?: string;
}

export interface PresenceCursorState {
  anchor?: string;
  entityId: string;
  entityType: string;
  u: number;
  v: number;
  viewKey?: string;
}

export interface PresenceSelectionState {
  anchor?: string;
  entityId: string;
  entityType: string;
}

export interface PresenceState {
  cursor?: PresenceCursorState;
  selection?: PresenceSelectionState;
  typing?: boolean;
}

export type ActivityPhase = 'committed' | 'failed' | 'proposed' | 'started';

export interface SemanticTarget {
  anchor: 'assignee' | 'card' | 'delivery' | 'dependencies' | 'status';
  entityId: string;
  entityType: 'project' | 'task';
}

export interface ServerActivityEvent {
  action: string;
  actor: CollaborationActor;
  entityVersion: number;
  eventId: string;
  expiresAt: string;
  occurredAt: string;
  phase: ActivityPhase;
  projectId: string;
  target: SemanticTarget;
  taskTopicId?: string;
  workspaceId: string;
}

export type CollaborationRoomScope = 'project' | 'task' | 'workspace';

export interface CollaborationRoom {
  id: string;
  scope: CollaborationRoomScope;
}

export const roomKey = (room: CollaborationRoom): string => `${room.scope}:${room.id}`;

// ---- wire messages --------------------------------------------------------

/** C→S: the only presence payload shape the gateway accepts. */
export interface ClientPresenceMessage {
  state: PresenceState;
  type: 'presence';
}

export interface ClientPingMessage {
  type: 'ping';
}

export type ClientMessage = ClientPingMessage | ClientPresenceMessage;

export interface PresenceBroadcast {
  actor: CollaborationActor;
  connectionId: string;
  state: PresenceState;
}

export type ServerMessage =
  | { connectionId: string; event: ServerActivityEvent; type: 'activity' }
  | {
      /** Payload-free cache hint: re-fetch the owning domain via the API. */
      entity: 'project' | 'task' | 'workspace';
      entityId: string;
      type: 'invalidate';
    }
  | { connectionId: string; type: 'presence-gone' }
  | { type: 'pong' }
  | {
      actor: CollaborationActor;
      connectionId: string;
      state: PresenceState;
      type: 'presence';
    }
  | { reason?: string; type: 'revoked' }
  | {
      activities: ServerActivityEvent[];
      connectionId: string;
      presence: PresenceBroadcast[];
      type: 'snapshot';
    };

// ---- store shapes ---------------------------------------------------------

export type RoomConnectionStatus = 'connecting' | 'idle' | 'online' | 'reconnecting' | 'revoked';

export interface PresenceEntry extends PresenceBroadcast {
  /** Local receipt time — drives the 45s liveness cutoff, never the server clock. */
  receivedAt: number;
}

export interface RoomCollaboration {
  activities: Record<string, ServerActivityEvent>;
  connectionId?: string;
  presence: Record<string, PresenceEntry>;
  status: RoomConnectionStatus;
}

export const emptyRoomCollaboration = (): RoomCollaboration => ({
  activities: {},
  presence: {},
  status: 'idle',
});
