import type {
  TaskDispatchPhase,
  TaskExecutionState,
  TaskRunState,
  TaskStatus,
} from '@orvilo/types';
import { deriveTaskExecutionState } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { CircleHelp } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { EXECUTION_STATUS_VISUALS, type StatusVisual } from '@/components/ExecutionStatus';

import { SimpleTooltip } from './SimpleTooltip';

const styles = createStaticStyles(({ css }) => ({
  badge: css`
    display: inline-flex;
    gap: 4px;
    align-items: center;

    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
    white-space: nowrap;
  `,
}));

/**
 * Glyph + color per canonical execution state (`task_dispatch.phase` /
 * `task_topics.run_state` — read-only run truth), composed from the shared
 * execution visual table: queued → dim clock, provisioning → clock,
 * running → ●, waiting → hand, succeeded → ✓, failed → alert X,
 * canceled → pause glyph, outcome_unknown → question.
 */
const EXECUTION_STATE_VISUALS: Record<TaskExecutionState, StatusVisual> = {
  canceled: EXECUTION_STATUS_VISUALS.canceled,
  failed: EXECUTION_STATUS_VISUALS.failed,
  outcome_unknown: { color: cssVar.colorWarning, icon: CircleHelp },
  provisioning: EXECUTION_STATUS_VISUALS.scheduled,
  queued: { ...EXECUTION_STATUS_VISUALS.scheduled, color: cssVar.colorTextTertiary },
  running: EXECUTION_STATUS_VISUALS.running,
  succeeded: EXECUTION_STATUS_VISUALS.completed,
  waiting: EXECUTION_STATUS_VISUALS.waitingForHuman,
};

interface TaskExecutionBadgeProps {
  /** `task_dispatch.phase` — dispatch truth, wins rank ties in the projection. */
  dispatchPhase?: TaskDispatchPhase | null;
  /** `task_topics.run_state` — run truth for the current topic. */
  runState?: TaskRunState | null;
  /** Tooltip-only icon (default) or icon + text row. */
  showLabel?: boolean;
  size?: number;
  /** Legacy `tasks.status` projection — fallback signal for row payloads. */
  status?: TaskStatus | string | null;
}

/**
 * The read-only execution badge — dispatches and runs, never Issue Status.
 * It renders the canonical projection (`deriveTaskExecutionState`) and can
 * never mutate it: no dropdown, no click handler — a marker like
 * ●Running / ◷Waiting / ✓Succeeded / !Failed. A task with no run history
 * (projection null) renders nothing.
 */
const TaskExecutionBadge = memo<TaskExecutionBadgeProps>(
  ({ dispatchPhase, runState, showLabel, size = 14, status }) => {
    const { t } = useTranslation('chat');
    const execution = deriveTaskExecutionState({ dispatchPhase, legacyStatus: status, runState });
    if (!execution) return null;
    const visual = EXECUTION_STATE_VISUALS[execution];
    const VisualIcon = visual.icon;
    const label = t(`taskDetail.execution.${execution}`, { defaultValue: execution });
    const icon = <VisualIcon color={visual.color} size={size} />;
    if (!showLabel)
      return (
        <span onClick={(event) => event.stopPropagation()}>
          <SimpleTooltip title={label}>{icon}</SimpleTooltip>
        </span>
      );
    return (
      <span className={styles.badge}>
        {icon}
        <span>{label}</span>
      </span>
    );
  },
);

TaskExecutionBadge.displayName = 'TaskExecutionBadge';

export default TaskExecutionBadge;
