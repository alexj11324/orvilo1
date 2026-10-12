'use client';

import { clsx as cx } from 'cn';
import { CheckCircle2, CirclePlay, FileEdit, XCircle } from 'lucide-react';
import { memo, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

import type { ActivityPhase, ServerActivityEvent } from '@/store/collaboration';

import { collabIdForTarget } from './anchors';
import { useCollaborationContext } from './context';

const styles = {
  bubble:
    "pointer-events-none will-change-transform select-none absolute inset-bs-0 inset-s-0 flex gap-1 items-center py-0.5 px-1.5 rounded-full text-xs leading-5 font-medium whitespace-nowrap before:content-[''] before:absolute before:-inset-0.75 before:rounded-full",
  committed: 'border border-success-border text-success-text bg-success-wash',
  failed: 'border border-destructive-border text-destructive-text bg-destructive-wash',
  proposed: 'border border-dashed border-border text-muted-foreground bg-popover',
  started:
    'border border-primary-border text-primary-text bg-primary-wash motion-safe:before:border motion-safe:before:border-primary-border motion-safe:before:animate-pulse motion-safe:before:[animation-duration:1.6s] motion-safe:before:[animation-timing-function:ease-out]',
};

export const AGENT_PHASE_ICON: Record<ActivityPhase, typeof FileEdit> = {
  committed: CheckCircle2,
  failed: XCircle,
  proposed: FileEdit,
  started: CirclePlay,
};

const PHASE_CLASS: Record<ActivityPhase, string> = {
  committed: styles.committed,
  failed: styles.failed,
  proposed: styles.proposed,
  started: styles.started,
};

const phaseClass = (phase: ActivityPhase): string => PHASE_CLASS[phase];

/**
 * One live agent activity pinned to its semantic target. The four phases read
 * differently at a glance — proposed is a dashed "thinking about it" chip,
 * started carries the pulse, committed/failed land as settled verdicts.
 * Anchored to the target's top-right corner so the bubble never covers the
 * field the agent is acting on.
 */
export const AgentActionCursor = memo<{ event: ServerActivityEvent }>(({ event }) => {
  const { t } = useTranslation('common');
  const ctx = useCollaborationContext();
  useSyncExternalStore(
    ctx ? ctx.registry.subscribe : () => () => {},
    ctx ? ctx.registry.getVersion : () => 0,
  );

  const collabId = collabIdForTarget(event.target);
  const rect = ctx?.registry.getRect(collabId);
  if (!rect) return null;

  const PhaseIcon = AGENT_PHASE_ICON[event.phase];
  const name = event.actor.name || event.actor.id;

  return (
    <div
      className={cx(styles.bubble, phaseClass(event.phase))}
      data-slot="collaboration-agent-action"
      style={{
        transform: `translate(${rect.left + rect.width}px, ${rect.top}px) translate(-50%, -50%)`,
      }}
    >
      <PhaseIcon size={16} />
      <span>{t('teammates.activity.bubble', { action: event.action, name })}</span>
    </div>
  );
});

AgentActionCursor.displayName = 'AgentActionCursor';
