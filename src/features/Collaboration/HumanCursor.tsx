'use client';

import { createStaticStyles, cssVar } from 'antd-style';
import { memo, useRef } from 'react';

import type { PresenceEntry } from '@/store/collaboration';

import { useCollaborationContext } from './context';
import { cursorLabelForeground } from './cursorLabelColor';
import { useCursorPlacement } from './useCursorPlacement';

const styles = createStaticStyles(({ css }) => ({
  cursor: css`
    pointer-events: none;
    will-change: transform;

    position: absolute;
    inset-block-start: 0;
    inset-inline-start: 0;

    display: flex;
    gap: 4px;
    align-items: flex-start;
  `,
  label: css`
    margin-block-start: 14px;
    padding-block: 2px;
    padding-inline: 6px;
    border-radius: 4px;

    font-size: 11px;
    font-weight: 500;
    line-height: 1;
    color: #fff;
    white-space: nowrap;

    background: ${cssVar.colorPrimary};
  `,
  pointer: css`
    width: 0;
    height: 0;
    border-block-start: 10px solid ${cssVar.colorPrimary};
    border-inline-end: 8px solid transparent;
  `,
}));

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
      <div className={styles.pointer} style={color ? { borderTopColor: color } : undefined} />
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
