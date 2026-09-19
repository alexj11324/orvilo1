'use client';

import { type RefObject, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import type { PresenceEntry } from '@/store/collaboration';

import { anchorPointInOverlay, collabIdFor } from './anchors';
import { type CollaborationContextValue } from './context';

const INTERP_MS = 100;

/**
 * Project a remote human cursor onto its live anchor rect. The registry bumps
 * its version on scroll/resize, so subscribing re-reads the rect instead of
 * freezing at a stale point; the returned `target` is null while the anchor is
 * unmeasurable so the caller keeps the node transparent rather than flashing a
 * ghost at the overlay origin.
 */
export const useCursorPlacement = (
  ctx: CollaborationContextValue | null,
  entry: PresenceEntry,
  nodeRef: RefObject<HTMLDivElement | null>,
) => {
  const [visible, setVisible] = useState(false);
  const animRef = useRef<number>(0);
  const shown = useRef<{ x: number; y: number } | null>(null);

  const cursor = entry.state.cursor;
  const collabId = cursor ? collabIdFor(cursor.entityType, cursor.entityId, cursor.anchor) : null;
  const u = cursor?.u ?? 0;
  const v = cursor?.v ?? 0;

  const layoutVersion = useSyncExternalStore(
    ctx ? ctx.registry.subscribe : () => () => {},
    ctx ? ctx.registry.getVersion : () => 0,
  );

  useEffect(() => {
    if (!ctx || !collabId) {
      setVisible(false);
      return;
    }
    const rect = ctx.registry.getRect(collabId);
    if (!rect) {
      setVisible(false);
      shown.current = null;
      return;
    }

    const target = anchorPointInOverlay(rect, u, v);
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // First placement (and reduced-motion) snaps: `transform` is written to the
    // mounted node BEFORE `visible` flips, so the first shown frame already
    // sits at the anchor.
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
  }, [ctx, collabId, u, v, layoutVersion, nodeRef]);

  return { collabId, visible };
};
