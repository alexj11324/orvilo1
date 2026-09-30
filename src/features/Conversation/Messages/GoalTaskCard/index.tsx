'use client';

import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import { ChevronRightIcon, TargetIcon } from 'lucide-react';
import { memo } from 'react';

import RingLoadingIcon from '@/components/RingLoading';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';

import type { OperationGoal } from './deriveOperationGoals';
import GoalElapsedTime from './GoalElapsedTime';
import GoalStatusLine from './GoalStatusLine';
import type { GoalTaskPhase } from './goalTaskProgress';
import { useGoalTaskStatus } from './useGoalTaskStatus';

const ACTIVE_PHASES = new Set<GoalTaskPhase>(['repairing', 'running', 'verifying']);

const styles = createStaticStyles(({ css }) => ({
  card: css`
    cursor: pointer;

    width: 100%;
    padding-block: 10px;
    padding-inline: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    background: ${cssVar.colorBgElevated};

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  chevron: css`
    flex-shrink: 0;
    color: ${cssVar.colorTextTertiary};
  `,
  icon: css`
    flex-shrink: 0;

    width: 36px;
    height: 36px;
    border-radius: 8px;

    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillTertiary};
  `,
  title: css`
    min-width: 0;
    font-size: 14px;
    font-weight: 500;
  `,
}));

const GoalCard = memo<{ goal: OperationGoal }>(({ goal }) => {
  const navigate = useWorkspaceAwareNavigate();
  const { agentId, progress, startedAt, title } = useGoalTaskStatus({
    criteriaCount: goal.criteriaCount,
    goalId: goal.goalId,
  });
  const isActive = ACTIVE_PHASES.has(progress.phase);
  const openGoal = () => {
    if (agentId) navigate(`/agent/${agentId}/goal/${goal.goalId}`);
  };

  return (
    <div
      className={cn('flex items-center gap-2.5', styles.card)}
      role={'button'}
      tabIndex={0}
      onClick={openGoal}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openGoal();
      }}
    >
      <div className={cn('flex flex-col items-center justify-center', styles.icon)}>
        {isActive ? (
          <RingLoadingIcon
            ringColor={cssVar.colorBorder}
            size={18}
            style={{ color: cssVar.colorWarning }}
          />
        ) : (
          <TargetIcon size={20} />
        )}
      </div>
      <div className="flex flex-col flex-1 gap-0.5" style={{ minWidth: 0 }}>
        <div className={cn('truncate', styles.title)}>{title ?? goal.name}</div>
        <GoalStatusLine {...progress} />
      </div>
      {isActive && <GoalElapsedTime startedAt={startedAt} />}
      <ChevronRightIcon className={styles.chevron} size={16} />
    </div>
  );
});

GoalCard.displayName = 'GoalTaskCardItem';

const GoalTaskCard = memo<{ goals: OperationGoal[] }>(({ goals }) => {
  if (goals.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {goals.map((goal) => (
        <GoalCard goal={goal} key={goal.goalId} />
      ))}
    </div>
  );
});

GoalTaskCard.displayName = 'GoalTaskCard';

export default GoalTaskCard;
