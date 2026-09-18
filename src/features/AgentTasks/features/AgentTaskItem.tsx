import { Block, ContextMenuTrigger, Flexbox, Icon, Tooltip } from '@lobehub/ui';
import { ActionIcon, Text } from '@lobehub/ui/base-ui';
import type { TaskStatus } from '@orvilo/types';
import { cssVar } from 'antd-style';
import { LockIcon, MessageSquareTextIcon } from 'lucide-react';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useTaskStore } from '@/store/task';
import type { TaskListItem } from '@/store/task/slices/list/initialState';

import LinearTaskSyncStatus from '../shared/LinearTaskSyncStatus';
import { shouldShowMemberAssignee } from '../shared/memberAssigneeMode';
import { taskDetailPath } from '../shared/taskDetailPath';
import TaskWorkflowBadge from '../shared/TaskWorkflowBadge';
import AssigneeAgentSelector from './AssigneeAgentSelector';
import AssigneeAvatar from './AssigneeAvatar';
import AssigneeMemberSelector from './AssigneeMemberSelector';
import AssigneeUserAvatar from './AssigneeUserAvatar';
import { formatTaskItemDate } from './formatTaskItemDate';
import TaskPriorityTag from './TaskPriorityTag';
import TaskStatusTag from './TaskStatusTag';
import TaskSubtaskProgressTag from './TaskSubtaskProgressTag';
import TaskTriggerTag from './TaskTriggerTag';
import { UnassignedAssigneeIcon } from './UnassignedAssigneeIcon';
import { useTaskItemContextMenu } from './useTaskItemContextMenu';

export type TaskItemRouteScope = 'agent' | 'global';

interface TaskItemProps {
  routeScope?: TaskItemRouteScope;
  task: TaskListItem;
}

const TASK_STATUS_SET = new Set<TaskStatus>([
  'backlog',
  'canceled',
  'completed',
  'failed',
  'paused',
  'running',
  'scheduled',
]);

const toTaskStatus = (status: string): TaskStatus =>
  TASK_STATUS_SET.has(status as TaskStatus) ? (status as TaskStatus) : 'backlog';

