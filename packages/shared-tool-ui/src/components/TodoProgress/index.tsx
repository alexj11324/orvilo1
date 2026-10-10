'use client';

import { cn } from 'cn';
import { CircleArrowRight, CircleCheckBig, ListTodo } from 'lucide-react';
import { createElement, memo } from 'react';

import { shinyTextStyles } from '../../styles';

/**
 * Visual state of a todo summary:
 * - inProgress: a step is currently running
 * - completedStep: no running step, show the most recently completed one
 * - allDone: every step is completed
 * - idle: nothing completed or running yet
 */
export type TodoSummaryState = 'allDone' | 'completedStep' | 'idle' | 'inProgress';

export interface TodoSummary {
  completed: number;
  /** Step text shown after the label (current step or last completed step) */
  detail?: string;
  state: TodoSummaryState;
  total: number;
}

const RING_SIZE = 14;
const RING_STROKE = 2;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUM = 2 * Math.PI * RING_RADIUS;

const styles = {
  countChip:
    'shrink-0 rounded-[999px] bg-accent px-2 py-px font-mono text-[12px] text-muted-foreground me-2',
  header:
    'flex items-center gap-2 bg-[var(--ant-color-fill-quaternary)] px-3 py-2.5 [border-block-end:1px_solid_var(--sidebar-border)]',
  headerCount:
    'shrink-0 rounded-[999px] bg-accent px-2 py-0.5 font-mono text-[12px] text-muted-foreground',
  headerDetail: 'min-w-0 overflow-hidden text-ellipsis text-foreground',
  headerLabel: 'flex min-w-0 flex-1 items-center gap-0 truncate text-muted-foreground',
  ring: 'shrink-0 [transform:rotate(-90deg)] me-1.5',
  ringProgress: 'transition-[stroke-dashoffset,stroke] duration-[240ms] ease-[ease]',
  ringTrack: 'stroke-selected',
  summaryDetail: 'text-foreground',
  summaryText: 'min-w-0 truncate',
};

const STATE_ICONS = {
  allDone: CircleCheckBig,
  completedStep: CircleCheckBig,
  idle: ListTodo,
  inProgress: CircleArrowRight,
} as const;

const stateColor = (state: TodoSummaryState) => {
  switch (state) {
    case 'inProgress': {
      return 'var(--info)';
    }
    case 'idle': {
      return 'var(--muted-foreground)';
    }
    default: {
      return 'var(--success)';
    }
  }
};

interface TodoProgressRingProps {
  completed: number;
  total: number;
}

export const TodoProgressRing = memo<TodoProgressRingProps>(({ completed, total }) => {
  const ratio = total > 0 ? completed / total : 0;
  const allDone = total > 0 && completed === total;
  const color = allDone ? 'var(--success)' : 'var(--info)';

  return (
    <svg className={styles.ring} height={RING_SIZE} width={RING_SIZE}>
      <circle
        className={styles.ringTrack}
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        fill="none"
        r={RING_RADIUS}
        strokeWidth={RING_STROKE}
      />
      <circle
        className={styles.ringProgress}
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        fill="none"
        r={RING_RADIUS}
        stroke={color}
        strokeDasharray={RING_CIRCUM}
        strokeDashoffset={RING_CIRCUM * (1 - ratio)}
        strokeLinecap="round"
        strokeWidth={RING_STROKE}
      />
    </svg>
  );
});

TodoProgressRing.displayName = 'TodoProgressRing';

interface TodoSummaryContentProps {
  label: string;
  shiny?: boolean;
  summary: TodoSummary;
}

/**
 * Inline inspector summary: progress ring + count chip + "label: detail".
 * Render it inside an `inspectorTextStyles.root` flex container.
 */
export const TodoInspectorSummary = memo<TodoSummaryContentProps>(({ label, shiny, summary }) => {
  const { completed, detail, state, total } = summary;

  return (
    <>
      {total > 0 && <TodoProgressRing completed={completed} total={total} />}
      {total > 0 && state !== 'allDone' && (
        <span className={styles.countChip}>
          {completed}/{total}
        </span>
      )}
      <span className={styles.summaryText}>
        <span className={cn(shiny && shinyTextStyles.shinyText)}>{label}</span>
        {detail && (
          <>
            {': '}
            <span className={styles.summaryDetail}>{detail}</span>
          </>
        )}
      </span>
    </>
  );
});

TodoInspectorSummary.displayName = 'TodoInspectorSummary';

/**
 * Header row for the expanded todo list panel:
 * state icon + "label: detail" + count badge on the right.
 */
export const TodoPanelHeader = memo<TodoSummaryContentProps>(({ label, summary }) => {
  const { completed, detail, state, total } = summary;

  return (
    <div className={styles.header}>
      {createElement(STATE_ICONS[state], {
        size: 16,
        style: { color: stateColor(state), flexShrink: 0 },
      })}
      <div className={styles.headerLabel}>
        <span>{label}</span>
        {detail && (
          <>
            <span>{': '}</span>
            <span className={styles.headerDetail}>{detail}</span>
          </>
        )}
      </div>
      <span className={styles.headerCount}>
        {completed}/{total}
      </span>
    </div>
  );
});

TodoPanelHeader.displayName = 'TodoPanelHeader';
