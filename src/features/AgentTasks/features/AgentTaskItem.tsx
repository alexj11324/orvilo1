import { Block, ContextMenuTrigger, Flexbox, Icon, Tooltip } from '@lobehub/ui';
import { ActionIcon, Text } from '@lobehub/ui/base-ui';
import type { TaskStatus } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import dayjs from 'dayjs';
import { MessageSquareTextIcon } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import IssueRowChip from '@/components/IssueRowChip';
import LabelChips from '@/features/Labels/LabelChips';
import {
  getProjectMilestoneIssuesPath,
  type TaskMilestoneRef,
} from '@/features/Projects/milestoneFilter';
import MilestoneIcon from '@/features/Projects/MilestoneIcon';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useTaskStore } from '@/store/task';
import type { TaskListItem } from '@/store/task/slices/list/initialState';

import { ISSUE_ID_WIDTH_VAR } from '../shared/issueIdColumn';
import LinearTaskSyncStatus from '../shared/LinearTaskSyncStatus';
import { shouldShowMemberAssignee } from '../shared/memberAssigneeMode';
import { taskDetailPath } from '../shared/taskDetailPath';
import { useTaskWorkflowGlyph } from '../shared/TaskWorkflowBadge';
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

// Linear's issue-row type ramp: 13px identifier (450) and title (500) on a
// 44px row. The identifier column's width comes from the list
// (`issueIdColumnStyle`), so every status mark lines up.
const styles = createStaticStyles(({ css }) => ({
  identifier: css`
    flex: none;

    min-width: var(${ISSUE_ID_WIDTH_VAR}, auto);

    font-size: 13px;
    font-weight: 450;
    font-variant-numeric: tabular-nums;
  `,
  parent: css`
    min-width: 68px;
    max-width: 240px;
    font-size: 13px;
  `,
  parentSeparator: css`
    flex: none;
    width: 17px;
    font-size: 13px;
    text-align: center;
  `,
  row: css`
    min-height: 44px;
  `,
  title: css`
    min-width: 0;
    font-size: 13px;
  `,
}));

export type TaskItemRouteScope = 'agent' | 'global';

interface TaskItemProps {
  /**
   * Leading padding in px (default 12). A list that puts a selection gutter
   * before the row trims it so the gutter and the row never overlap while the
   * priority mark keeps Linear's x.
   */
  insetStart?: number;
  /**
   * The resolved milestone this row links, supplied by the list when the
   * "Milestones" display property is on and the scope's catalog names the
   * link. `undefined` renders no badge — rows never invent one from a raw id.
   */
  milestone?: TaskMilestoneRef;
  onStatusChange?: (status: TaskStatus) => void | Promise<void>;
  routeScope?: TaskItemRouteScope;
  /**
   * Draw Linear's `› Parent title` breadcrumb after the title. Lists set it
   * on rows that are not already nested under their parent — indentation
   * says the same thing there.
   */
  showParent?: boolean;
  task: TaskListItem;
  /**
   * Caller-owned chips (e.g. the project) placed in the trailing cluster
   * before the assignee — Linear's order is labels, project, assignee, date,
   * so they cannot trail the row after the date.
   */
  trailingChips?: ReactNode;
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
  const {
    insetStart = 12,
    milestone,
    onStatusChange,
    showParent,
    task,
    trailingChips,
    routeScope = 'agent',
  } = props;
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

