import {
  type CollaborationRoom,
  getCollaborationStoreState,
  type PresenceState,
  roomKey,
} from '@/store/collaboration';

/** Local-data preview has no collaboration server. Preserve the offline UI. */
export const acquireRoomConnection =
  (_room: CollaborationRoom): ((state: PresenceState) => void) =>
  () => {};
export const releaseRoomConnection = (room: CollaborationRoom): void => {
  getCollaborationStoreState().clearRoom(roomKey(room));
};
export const dropRoomConnection = releaseRoomConnection;
export const refreshCollaborationConnections = (): void => {};
