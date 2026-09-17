'use client';

import { createStaticStyles, cssVar } from 'antd-style';
import { memo, useEffect, useRef, useState } from 'react';

import type { PresenceEntry } from '@/store/collaboration';

import { anchorPointInOverlay, collabIdFor } from './anchors';
import { useCollaborationContext } from './context';

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

const INTERP_MS = 100;

/**
 * One remote human cursor. The incoming (u,v) is projected onto the live
 * anchor rect, then eased toward over ~100ms on a rAF loop so 17Hz updates
 * read as continuous motion instead of teleports. Reduced-motion users get
 * instant placement — no easing.
 */
export const HumanCursor = memo<{ entry: PresenceEntry }>(({ entry }) => {
  const ctx = useCollaborationContext();
  const nodeRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const animRef = useRef<number>(0);
  const shown = useRef<{ x: number; y: number } | null>(null);

  const cursor = entry.state.cursor;
  const collabId = cursor ? collabIdFor(cursor.entityType, cursor.entityId, cursor.anchor) : null;
  const u = cursor?.u ?? 0;
  const v = cursor?.v ?? 0;

  useEffect(() => {
    if (!ctx || !collabId) {
      setVisible(false);
      return;
    }
    const rect = ctx.registry.getRect(collabId);
    if (!rect) {
      setVisible(false);
      return;
    }

    const target = anchorPointInOverlay(rect, u, v);
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!shown.current || reduceMotion) {
      shown.current = target;
      if (nodeRef.current) {
        nodeRef.current.style.transform = `translate(${target.x}px, ${target.y}px)`;
      }
      setVisible(true);
      return;
    }

    const from = shown.current;
    const start = performance.now();
    cancelAnimationFrame(animRef.current);
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / INTERP_MS);
      const eased = 1 - (1 - t) ** 3;
      const current = {
        x: from.x + (target.x - from.x) * eased,
        y: from.y + (target.y - from.y) * eased,
      };
      shown.current = current;
      if (nodeRef.current) {
        nodeRef.current.style.transform = `translate(${current.x}px, ${current.y}px)`;
      }
      if (t < 1) animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
    setVisible(true);
    return () => cancelAnimationFrame(animRef.current);
  }, [ctx, collabId, u, v]);

  if (!visible || !collabId) return null;

  const name = entry.actor.name || entry.actor.id;
  const color = entry.actor.color;

  return (
    <div className={styles.cursor} ref={nodeRef} style={{ opacity: 0.95 }}>
      <div className={styles.pointer} style={color ? { borderTopColor: color } : undefined} />
      <div className={styles.label} style={color ? { background: color } : undefined}>
        {name}
      </div>
    </div>
  );
});

HumanCursor.displayName = 'HumanCursor';
