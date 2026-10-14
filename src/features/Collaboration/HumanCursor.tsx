'use client';

import { memo, useRef } from 'react';

import type { PresenceEntry } from '@/store/collaboration';

import { useCollaborationContext } from './context';
import { cursorLabelForeground } from './cursorLabelColor';
import { useCursorPlacement } from './useCursorPlacement';

const styles = {
  cursor:
    'pointer-events-none will-change-transform absolute inset-bs-0 inset-s-0 flex gap-1 items-start',
  label:
    'mbs-3.5 py-0.5 px-1.5 rounded-(--radius-chip) text-xs leading-5 font-medium text-primary-foreground whitespace-nowrap bg-primary',
  pointer: 'block',
};

/**
 * One remote human cursor. The incoming (u,v) is projected onto the live
 * anchor rect, then eased toward over ~100ms on a rAF loop so 17Hz updates
 * read as continuous motion instead of teleports. Reduced-motion users get
 * instant placement — no easing.
 */
export const HumanCursor = memo<{ entry: PresenceEntry }>(({ entry }) => {
  const ctx = useCollaborationContext();
  const nodeRef = useRef<HTMLDivElement>(null);
  const { collabId, visible } = useCursorPlacement(ctx, entry, nodeRef);

  // The node stays mounted once the collab id resolves — the placement hook
  // writes `transform` to it before `visible` flips, so the first shown frame
  // already sits at the anchor instead of flashing at the overlay origin.
  // `opacity` gates visibility; an unpositioned node is transparent, never a
  // ghost at (0,0).
  if (!collabId) return null;

  const name = entry.actor.name || entry.actor.id;
  const color = entry.actor.color;

  return (
    <div className={styles.cursor} ref={nodeRef} style={{ opacity: visible ? 0.95 : 0 }}>
      {/* Apple `pointer.arrow.ipad` silhouette: tip at the projected point,
          per-user fill, white hairline for contrast on any card. */}
      <svg
        aria-hidden
        className={styles.pointer}
        fill="none"
        height={20}
        viewBox="0 0 406.973 550.395"
        width={15}
      >
        <path
          d="M191.109 403.364L358.748 403.364C402.806 403.364 420.916 363.611 394.638 336.996L72.3808 14.7393C43.81-14.168 0 1.59367 0 43.3101L0 500.412C0 537.942 41.0241 553.112 72.4169 522.056Z"
          fill={color || 'var(--primary)'}
          stroke="#fff"
          strokeWidth={28}
        />
      </svg>
      <div
        className={styles.label}
        style={color ? { background: color, color: cursorLabelForeground(color) } : undefined}
      >
        {name}
      </div>
    </div>
  );
});

HumanCursor.displayName = 'HumanCursor';
