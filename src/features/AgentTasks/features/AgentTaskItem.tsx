import type { TaskStatus } from '@orvilo/types';
import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import { MessageSquareTextIcon } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import ActionIcon from '@/components/ActionIcon';
import IssueRowChip from '@/components/IssueRowChip';
import LabelChips from '@/features/Labels/LabelChips';
import SidebarContextMenu from '@/features/NavPanel/components/SidebarContextMenu';
import {
  getProjectMilestoneIssuesPath,
  type TaskMilestoneRef,
} from '@/features/Projects/milestoneFilter';
import MilestoneIcon from '@/features/Projects/MilestoneIcon';
import { formatProjectDay } from '@/features/Projects/projectPlanningDate';
import { inboxRowSelectKeyDown } from '@/features/WorkInbox/inboxRowKeyboard';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useTaskStore } from '@/store/task';
import type { TaskListItem } from '@/store/task/slices/list/initialState';

import type { TaskStatusChoice } from '../AgentTaskList/kanbanBoardModel';
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
import IssueStatusPicker from './IssueStatusPicker';
import { SimpleTooltip } from './SimpleTooltip';
import TaskPriorityTag from './TaskPriorityTag';
import TaskSubtaskProgressTag from './TaskSubtaskProgressTag';
import TaskTriggerTag from './TaskTriggerTag';
import { UnassignedAssigneeIcon } from './UnassignedAssigneeIcon';
import { useTaskItemContextMenu } from './useTaskItemContextMenu';

