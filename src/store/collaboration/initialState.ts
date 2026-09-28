import type { RoomCollaboration } from './types';

export interface CollaborationState {
  /**
   * Per-room ephemeral state keyed by `${scope}:${id}`. Presence and agent
   * activity are transient by design — they are never persisted to storage or
   * treated as evidence of business state (task completion, invites, grants).
   */
  rooms: Record<string, RoomCollaboration>;
}

export const initialCollaborationState: CollaborationState = {
  rooms: {},
};
