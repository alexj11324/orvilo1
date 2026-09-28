import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';

import type { CollaborationRoom, PresenceState } from '@/store/collaboration';

import type { AnchorRegistry } from './anchorRegistry';
import type { RectLike } from './anchors';

/**
 * The room this surface is joined to plus the outbound presence channel.
 * `send` is null while disconnected — presence is ephemeral, so callers drop
 * updates rather than queue them.
 */
export interface CollaborationContextValue {
  registry: AnchorRegistry;
  room: CollaborationRoom;
  roomKey: string;
  send: ((state: PresenceState) => void) | null;
  /**
   * Identifies the shared view (e.g. 'board', 'list:backlog'). Cursors from a
   * different view never resolve here — the projection would be wrong.
   */
  viewKey?: string;
}

export const CollaborationContext = createContext<CollaborationContextValue | null>(null);

export const useCollaborationContext = () => useContext(CollaborationContext);

/** Live rect for a collab id — re-reads on registry membership bumps. */
export const useAnchorRect = (collabId: string | undefined): RectLike | null => {
  const ctx = useCollaborationContext();
  useSyncExternalStore(
    ctx ? ctx.registry.subscribe : noopSubscribe,
    ctx ? ctx.registry.getVersion : zeroVersion,
  );
  if (!ctx || !collabId) return null;
  return ctx.registry.getRect(collabId);
};

const noopSubscribe = () => () => {};
const zeroVersion = () => 0;

/** Whether the collab id currently exists in the DOM under this provider. */
export const useAnchorExists = (collabId: string | undefined): boolean => {
  const ctx = useCollaborationContext();
  return useSyncExternalStore(
    ctx ? ctx.registry.subscribe : noopSubscribe,
    useCallback(() => !!collabId && !!ctx?.registry.has(collabId), [ctx, collabId]),
    () => false,
  );
};