// Issue-row type ramp: mono 12px identifier (400) and 14px title (500) on a
// 44px row. The identifier column's width comes from the list
// (`issueIdColumnStyle`), so every status mark lines up.
const styles = createStaticStyles(({ css, cssVar }) => ({
  identifier: css`
    flex: none;

    min-width: var(${ISSUE_ID_WIDTH_VAR}, auto);

    font-family: ${cssVar.fontFamilyCode};
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  `,
  parent: css`
    min-width: 68px;
    max-width: 240px;
    font-size: 12px;
  `,
  parentSeparator: css`
    flex: none;
    width: 17px;
    font-size: 12px;
    text-align: center;
  `,
  row: css`
    cursor: pointer;
    min-height: 44px;
    border-radius: ${cssVar.borderRadius};

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  title: css`
    min-width: 0;
    font-size: 14px;
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
  onStatusChange?: (choice: TaskStatusChoice) => void | Promise<void>;
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
    workflowCategory: task.workflowCategory,
    workflowStateId: task.workflowStateId,
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

  // Linear's issue-row milestone marker: `◆ name · Sep 30`, drawn with the
  // shared brand-indigo paint so it matches the overview/rail milestones.
  const milestoneBadge = milestone ? (
    <IssueRowChip
      icon={<MilestoneIcon size={10} />}
      suffix={milestone.date ? formatProjectDay(milestone.date) : undefined}
      title={milestone.name}
      onClick={task.projectId ? handleMilestoneClick : undefined}
    >
      {milestone.name}
    </IssueRowChip>
  ) : null;

  const isPrivate = !activeWorkspaceId && task.visibility === 'private';

  // Linear's row grammar: priority, identifier, one status mark, title. The
  // status mark is the workflow state when the task has one. A nameless task
  // has no separate title, so its identifier renders as the row text instead.
  const titleRow = (
    <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
      <TaskPriorityTag priority={task.priority} taskIdentifier={task.identifier} />
      {hasName ? (
        <div className={cn('text-muted-foreground', styles.identifier)}>{task.identifier}</div>
      ) : null}
      <span
        data-collab-id={`task:${task.id}:status`}
        data-collab-id-alt={`task:${task.identifier}:status`}
        style={{ display: 'inline-flex', flex: 'none' }}
      >
        <IssueStatusPicker
          glyph={workflowGlyph}
          size={14}
          taskIdentifier={task.identifier}
          teamId={task.teamId}
          workflowCategory={task.workflowCategory}
          workflowStateId={task.workflowStateId}
          workflowStateRefId={task.workflowStateRefId}
          onChange={onStatusChange}
        />
      </span>
      <LinearTaskSyncStatus taskId={task.id} />
      <div className={cn('truncate', 'block', 'font-medium', styles.title)}>
        {hasName ? task.name : task.identifier}
      </div>
      {showParent && task.parent ? (
        <>
          <div aria-hidden className={cn('text-muted-foreground', styles.parentSeparator)}>
            ›
          </div>
          <div
            title={`${task.parent.identifier} ${task.parent.name ?? ''}`.trim()}
            className={cn(
              'truncate',
              'block',
              'text-muted-foreground',
              'font-medium',
              styles.parent,
            )}
          >
            {task.parent.name || task.parent.identifier}
          </div>
        </>
      ) : null}
      <TaskSubtaskProgressTag
        currentIdentifier={task.identifier}
        progress={task.subtaskProgress}
        subtasks={taskDetail?.subtasks}
        onRequestSubtasks={handleRequestSubtasks}
        onSubtaskClick={handleSubtaskClick}
      />
    </div>
  );

  const assigneeNode = (
    <div
      className="flex flex-none items-center gap-1"
      data-collab-id={`task:${task.id}:assignee`}
      data-collab-id-alt={`task:${task.identifier}:assignee`}
    >
      {task.workflowCategory === 'in_review'
        ? // In review: the member slot shows who owns the review — the
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
                <SimpleTooltip title={tChat('taskDetail.reviewer')}>
                  <AssigneeUserAvatar userId={task.reviewerUserId} />
                </SimpleTooltip>
              ) : (
                <SimpleTooltip title={tChat('taskDetail.reviewer')}>
                  <UnassignedAssigneeIcon kind={'human'} />
                </SimpleTooltip>
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
                <SimpleTooltip
                  title={status === 'running' ? undefined : tChat('taskList.assignTo')}
                >
                  <UnassignedAssigneeIcon kind={'human'} />
                </SimpleTooltip>
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
          <SimpleTooltip title={status === 'running' ? undefined : tChat('taskList.assignTo')}>
            <AssigneeAvatar agentId={task.assigneeAgentId} />
          </SimpleTooltip>
        )}
      </AssigneeAgentSelector>
    </div>
  );

  // Running cards get a one-tap door into the live run's conversation — the
  // steering surface — without routing through the detail page first.
  const openRunNode =
    status === 'running' && task.currentTopicId ? (
      <SimpleTooltip title={tChat('taskList.contextMenu.openRun', { defaultValue: 'Open run' })}>
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
      </SimpleTooltip>
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
    <div
      className="text-right font-mono text-xs text-muted-foreground"
      style={{ whiteSpace: 'nowrap', width: 48 }}
    >
      {time}
    </div>
  ) : null;

  return (
    <SidebarContextMenu items={contextMenuItems} onMenuOpen={handleContextMenuOpen}>
      <div
        className={styles.row}
        data-collab-id={`task:${task.id}`}
        data-collab-id-alt={`task:${task.identifier}`}
        data-collab-private={isPrivate || undefined}
        role="button"
        tabIndex={0}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          justifyContent: 'center',
          paddingBlock: 4,
          paddingInline: `${insetStart}px 12px`,
        }}
        onClick={handleClick}
        onKeyDown={(event) => inboxRowSelectKeyDown(event, handleClick)}
      >
        <div className="flex items-center justify-between gap-1">
          {titleRow}
          <div className="flex flex-none items-center gap-2">
            {/* Linear's right cluster: labels, then milestone and project. The
                wrapper's data attribute is the display-properties toggle's hide
                hook (`rowHideLabels`). */}
            <div className="flex flex-none items-center gap-1">
              {task.labels?.length ? (
                <div data-task-labels style={{ flex: 'none', minWidth: 0 }}>
                  <LabelChips labels={task.labels} max={2} />
                </div>
              ) : null}
              {milestoneBadge}
              {trailingChips}
            </div>
            {openRunNode}
            {scheduleNode}
            {assigneeNode}
            {timeNode}
          </div>
        </div>
      </div>
    </SidebarContextMenu>
  );
});

export default AgentTaskItem;