  // An activity feed dates each row by the activity it is listed for.
  const time = formatTaskItemDate(task.activityAt || task.updatedAt || task.createdAt, {
    formatOtherYear: t('time.formatOtherYear'),
    formatThisYear: t('time.formatThisYear'),
    locale: i18n.language,
  });
  const status = toTaskStatus(task.status);
  const hasName = Boolean(task.name?.trim());
  const workflowGlyph = useTaskWorkflowGlyph({
    executionStatus: task.status,
    teamId: task.teamId,
    workflowCategory: task.workflowCategory,
    workflowStateId: task.workflowStateId,
    workflowStateRefId: task.workflowStateRefId,
  });

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
      <IssueRowChip>
        {tChat('taskDetail.status.scheduled', { defaultValue: 'Scheduled' })}
      </IssueRowChip>
    ) : null;

  // Linear's issue-row milestone marker: `◆ name · Sep 30`, drawn with the
  // shared brand-indigo paint so it matches the overview/rail milestones.
  const milestoneBadge = milestone ? (
    <IssueRowChip
      icon={<MilestoneIcon size={10} />}
      suffix={milestone.date ? dayjs(milestone.date).format('MMM D') : undefined}
      title={milestone.name}
      onClick={task.projectId ? handleMilestoneClick : undefined}
    >
      {milestone.name}
    </IssueRowChip>
  ) : null;

  const isPrivate = task.visibility === 'private';
  const privacyBadge = isPrivate ? (
    <Tooltip title={tChat('createTask.visibility.helperPrivate', { defaultValue: 'Private' })}>
      <Icon color={cssVar.colorTextDescription} icon={TASK_VISIBILITY_ICONS.private} size={14} />
    </Tooltip>
  ) : null;

  // Linear's row grammar: priority, identifier, one status mark, title. The
  // status mark is the workflow state when the task has one — never a second
  // badge beside the execution glyph. A nameless task has no separate title,
  // so its identifier renders as the row text instead.
  const titleRow = (
    <Flexbox horizontal align={'center'} gap={8} style={{ minWidth: 0 }}>
      <TaskPriorityTag priority={task.priority} taskIdentifier={task.identifier} />
      {hasName ? (
        <Text className={styles.identifier} type={'secondary'}>
          {task.identifier}
        </Text>
      ) : null}
      <span
        data-collab-id={`task:${task.id}:status`}
        data-collab-id-alt={`task:${task.identifier}:status`}
        style={{ display: 'inline-flex', flex: 'none' }}
      >
        <TaskStatusTag
          glyph={workflowGlyph}
          size={14}
          status={status}
          taskIdentifier={task.identifier}
          onChange={onStatusChange}
        />
      </span>
      <LinearTaskSyncStatus taskId={task.id} />
      {privacyBadge}
      <Text ellipsis className={styles.title} weight={500}>
        {hasName ? task.name : task.identifier}
      </Text>
      {showParent && task.parent ? (
        <>
          <Text aria-hidden className={styles.parentSeparator} type={'secondary'}>
            ›
          </Text>
          <Text
            ellipsis
            className={styles.parent}
            title={`${task.parent.identifier} ${task.parent.name ?? ''}`.trim()}
            type={'secondary'}
            weight={500}
          >
            {task.parent.name || task.parent.identifier}
          </Text>
        </>
      ) : null}
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
      style={{ fontWeight: 450, whiteSpace: 'nowrap', width: 48 }}
      type={'secondary'}
    >
      {time}
    </Text>
  ) : null;

  return (
    <ContextMenuTrigger items={contextMenuItems} onContextMenu={handleContextMenuOpen}>
      <Block
        clickable
        className={styles.row}
        data-collab-id={`task:${task.id}`}
        data-collab-id-alt={`task:${task.identifier}`}
        data-collab-private={isPrivate || undefined}
        gap={4}
        justify={'center'}
        paddingBlock={4}
        paddingInline={`${insetStart}px 12px`}
        variant={'borderless'}
        onClick={handleClick}
      >
        <Flexbox horizontal align={'center'} gap={4} justify={'space-between'}>
          {titleRow}
          <Flexbox horizontal align={'center'} flex={'none'} gap={8}>
            {/* Linear's right cluster: labels, then milestone and project. The
                wrapper's data attribute is the display-properties toggle's hide
                hook (`rowHideLabels`). */}
            <Flexbox horizontal align={'center'} flex={'none'} gap={4}>
              {task.labels?.length ? (
                <Flexbox data-task-labels flex={'none'} style={{ minWidth: 0 }}>
                  <LabelChips labels={task.labels} max={2} />
                </Flexbox>
              ) : null}
              {milestoneBadge}
              {trailingChips}
            </Flexbox>
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
