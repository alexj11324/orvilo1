'use client';

import { createStaticStyles, cssVar, cx } from 'antd-style';
import { memo, useSyncExternalStore } from 'react';

import type { ActivityPhase, ServerActivityEvent } from '@/store/collaboration';

import { collabIdForTarget } from './anchors';
import { useCollaborationContext } from './context';

const styles = createStaticStyles(({ css }) => ({
  pulse: css`
    pointer-events: none;
    will-change: transform;

    position: absolute;
    inset-block-start: 0;
    inset-inline-start: 0;

    width: 10px;
    height: 10px;
    border-radius: 50%;
  `,
  committed: css`
    background: ${cssVar.colorSuccess};
  `,
  failed: css`
    background: ${cssVar.colorError};
  `,
  proposed: css`
    border: 1.5px dashed ${cssVar.colorTextSecondary};
    background: transparent;
  `,
  started: css`
    background: ${cssVar.colorPrimary};

    @media (prefers-reduced-motion: no-preference) {
      animation: collab-dot-pulse 1.4s ease-out infinite;
    }
  `,
}));

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
      style={{
        transform: `translate(${rect.left + rect.width - 5}px, ${rect.top - 4}px)`,
      }}
    />
  );
});

ActivityPulse.displayName = 'ActivityPulse';
