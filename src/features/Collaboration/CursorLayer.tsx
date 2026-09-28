'use client';

import { createStaticStyles } from 'antd-style';
import { memo, useMemo, useSyncExternalStore } from 'react';

import { useIsMobile } from '@/hooks/useIsMobile';
import { cursorPresence, MAX_DYNAMIC_CURSORS, useCollaborationStore } from '@/store/collaboration';

import { useCollaborationContext } from './context';
import { HumanCursor } from './HumanCursor';

const styles = createStaticStyles(({ css }) => ({
  layer: css`
    pointer-events: none;

    position: fixed;
    z-index: 1000;
    inset: 0;

    overflow: hidden;
  `,
}));

/**
 * Fixed viewport overlay for remote human cursors. Subscribes to the room's
 * presence map — the only re-renders come from real presence updates, never
 * from local pointermove. The layer itself is `pointer-events: none` so it
 * can never swallow board interactions; mobile renders nothing (avatars carry
 * presence there).
 */
export const CursorLayer = memo(() => {
  const ctx = useCollaborationContext();
  const isMobile = useIsMobile();
  const room = useCollaborationStore((s) => (ctx ? s.rooms[ctx.roomKey] : undefined));
  // Re-resolve positions when the DOM anchor set changes.
  useSyncExternalStore(
    ctx ? ctx.registry.subscribe : () => () => {},
    ctx ? ctx.registry.getVersion : () => 0,
  );

  const entries = useMemo(
    () => (ctx ? cursorPresence(room, ctx.viewKey, Date.now()).slice(0, MAX_DYNAMIC_CURSORS) : []),
    [ctx, room],
  );

  if (!ctx || isMobile || entries.length === 0) return null;

  return (
    <div aria-hidden className={styles.layer}>
      {entries.map((entry) => (
        <HumanCursor entry={entry} key={entry.connectionId} />
      ))}
    </div>
  );
});

CursorLayer.displayName = 'CursorLayer';
