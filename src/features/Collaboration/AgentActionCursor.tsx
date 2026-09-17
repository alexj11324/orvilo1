'use client';

import { Icon } from '@lobehub/ui';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { CheckCircle2, CirclePlay, FileEdit, XCircle } from 'lucide-react';
import { memo, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

import type { ActivityPhase, ServerActivityEvent } from '@/store/collaboration';

import { collabIdForTarget } from './anchors';
import { useCollaborationContext } from './context';

const styles = createStaticStyles(({ css }) => ({
  bubble: css`
    pointer-events: none;
    will-change: transform;
    user-select: none;

    position: absolute;
    inset-block-start: 0;
    inset-inline-start: 0;

    display: flex;
    gap: 4px;
    align-items: center;

    padding-block: 3px;
    padding-inline: 6px;
    border-radius: 999px;

    font-size: 11px;
    font-weight: 500;
    line-height: 1;
    white-space: nowrap;

    &::before {
      content: '';
      position: absolute;
      inset: -3px;
      border-radius: 999px;
    }
  `,
  committed: css`
    border: 1px solid ${cssVar.colorSuccessBorder};
    color: ${cssVar.colorSuccessText};
    background: ${cssVar.colorSuccessBg};
  `,
  failed: css`
    border: 1px solid ${cssVar.colorErrorBorder};
    color: ${cssVar.colorErrorText};
    background: ${cssVar.colorErrorBg};
  `,
  proposed: css`
    border: 1px dashed ${cssVar.colorBorder};
    color: ${cssVar.colorTextSecondary};
    background: ${cssVar.colorBgElevated};
  `,
  started: css`
    border: 1px solid ${cssVar.colorPrimaryBorder};
    color: ${cssVar.colorPrimaryText};
    background: ${cssVar.colorPrimaryBg};

    @media (prefers-reduced-motion: no-preference) {
      &::before {
        border: 1px solid ${cssVar.colorPrimaryBorder};
        animation: collab-pulse 1.6s ease-out infinite;
      }
    }
  `,
}));

export const AGENT_PHASE_ICON: Record<ActivityPhase, typeof FileEdit> = {
  committed: CheckCircle2,
  failed: XCircle,
  proposed: FileEdit,
  started: CirclePlay,
};

const phaseClass = (phase: ActivityPhase): string => {
  switch (phase) {
    case 'committed': {
      return styles.committed;
    }
    case 'failed': {
      return styles.failed;
    }
    case 'proposed': {
      return styles.proposed;
    }
    case 'started': {
      return styles.started;
    }
  }
};

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
      style={{
        transform: `translate(${rect.left + rect.width}px, ${rect.top}px) translate(-50%, -50%)`,
      }}
    >
      <Icon icon={PhaseIcon} size={11} />
      <span>{t('teammates.activity.bubble', { action: event.action, name })}</span>
    </div>
  );
});

AgentActionCursor.displayName = 'AgentActionCursor';
