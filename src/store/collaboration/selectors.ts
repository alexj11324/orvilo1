import type { CollaborationStore } from './store';
import type { RoomCollaboration } from './types';

/** Room bucket for a `${scope}:${id}` key — never a shared reference. */
export const roomCollaboration =
  (key: string | null | undefined) =>
  (s: CollaborationStore): RoomCollaboration | undefined =>
    key ? s.rooms[key] : undefined;

export const roomStatus = (key: string | null | undefined) => (s: CollaborationStore) =>
  key ? s.rooms[key]?.status : undefined;

export const roomPresence = (key: string | null | undefined) => (s: CollaborationStore) =>
  key ? s.rooms[key]?.presence : undefined;

export const roomActivities = (key: string | null | undefined) => (s: CollaborationStore) =>
  key ? s.rooms[key]?.activities : undefined;

/** Fine-grained per-connection subscription — the cursor layer's contract. */
export const presenceEntry =
  (key: string | null | undefined, connectionId: string) => (s: CollaborationStore) =>
    key ? s.rooms[key]?.presence[connectionId] : undefined;
