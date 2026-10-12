'use client';

import { type RefObject, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import type { PresenceEntry } from '@/store/collaboration';
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/slices/settings/selectors';

import { anchorPointInOverlay, collabIdFor } from './anchors';
import { type CollaborationContextValue } from './context';

const INTERP_MS = 100;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const getReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia(REDUCED_MOTION_QUERY).matches;
const getServerReducedMotion = () => false;
const subscribeReducedMotion = (listener: () => void) => {
  if (typeof window === 'undefined') return () => {};
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
};

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
  const animationMode = useUserStore(userGeneralSettingsSelectors.animationMode);
  const systemReducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    getServerReducedMotion,
  );
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
    const snap = () => {
      shown.current = target;
      if (nodeRef.current) {
        nodeRef.current.style.transform = `translate(${target.x}px, ${target.y}px)`;
      }
    };
    const reduceMotion = animationMode === 'disabled' || systemReducedMotion;

    // First placement (and reduced-motion) snaps: `transform` is written to the
    // mounted node BEFORE `visible` flips, so the first shown frame already
    // sits at the anchor.
    if (
      !shown.current ||
      reduceMotion ||
      (shown.current.x === target.x && shown.current.y === target.y)
    ) {
      snap();
      setVisible(true);
      return;
    }

    const from = shown.current;
    const start = performance.now();
    cancelAnimationFrame(animRef.current);
    const step = (now: number) => {
      animRef.current = 0;
      if (!nodeRef.current) return;
      // A preference can change between render and this queued frame. Read
      // the public sources again before every owned transform write.
      if (
        userGeneralSettingsSelectors.animationMode(useUserStore.getState()) === 'disabled' ||
        getReducedMotion()
      ) {
        snap();
        return;
      }
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
    return () => {
      cancelAnimationFrame(animRef.current);
      animRef.current = 0;
    };
  }, [ctx, collabId, u, v, layoutVersion, nodeRef, animationMode, systemReducedMotion]);

  return { collabId, visible };
};
