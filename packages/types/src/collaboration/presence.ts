import type { CollaborationActor } from './actor';

/**
 * Semantic pointer position — normalized coordinates inside a DOM-registered
 * entity anchor, not raw screen pixels. Two viewers with different layouts
 * resolve the same (entity, u, v) onto the same object.
 */
export interface PresenceCursor {
  /** Stable DOM anchor id (`data-collab-id`), e.g. `task:task_1:assignee`. */
  anchor?: string;
  entityId: string;
  entityType: string;
  /** Normalized horizontal position inside the target rect (0..1). */
  u: number;
  /** Normalized vertical position inside the target rect (0..1). */
  v: number;
  /** Client-side view/layout fingerprint; receivers skip incompatible views. */
  viewKey?: string;
}

export interface PresenceSelection {
  anchor?: string;
  entityId: string;
  entityType: string;
}

/**
 * Ephemeral per-connection state. Never persisted — reconnect rebuilds it and
 * stale coordinates are dropped rather than replayed.
 */
export interface PresenceState {
  cursor?: PresenceCursor;
  selection?: PresenceSelection;
  typing?: boolean;
}

/** One live connection as broadcast to the rest of the room. */
export interface PresenceEntry {
  actor: CollaborationActor;
  connectionId: string;
  state: PresenceState;
}
