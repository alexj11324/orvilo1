'use client';

import { clsx as cx } from 'cn';
import { memo, useSyncExternalStore } from 'react';

import type { ActivityPhase, ServerActivityEvent } from '@/store/collaboration';

import { collabIdForTarget } from './anchors';
import { useCollaborationContext } from './context';

const styles = {
  pulse:
    'pointer-events-none will-change-transform absolute inset-bs-0 inset-s-0 size-2.5 rounded-full',
  committed: 'bg-success',
  failed: 'bg-destructive',
  proposed:
    'border-[length:calc(var(--spacing)_*_3_/_8)] border-dashed border-muted-foreground bg-transparent',
  started:
    'bg-primary motion-safe:animate-pulse motion-safe:[animation-duration:1.4s] motion-safe:[animation-timing-function:ease-out]',
};

const PHASE_CLASS: Record<ActivityPhase, string> = {
  committed: styles.committed,
  failed: styles.failed,
  proposed: styles.proposed,
  started: styles.started,
};

const phaseClass = (phase: ActivityPhase): string => PHASE_CLASS[phase];

/**
 * Minimal at-anchor marker for live activity that doesn't get an expanded
 * bubble (past the expanded-bubble cap). Same phase semantics as
 * AgentActionCursor, one tenth the ink.
 */
export const ActivityPulse = memo<{ event: ServerActivityEvent }>(({ event }) => {
  const ctx = useCollaborationContext();
  useSyncExternalStore(
    ctx ? ctx.registry.subscribe : () => () => {},
    ctx ? ctx.registry.getVersion : () => 0,
  );

  const rect = ctx?.registry.getRect(collabIdForTarget(event.target));
  if (!rect) return null;

  return (
    <span
      aria-hidden
      className={cx(styles.pulse, phaseClass(event.phase))}
      data-slot="collaboration-activity-pulse"
      style={{
        transform: `translate(${rect.left + rect.width - 5}px, ${rect.top - 4}px)`,
      }}
    />
  );
});

ActivityPulse.displayName = 'ActivityPulse';
