'use client';

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
      className="flex w-full cursor-pointer items-center gap-2.5 rounded-(--radius-card) border border-divider bg-card px-3 py-2.5 outline-none hover:bg-accent active:bg-selected focus-visible:ring-3 focus-visible:ring-ring/50"
      role={'button'}
      tabIndex={0}
      onClick={openGoal}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openGoal();
      }}
    >
      <div className="flex size-9 shrink-0 flex-col items-center justify-center rounded-(--radius-card) bg-muted text-muted-foreground">
        {isActive ? (
          <RingLoadingIcon className="text-warning-text" ringColor="var(--border)" size={16} />
        ) : (
          <TargetIcon size={16} />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="min-w-0 truncate text-sm leading-5.5 font-medium">{title ?? goal.name}</div>
        <GoalStatusLine {...progress} />
      </div>
      {isActive && <GoalElapsedTime startedAt={startedAt} />}
      <ChevronRightIcon className="shrink-0 text-foreground-tertiary" size={16} />
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
