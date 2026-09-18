'use client';

import { useEffect } from 'react';

import type { CollaborationRoom } from '@/store/collaboration';

import { acquireRoomConnection, releaseRoomConnection } from './connection';

/**
 * Join a room for the lifetime of the calling component — the standalone
 * version of CollaborationProvider's connection half, for surfaces that show
 * presence without owning an anchor space (e.g. the top-bar avatar stack on a
 * workspace-scope room). Refcounted with every other consumer of the room.
 */
export const useRoomConnection = (room: CollaborationRoom | null, enabled = true): void => {
  const id = room?.id;
  const scope = room?.scope;

  useEffect(() => {
    if (!enabled || !scope || !id) return;
    const target = { id, scope };
    acquireRoomConnection(target);
    return () => releaseRoomConnection(target);
  }, [enabled, scope, id]);
};
