import { cn } from 'cn';
import {
  CircleHelp,
  FlaskConical,
  GitBranch,
  Lightbulb,
  ListChecks,
  type LucideIcon,
} from 'lucide-react';
import { createElement, memo } from 'react';

import type { GoalGraphNodeKind } from '../Experiments/model';

/**
 * One palette per node kind, used by both the graph cards and the inline
 * references in the frontier / findings / activity lists, so the same node
 * reads the same everywhere. State is carried by stroke and glyph, never by
 * filling a node with its status color.
 */
export const KIND_COLOR: Record<GoalGraphNodeKind, { line: string; soft: string }> = {
  // Orvilo's theme palette is an 11-step scale, not antd's 10-step one: the
  // primary-strength band sits at x9–x10, and x6/x7 resolve to near-pastel
  // tints (light-mode blue-7 is #93c8ff). x3/x10 gives the glyph a visible
  // tinted tile with a saturated line in both themes.
  decision: { line: 'var(--ant-orange-10)', soft: 'var(--ant-orange-3)' },
  experiment: { line: 'var(--ant-cyan-10)', soft: 'var(--ant-cyan-3)' },
  finding: { line: 'var(--ant-green-10)', soft: 'var(--ant-green-3)' },
  problem: { line: 'var(--ant-purple-10)', soft: 'var(--ant-purple-3)' },
  task: { line: 'var(--ant-blue-10)', soft: 'var(--ant-blue-3)' },
};

export const KIND_ICON: Record<GoalGraphNodeKind, LucideIcon> = {
  decision: GitBranch,
  experiment: FlaskConical,
  finding: Lightbulb,
  problem: CircleHelp,
  task: ListChecks,
};

const styles = {
  dot: 'inline-block flex-none size-2 rounded-[2px]',
  mono: 'font-mono tabular-nums',
};

export const monoClass = styles.mono;

export const KindDot = memo<{ kind: GoalGraphNodeKind }>(({ kind }) => (
  <span className={styles.dot} style={{ background: KIND_COLOR[kind].line }} />
));

KindDot.displayName = 'GoalKindDot';

export const MonoText = memo<{ children: React.ReactNode; title?: string }>(
  ({ children, title }) => (
    <div className={cn('text-[12px] text-muted-foreground', styles.mono)} title={title}>
      {children}
    </div>
  ),
);

MonoText.displayName = 'GoalMonoText';

export const KindIcon = memo<{ kind: GoalGraphNodeKind; size?: number }>(({ kind, size = 14 }) =>
  createElement(KIND_ICON[kind], { color: KIND_COLOR[kind].line, size }),
);

KindIcon.displayName = 'GoalKindIcon';