const AgentTaskItem = memo<TaskItemProps>(({ task, routeScope = 'agent' }) => {
  const { t, i18n } = useTranslation('common');
  const { t: tChat } = useTranslation('chat');
  const fetchTaskDetail = useTaskStore((s) => s.fetchTaskDetail);
  const updateTask = useTaskStore((s) => s.updateTask);
  const openTopicDrawer = useTaskStore((s) => s.openTopicDrawer);
  const taskDetail = useTaskStore((s) => s.taskDetailMap[task.identifier]);
  const { items: contextMenuItems, onContextMenu: handleContextMenuOpen } = useTaskItemContextMenu(
    task,
    routeScope,
  );
  const navigate = useWorkspaceAwareNavigate();
  const activeWorkspaceId = useActiveWorkspaceId();

  const time = formatTaskItemDate(task.updatedAt || task.createdAt, {
    formatOtherYear: t('time.formatOtherYear'),
    formatThisYear: t('time.formatThisYear'),
    locale: i18n.language,
  });
  const status = toTaskStatus(task.status);
  const hasName = Boolean(task.name?.trim());

  const handleClick = useCallback(() => {
    navigate(
      taskDetailPath(
        task.identifier,
        routeScope === 'agent' ? (task.assigneeAgentId ?? undefined) : undefined,
        task.name,
      ),
    );
  }, [navigate, routeScope, task.assigneeAgentId, task.identifier, task.name]);

  const handleRequestSubtasks = useCallback(async () => {
    const detail = await fetchTaskDetail(task.identifier);
    return detail.subtasks ?? [];
  }, [fetchTaskDetail, task.identifier]);

  const handleSubtaskClick = useCallback(
    (identifier: string, assigneeAgentId?: string, name?: string) => {
      navigate(
        taskDetailPath(identifier, routeScope === 'agent' ? assigneeAgentId : undefined, name),
      );
    },
    [navigate, routeScope],
  );

  const scheduledBadge =
    status === 'scheduled' ? (
      <Block
        horizontal
        align={'center'}
        flex={'none'}
        height={20}
        paddingInline={8}
        style={{ borderRadius: 24 }}
        variant={'outlined'}
      >
        <Text fontSize={12} type={'secondary'}>
          {tChat('taskDetail.status.scheduled', { defaultValue: 'Scheduled' })}
        </Text>
      </Block>
    ) : null;

  const isPrivate = task.visibility === 'private';
  const privacyBadge = isPrivate ? (
    <Tooltip title={tChat('createTask.visibility.helperPrivate', { defaultValue: 'Private' })}>
      <Icon color={cssVar.colorTextDescription} icon={LockIcon} size={14} />
    </Tooltip>
  ) : null;

  const titleRow = (
    <Flexbox horizontal align={'center'} gap={8} style={{ minWidth: 0 }}>
      <TaskPriorityTag priority={task.priority} taskIdentifier={task.identifier} />
      <span
        data-collab-id={`task:${task.id}:status`}
        data-collab-id-alt={`task:${task.identifier}:status`}
      >
        <TaskStatusTag status={status} taskIdentifier={task.identifier} />
      </span>
      <LinearTaskSyncStatus taskId={task.id} />
      <TaskWorkflowBadge
        executionStatus={task.status}
        workflowCategory={task.workflowCategory}
        workflowStateId={task.workflowStateId}
      />
      {privacyBadge}
      {hasName ? (
        <>
          <Text style={{ flex: 'none' }} type={'secondary'}>
            {task.identifier}
          </Text>
          <Text ellipsis style={{ minWidth: 0 }} weight={500}>
            {task.name}
          </Text>
        </>
      ) : (
        <Text ellipsis style={{ minWidth: 0 }} weight={500}>
          {task.identifier}
        </Text>
      )}
      {scheduledBadge}
      <TaskSubtaskProgressTag
        currentIdentifier={task.identifier}
        progress={task.subtaskProgress}
        subtasks={taskDetail?.subtasks}
        onRequestSubtasks={handleRequestSubtasks}
        onSubtaskClick={handleSubtaskClick}
      />
    </Flexbox>
  );

  const assigneeNode = (
    <Flexbox
      horizontal
      align={'center'}
      data-collab-id={`task:${task.id}:assignee`}
      data-collab-id-alt={`task:${task.identifier}:assignee`}
      flex={'none'}
      gap={4}
    >
      {status === 'paused'
        ? // Pending review: the member slot shows who owns the review — the
          // reviewer (auto-stamped as assignee → creator), not the executor.
          shouldShowMemberAssignee(activeWorkspaceId, task.reviewerUserId) && (
            <AssigneeMemberSelector
              currentUserId={task.reviewerUserId}
              taskCreatorId={task.createdByUserId}
              taskIdentifier={task.identifier}
              taskVisibility={task.visibility}
              onChange={(userId) => void updateTask(task.identifier, { reviewerUserId: userId })}
            >
              {task.reviewerUserId ? (
                <Tooltip title={tChat('taskDetail.reviewer')}>
                  <span>
                    <AssigneeUserAvatar userId={task.reviewerUserId} />
                  </span>
                </Tooltip>
              ) : (
                <Tooltip title={tChat('taskDetail.reviewer')}>
                  <UnassignedAssigneeIcon kind={'human'} />
                </Tooltip>
              )}
            </AssigneeMemberSelector>
          )
        : shouldShowMemberAssignee(activeWorkspaceId, task.assigneeUserId) && (
            <AssigneeMemberSelector
              currentUserId={task.assigneeUserId}
              disabled={status === 'running'}
              taskCreatorId={task.createdByUserId}
              taskIdentifier={task.identifier}
              taskVisibility={task.visibility}
            >
              {task.assigneeUserId ? (
                <AssigneeUserAvatar tooltip={status !== 'running'} userId={task.assigneeUserId} />
              ) : (
                <Tooltip title={status === 'running' ? undefined : tChat('taskList.assignTo')}>
                  <UnassignedAssigneeIcon kind={'human'} />
                </Tooltip>
              )}
            </AssigneeMemberSelector>
          )}
      <AssigneeAgentSelector
        currentAgentId={task.assigneeAgentId}
        disabled={status === 'running'}
        taskIdentifier={task.identifier}
        taskVisibility={task.visibility}
      >
        {task.assigneeAgentId ? (
          <AssigneeAvatar agentId={task.assigneeAgentId} tooltip={status !== 'running'} />
        ) : (
          <Tooltip title={status === 'running' ? undefined : tChat('taskList.assignTo')}>
            <AssigneeAvatar agentId={task.assigneeAgentId} />
          </Tooltip>
        )}
      </AssigneeAgentSelector>
    </Flexbox>
  );

  // Running cards get a one-tap door into the live run's conversation — the
  // steering surface — without routing through the detail page first.
  const openRunNode =
    status === 'running' && task.currentTopicId ? (
      <Tooltip title={tChat('taskList.contextMenu.openRun', { defaultValue: 'Open run' })}>
        <ActionIcon
          icon={MessageSquareTextIcon}
          size={'small'}
          onClick={(event) => {
            event.stopPropagation();
            openTopicDrawer(task.currentTopicId!, {
              agentId: task.assigneeAgentId ?? undefined,
              taskId: task.identifier,
              title: task.name ?? undefined,
            });
          }}
        />
      </Tooltip>
    ) : null;

  const scheduleNode = task.automationMode ? (
    <TaskTriggerTag
      automationMode={task.automationMode}
      heartbeatInterval={task.heartbeatInterval}
      schedulePattern={task.schedulePattern}
      scheduleTimezone={task.scheduleTimezone}
    />
  ) : null;

  const timeNode = time ? (
    <Text
      align={'right'}
      fontSize={12}
      style={{ whiteSpace: 'nowrap', width: 48 }}
      type={'secondary'}
    >
      {time}
    </Text>
  ) : null;

  return (
    <ContextMenuTrigger items={contextMenuItems} onContextMenu={handleContextMenuOpen}>
      <Block
        clickable
        data-collab-id={`task:${task.id}`}
        data-collab-id-alt={`task:${task.identifier}`}
        data-collab-private={isPrivate || undefined}
        gap={4}
        padding={12}
        variant={'borderless'}
        onClick={handleClick}
      >
        <Flexbox horizontal align={'center'} gap={4} justify={'space-between'}>
          {titleRow}
          <Flexbox horizontal align={'center'} flex={'none'} gap={8}>
            {openRunNode}
            {scheduleNode}
            {assigneeNode}
            {timeNode}
          </Flexbox>
        </Flexbox>
      </Block>
    </ContextMenuTrigger>
  );
});

export default AgentTaskItem;
