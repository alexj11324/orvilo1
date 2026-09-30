import { Text } from '@lobehub/ui/base-ui';
import { cssVar } from 'antd-style';
import { CalendarClock, HeartPulse } from 'lucide-react';
import { createElement, memo } from 'react';

import { WORKFLOW_CATEGORY_VISUALS } from '@/components/ExecutionStatus';
import { PriorityIcon } from '@/components/PriorityIcon';
import MilestoneIcon from '@/features/Projects/MilestoneIcon';

import AssigneeAvatar from '../features/AssigneeAvatar';
import AssigneeUserAvatar from '../features/AssigneeUserAvatar';
import TaskStatusIcon from '../features/TaskStatusIcon';
import { UnassignedAssigneeIcon } from '../features/UnassignedAssigneeIcon';
import { useAgentDisplayMeta } from '../shared/useAgentDisplayMeta';
import { useUserDisplayMeta } from '../shared/useUserDisplayMeta';
import type { TaskGroupMeta } from './listViewOptions';

const AssigneeLabel = memo<{ agentId: string }>(({ agentId }) => {
  const displayMeta = useAgentDisplayMeta(agentId);
  return <>{displayMeta?.title}</>;
});

const AssigneeUserLabel = memo<{ userId: string }>(({ userId }) => {
  const displayMeta = useUserDisplayMeta(userId);
  return <>{displayMeta?.title}</>;
});

const TaskGroupPrefix = ({ group }: { group: TaskGroupMeta }) => {
  if (group.groupBy === 'assignee') {
    if (group.assigneeId) return <AssigneeAvatar agentId={group.assigneeId} size={18} />;
    return <UnassignedAssigneeIcon kind={'human'} size={14} />;
  }

  if (group.groupBy === 'member') {
    if (group.assigneeUserId) return <AssigneeUserAvatar size={18} userId={group.assigneeUserId} />;
    return <UnassignedAssigneeIcon kind={'human'} size={14} />;
  }

  if (group.groupBy === 'priority') {
    return <PriorityIcon priority={group.priority} size={16} />;
  }

  if (group.groupBy === 'milestone') {
    // The same brand-indigo diamond the overview/rail milestones carry —
    // "No milestone" keeps it muted like the other unassigned buckets.
    return <MilestoneIcon muted={!group.milestoneId} size={14} />;
  }

  if (group.groupBy === 'automationMode') {
    return createElement(group.automationMode === 'heartbeat' ? HeartPulse : CalendarClock, {
      color: cssVar.colorTextDescription,
      size: 16,
    });
  }

  if (group.groupBy === 'status') {
    if (group.workflowCategory) {
      const visual = WORKFLOW_CATEGORY_VISUALS[group.workflowCategory];
      return createElement(visual.icon, { color: visual.color, size: 16 });
    }
    return <TaskStatusIcon size={16} status={group.status ?? 'backlog'} />;
  }

  return null;
};

interface TaskGroupLabelProps {
  group: TaskGroupMeta;
}

const TaskGroupLabel = memo<TaskGroupLabelProps>(({ group }) => (
  <div className="flex shrink-0 items-center gap-1.5" style={{ overflow: 'hidden' }}>
    <TaskGroupPrefix group={group} />
    <Text ellipsis weight={500}>
      {group.groupBy === 'assignee' && group.assigneeId ? (
        <AssigneeLabel agentId={group.assigneeId} />
      ) : group.groupBy === 'member' && group.assigneeUserId ? (
        <AssigneeUserLabel userId={group.assigneeUserId} />
      ) : (
        group.label
      )}
    </Text>
  </div>
));

export default TaskGroupLabel;
