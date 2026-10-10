'use client';

import { ArrowRightIcon } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { memo } from 'react';

import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useActiveRouteParams } from '@/hooks/useActiveRouteParams';

import { GoalProgress } from './GoalProgress';
import GoalStatusGlyph from './GoalStatusGlyph';
import type { GoalItemProps } from './types';

const styles = {
  card: 'min-w-0 [transition:border-color_0.2s_var(--ant-motion-ease-out),background_0.2s_var(--ant-motion-ease-out),transform_0.2s_var(--ant-motion-ease-out)] hover:[transform:translateY(-1px)] hover:border-(--ant-color-primary-border) hover:bg-(--ant-color-fill-quaternary)',
};

export const GoalCardItem = memo<GoalItemProps>(({ goal: item }) => {
  const navigate = useWorkspaceAwareNavigate();
  const { aid } = useActiveRouteParams<{ aid?: string }>();
  const { goal } = item;
  // On the project Goals page there is no `aid` in the route, and a goal created
  // there has no responsible agent either — so fall back the same way tasks do,
  // to the bare detail route. Without this every card there is a dead link.
  const agentId = aid ?? goal.agentId;
  const handleClick = () => {
    navigate(agentId ? `/agent/${agentId}/goal/${goal.id}` : `/goal/${goal.id}`);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    handleClick();
  };

  return (
    <div
      className={`flex flex-col cursor-pointer gap-3 rounded-md border border-border ${styles.card}`}
      role={'link'}
      style={{ padding: 16 }}
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-start gap-3 justify-between">
        <div className="flex flex-col gap-1" style={{ minWidth: 0 }}>
          <div className="flex items-center gap-[7px]">
            <GoalStatusGlyph size={13} status={goal.status} />
            <div className="truncate min-w-0 text-[15px] font-semibold">{goal.title}</div>
          </div>
          {goal.requirement && goal.requirement !== goal.title && (
            <div className="truncate min-w-0 text-[12px] text-muted-foreground">
              {goal.requirement}
            </div>
          )}
        </div>
        <ArrowRightIcon color={'var(--ant-color-text-quaternary)'} size={16} />
      </div>
      <GoalProgress
        findingCount={item.findingCount}
        pendingDecisions={item.pendingDecisions}
        taskDone={item.taskDone}
        taskTotal={item.taskTotal}
        totalRunCost={item.totalRunCost}
        totalRunDuration={item.totalRunDuration}
      />
    </div>
  );
});

GoalCardItem.displayName = 'GoalCardItem';
