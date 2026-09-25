import { Block, ContextMenuTrigger, Flexbox, Icon, Tooltip } from '@lobehub/ui';
import { ActionIcon, Text } from '@lobehub/ui/base-ui';
import type { TaskStatus } from '@orvilo/types';
import { cssVar } from 'antd-style';
import dayjs from 'dayjs';
import { MessageSquareTextIcon } from 'lucide-react';
import type { MouseEvent } from 'react';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { WORKFLOW_CATEGORY_VISUALS } from '@/components/ExecutionStatus';
import LabelChips from '@/features/Labels/LabelChips';
import {
  getProjectMilestoneIssuesPath,
  type TaskMilestoneRef,
} from '@/features/Projects/milestoneFilter';
import MilestoneIcon from '@/features/Projects/MilestoneIcon';
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
import { TASK_VISIBILITY_ICONS } from './taskVisibilityLabel';
import { UnassignedAssigneeIcon } from './UnassignedAssigneeIcon';
import { useTaskItemContextMenu } from './useTaskItemContextMenu';

export type TaskItemRouteScope = 'agent' | 'global';

interface TaskItemProps {
  /**
   * Project-issues parity row: Linear's issue list leads with the priority
   * icon, then the identifier, then the status icon —
   * `[priority][ID][status][title]` — and drops the workflow text chip. Linked
   * workflow state gets the canonical display-only glyph; tasks without a
   * linked state keep the execution-status selector. Measured
   * against the live reference 2026-09-24 on the project issues and my-issues
   * surfaces: priority svg @x=287, ID @311, status icon @380, title @403.
   */
  linearIssueRow?: boolean;
  /**
   * The resolved milestone this row links, supplied by the list when the
   * "Milestones" display property is on and the scope's catalog names the
   * link. `undefined` renders no badge — rows never invent one from a raw id.
   */
  milestone?: TaskMilestoneRef;
  onStatusChange?: (status: TaskStatus) => void | Promise<void>;
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

const AgentTaskItem = memo<TaskItemProps>((props) => {
  const { linearIssueRow, milestone, onStatusChange, task, routeScope = 'agent' } = props;
  const { t, i18n } = useTranslation('common');
  const { t: tChat } = useTranslation('chat');
  const fetchTaskDetail = useTaskStore((s) => s.fetchTaskDetail);
  const updateTask = useTaskStore((s) => s.updateTask);
  const openTopicDrawer = useTaskStore((s) => s.openTopicDrawer);
  const taskDetail = useTaskStore((s) => s.taskDetailMap[task.identifier]);
  const { items: contextMenuItems, onContextMenu: handleContextMenuOpen } = useTaskItemContextMenu(
    task,
    routeScope,
    onStatusChange,
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
  const workflowGlyph =
    linearIssueRow && task.workflowStateId && task.workflowCategory
      ? WORKFLOW_CATEGORY_VISUALS[task.workflowCategory]
      : null;

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

  // The chip opens the project's milestone-filtered issues — the same door the
  // overview's progress link uses — without tripping the row's own detail
  // navigation.
  const handleMilestoneClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (!milestone || !task.projectId) return;
      event.stopPropagation();
      navigate(getProjectMilestoneIssuesPath(task.projectId, milestone.id));
    },
    [milestone, navigate, task.projectId],
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

  // Linear's issue-row milestone marker: `◆ name · Sep 30`, drawn with the
  // shared brand-indigo paint so it matches the overview/rail milestones.
  const milestoneBadge = milestone ? (
    <Block
      horizontal
      align={'center'}
      flex={'none'}
      gap={4}
      height={20}
      paddingInline={6}
      style={{ borderRadius: 4, cursor: task.projectId ? 'pointer' : undefined }}
      title={milestone.name}
      variant={'outlined'}
      onClick={handleMilestoneClick}
    >
      <MilestoneIcon size={10} />
      <Text ellipsis fontSize={12} style={{ maxWidth: 140 }} type={'secondary'}>
        {milestone.name}
      </Text>
      {milestone.date ? (
        <Text fontSize={12} style={{ whiteSpace: 'nowrap' }} type={'secondary'}>
          {dayjs(milestone.date).format('MMM D')}
        </Text>
      ) : null}
    </Block>
  ) : null;

  const isPrivate = task.visibility === 'private';
  const privacyBadge = isPrivate ? (
    <Tooltip title={tChat('createTask.visibility.helperPrivate', { defaultValue: 'Private' })}>
      <Icon color={cssVar.colorTextDescription} icon={TASK_VISIBILITY_ICONS.private} size={14} />
    </Tooltip>
  ) : null;

  // The leading cells differ by surface. Linear's issue row is fixed as
  // `[priority][ID][status][title]` (audit-2026-09-24.md — measured on the
  // live reference); the shared/task scopes keep their original chrome of
  // `[priority][status][workflow chip][ID][title]`.
  const identifierNode = (
    <Text style={{ flex: 'none' }} type={'secondary'}>
      {task.identifier}
    </Text>
  );
  const titleTextNode = (
    <Text ellipsis style={{ minWidth: 0 }} weight={500}>
      {hasName ? task.name : task.identifier}
    </Text>
  );

  const titleRow = (
    <Flexbox horizontal align={'center'} gap={8} style={{ minWidth: 0 }}>
      <TaskPriorityTag priority={task.priority} taskIdentifier={task.identifier} />
      {linearIssueRow && hasName && identifierNode}
      <span
        data-collab-id={`task:${task.id}:status`}
        data-collab-id-alt={`task:${task.identifier}:status`}
      >
        {workflowGlyph ? (
          <Tooltip title={tChat(`taskDetail.workflow.category.${task.workflowCategory}` as never)}>
            <span data-task-workflow-icon={task.workflowCategory}>
              <Icon color={workflowGlyph.color} icon={workflowGlyph.icon} size={16} />
            </span>
          </Tooltip>
        ) : (
          <TaskStatusTag
            status={status}
            taskIdentifier={task.identifier}
            triageTarget={
              task.teamId
                ? { domainRevision: task.domainRevision, id: task.id, teamId: task.teamId }
                : undefined
            }
            onChange={onStatusChange}
          />
        )}
      </span>
      <LinearTaskSyncStatus taskId={task.id} />
      {!linearIssueRow && (
        <TaskWorkflowBadge
          executionStatus={task.status}
          workflowCategory={task.workflowCategory}
          workflowStateId={task.workflowStateId}
        />
      )}
      {privacyBadge}
      {/* Linear rows render the identifier ahead of the status icon (above);
          shared rows keep it beside the title. A nameless task falls back to
          the identifier as its title text either way. */}
      {hasName && !linearIssueRow ? (
        <>
          {identifierNode}
          {titleTextNode}
        </>
      ) : (
        titleTextNode
      )}
      {scheduledBadge}
      {/* Linear draws issue labels inline after the title. The wrapper's
          data attribute is the display-properties toggle's hide hook
          (`rowHideLabels`) — the chips themselves never render a toggled-off
          row. */}
      {task.labels?.length ? (
        <Flexbox data-task-labels flex={'none'} style={{ minWidth: 0 }}>
          <LabelChips labels={task.labels} max={2} />
        </Flexbox>
      ) : null}
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
        // Linear's issue rows sit on a 44px pitch (measured): the list wrapper
        // adds 2px, so this block needs 42 — 22px content + 10px block padding.
        paddingBlock={linearIssueRow ? 10 : 8}
        paddingInline={12}
        variant={'borderless'}
        onClick={handleClick}
      >
        <Flexbox horizontal align={'center'} gap={4} justify={'space-between'}>
          {titleRow}
          <Flexbox horizontal align={'center'} flex={'none'} gap={8}>
            {milestoneBadge}
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
