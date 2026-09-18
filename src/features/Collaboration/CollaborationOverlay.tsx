'use client';

import { createStaticStyles } from 'antd-style';
import { memo, useMemo } from 'react';

import { liveActivities, MAX_EXPANDED_BUBBLES, useCollaborationStore } from '@/store/collaboration';

import { ActivityDock } from './ActivityDock';
import { ActivityPulse } from './ActivityPulse';
import { AgentActionCursor } from './AgentActionCursor';
import { collabIdForTarget } from './anchors';
import { useCollaborationContext } from './context';
import { CursorLayer } from './CursorLayer';

const styles = createStaticStyles(({ css }) => ({
  overlay: css`
    pointer-events: none;

    position: fixed;
    z-index: 1000;
    inset: 0;

    overflow: hidden;
  `,
}));

/**
 * The room's whole visual layer, in one mount: human cursors, expanded agent
 * bubbles (first ~3 resolvable activities), at-anchor pulses for the
 * resolvable overflow, and the dock for everything the board can't show.
 * One fixed, pointer-events-none subtree — the board never re-renders for
 * presence traffic.
 */
export const CollaborationOverlay = memo(() => {
  const ctx = useCollaborationContext();
  const activities = useCollaborationStore((s) =>
    ctx ? s.rooms[ctx.roomKey]?.activities : undefined,
  );

  const { expanded, pulsed } = useMemo(() => {
    if (!ctx) return { expanded: [], pulsed: [] };
    const events = liveActivities(
      { activities: activities ?? {}, presence: {}, status: 'online' },
      Date.now(),
    );
    const resolvable = events.filter((event) => ctx.registry.has(collabIdForTarget(event.target)));
    return {
      expanded: resolvable.slice(0, MAX_EXPANDED_BUBBLES),
      pulsed: resolvable.slice(MAX_EXPANDED_BUBBLES),
    };
  }, [ctx, activities]);

  if (!ctx) return null;

  return (
    <>
      <CursorLayer />
      <div aria-hidden className={styles.overlay}>
        {expanded.map((event) => (
          <AgentActionCursor event={event} key={event.eventId} />
        ))}
        {pulsed.map((event) => (
          <ActivityPulse event={event} key={event.eventId} />
        ))}
        <ActivityDock />
      </div>
    </>
  );
});

CollaborationOverlay.displayName = 'CollaborationOverlay';
