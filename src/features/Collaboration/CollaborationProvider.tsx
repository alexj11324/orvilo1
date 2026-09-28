'use client';

import type { ReactNode } from 'react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';

import type { CollaborationRoom, PresenceCursorState, PresenceState } from '@/store/collaboration';
import { roomKey as toRoomKey } from '@/store/collaboration';
import { useUserStore } from '@/store/user';

import { AnchorRegistry } from './anchorRegistry';
import { collabAnchorFor, parseCollabId, pointToUV } from './anchors';
import { acquireRoomConnection, releaseRoomConnection } from './connection';
import { CollaborationContext } from './context';
import { createThrottledEmitter, CURSOR_SEND_INTERVAL_MS, cursorMovedEnough } from './throttle';
import { usePresenceEnabled } from './usePresenceEnabled';

/**
 * Publishes the local pointer as semantic-anchor presence. Hit-testing goes
 * through `collabAnchorFor` — the pointer's element ancestry decides the
 * anchor (private-marked subtrees never resolve, so their entity ids stay off
 * the wire), and u/v capture *where inside* it the pointer is, so a remote
 * viewer with a different layout still resolves the same spot.
 *
 * Silent periods send nothing: the gateway's own timeout clears the cursor
 * server-side, and we clear ours on pointerleave / document hidden.
 */
const useCursorPublisher = (
  enabled: boolean,
  viewKey: string | undefined,
  getSend: () => ((state: PresenceState) => void) | null,
): void => {
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const lastAnchorId = useRef<string | null>(null);
  const emitter = useRef<ReturnType<typeof createThrottledEmitter<PresenceState>> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    emitter.current = createThrottledEmitter<PresenceState>((state) => getSend()?.(state), {
      minIntervalMs: CURSOR_SEND_INTERVAL_MS,
    });
    const emit = emitter.current;

    const clear = () => {
      if (!lastAnchorId.current && !lastPos.current) return;
      lastAnchorId.current = null;
      lastPos.current = null;
      // `state: {}` replaces the broadcast presence wholesale — a missing
      // `cursor` key is the "cursor gone" signal on the wire.
      getSend()?.({});
    };

    const onMove = (event: PointerEvent) => {
      const hit = collabAnchorFor(event.target);
      const point = { x: event.clientX, y: event.clientY };

      if (!hit) {
        if (lastAnchorId.current) clear();
        return;
      }
      const { anchorEl, collabId } = hit;

      const parsed = parseCollabId(collabId);
      if (!parsed) return;
      const rect = anchorEl.getBoundingClientRect();
      const { u, v } = pointToUV(point, rect);
      const moved = cursorMovedEnough(lastPos.current, point);
      const anchorChanged = lastAnchorId.current !== collabId;
      if (!moved && !anchorChanged) return;

      lastPos.current = point;
      lastAnchorId.current = collabId;

      const cursor: PresenceCursorState = {
        anchor: parsed.anchor,
        entityId: parsed.entityId,
        entityType: parsed.entityType,
        u,
        v,
        viewKey,
      };
      emit.push({ cursor });
    };

    const onLeave = () => clear();

    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    document.addEventListener('visibilitychange', onLeave);
    window.addEventListener('blur', onLeave);

    return () => {
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onLeave);
      window.removeEventListener('blur', onLeave);
      clear();
      emit.cancel();
      emitter.current = null;
    };
  }, [enabled, viewKey, getSend]);
};

export interface CollaborationProviderProps {
  children: ReactNode;
  /** Master switch on top of the feature flag (e.g. route decides). */
  enabled?: boolean;
  room: CollaborationRoom | null;
  /** Shared-view identifier — cursors from other views are filtered out. */
  viewKey?: string;
}

/**
 * Joins a collaboration room for the subtree: owns the DOM anchor registry,
 * holds the shared socket via the refcounted connection manager, and streams
 * the local cursor. Unmounting (or switching `room`) releases the ref — the
 * last consumer's release tears the socket down.
 */
export const CollaborationProvider = memo<CollaborationProviderProps>(
  ({ children, enabled = true, room, viewKey }) => {
    const [registry] = useState(() => new AnchorRegistry());
    const presenceEnabled = usePresenceEnabled(enabled);
    const sharesPresence = useUserStore((s) => s.preference.showInCollaboration !== false);
    const active = presenceEnabled && !!room;

    useEffect(() => {
      if (typeof document === 'undefined') return;
      return registry.attach(document);
    }, [registry]);

    const sendRef = useRef<((state: PresenceState) => void) | null>(null);
    const roomId = room?.id;
    const roomScope = room?.scope;
    const key = room ? toRoomKey(room) : null;

    useEffect(() => {
      if (!active || !roomScope || !roomId) return;
      const send = acquireRoomConnection({ id: roomId, scope: roomScope });
      sendRef.current = send;
      return () => {
        sendRef.current = null;
        releaseRoomConnection({ id: roomId, scope: roomScope });
      };
    }, [active, roomScope, roomId]);

    const getSend = useRef(() => sendRef.current).current;
    useCursorPublisher(active && sharesPresence, viewKey, getSend);

    const contextValue = useMemo(
      () =>
        room && key
          ? {
              registry,
              room,
              roomKey: key,
              send:
                active && sharesPresence
                  ? (state: PresenceState) => sendRef.current?.(state)
                  : null,
              viewKey,
            }
          : null,
      [registry, room, key, active, sharesPresence, viewKey],
    );

    return <CollaborationContext value={contextValue}>{children}</CollaborationContext>;
  },
);

CollaborationProvider.displayName = 'CollaborationProvider';
