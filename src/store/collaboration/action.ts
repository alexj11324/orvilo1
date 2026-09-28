import type { StoreApi } from 'zustand';

import { type StoreSetter } from '@/store/types';

import {
  applyPresenceBroadcast,
  dropPresence,
  pruneExpiredActivities,
  pruneStalePresence,
  upsertActivity,
} from './presence';
import type { CollaborationStore } from './store';
import {
  emptyRoomCollaboration,
  type PresenceBroadcast,
  type RoomCollaboration,
  type RoomConnectionStatus,
  type ServerActivityEvent,
} from './types';

type Setter = StoreSetter<CollaborationStore>;

const readRoom = (state: CollaborationStore, key: string): RoomCollaboration =>
  state.rooms[key] ?? emptyRoomCollaboration();

const writeRoom = (
  set: Setter,
  key: string,
  update: (room: RoomCollaboration) => RoomCollaboration,
  action: string,
): void => {
  set(
    (state) => ({
      rooms: {
        ...state.rooms,
        [key]: update(readRoom(state, key)),
      },
    }),
    false,
    action,
  );
};

export const createCollaborationSlice = (
  set: Setter,
  get: () => CollaborationStore,
  api?: StoreApi<CollaborationStore>,
) => new CollaborationActionImpl(set, get, api);

/**
 * Reducers for gateway traffic. Everything here is keyed by room so a
 * workspace-scope connection and a project-scope connection never clobber each
 * other, and every write keeps the previous object when nothing changed —
 * high-frequency presence must not re-render subscribers on no-op updates.
 */
export class CollaborationActionImpl {
  readonly #set: Setter;
  readonly #get: () => CollaborationStore;

  constructor(set: Setter, get: () => CollaborationStore, _api?: StoreApi<CollaborationStore>) {
    void _api;
    this.#set = set;
    this.#get = get;
  }

  /**
   * The gateway's join snapshot is authoritative for presence (replace) but
   * not for activity — it hardcodes `activities: []`, so a reconnect would
   * wipe events still inside their display window. Activities merge keyed by
   * eventId instead: replayed rows dedup, accumulated ones survive.
   */
  applySnapshot = (
    key: string,
    snapshot: {
      activities: ServerActivityEvent[];
      connectionId: string;
      presence: PresenceBroadcast[];
    },
    receivedAt: number,
  ): void => {
    writeRoom(
      this.#set,
      key,
      (room) => {
        const presence: RoomCollaboration['presence'] = {};
        for (const broadcast of snapshot.presence) {
          presence[broadcast.connectionId] = { ...broadcast, receivedAt };
        }
        const activities: RoomCollaboration['activities'] = { ...room.activities };
        for (const event of snapshot.activities) {
          activities[event.eventId] = event;
        }
        return {
          ...room,
          activities,
          connectionId: snapshot.connectionId,
          presence,
          status: 'online',
        };
      },
      'collaboration/snapshot',
    );
  };

  applyPresence = (key: string, broadcast: PresenceBroadcast, receivedAt: number): void => {
    writeRoom(
      this.#set,
      key,
      (room) => ({
        ...room,
        presence: applyPresenceBroadcast(room.presence, broadcast, receivedAt),
      }),
      'collaboration/presence',
    );
  };

  applyPresenceGone = (key: string, connectionId: string): void => {
    writeRoom(
      this.#set,
      key,
      (room) => ({ ...room, presence: dropPresence(room.presence, connectionId) }),
      'collaboration/presenceGone',
    );
  };

  applyActivity = (key: string, event: ServerActivityEvent): void => {
    writeRoom(
      this.#set,
      key,
      (room) => ({ ...room, activities: upsertActivity(room.activities, event) }),
      'collaboration/activity',
    );
  };

  setRoomStatus = (key: string, status: RoomConnectionStatus): void => {
    writeRoom(this.#set, key, (room) => ({ ...room, status }), 'collaboration/status');
  };

  /** Drop expired activities and silently-stale presence in one sweep. */
  pruneRoom = (key: string, now: number): void => {
    writeRoom(
      this.#set,
      key,
      (room) => ({
        ...room,
        activities: pruneExpiredActivities(room.activities, now),
        presence: pruneStalePresence(room.presence, now),
      }),
      'collaboration/prune',
    );
  };

  /** Tear a room down entirely (scope switch, revoke, last subscriber left). */
  clearRoom = (key: string): void => {
    if (!this.#get().rooms[key]) return;
    this.#set(
      (state) => {
        const { [key]: _removed, ...rest } = state.rooms;
        return { rooms: rest };
      },
      false,
      'collaboration/clear',
    );
  };
}

export type CollaborationAction = Pick<CollaborationActionImpl, keyof CollaborationActionImpl>;
