import { ContextMenuTrigger, Flexbox, Icon, Tooltip } from '@lobehub/ui';
import { ActionIcon, Tag, Text } from '@lobehub/ui/base-ui';
import type { TaskStatus } from '@orvilo/types';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { MessageSquareTextIcon } from 'lucide-react';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import GeneratingBorder from '@/components/GeneratingBorder';
import { PROJECT_ENTITY_ICON } from '@/features/Projects/ProjectIcon';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useCurrentProjectList, useProjectStore } from '@/store/project';
import { useTaskStore } from '@/store/task';
import type { TaskListItem } from '@/store/task/slices/list/initialState';

import type { TaskItemRouteScope } from '../features/AgentTaskItem';
import AssigneeAgentSelector from '../features/AssigneeAgentSelector';
import AssigneeAvatar from '../features/AssigneeAvatar';
import AssigneeMemberSelector from '../features/AssigneeMemberSelector';
import AssigneeUserAvatar from '../features/AssigneeUserAvatar';
import { formatTaskItemDate } from '../features/formatTaskItemDate';
import TaskPriorityTag from '../features/TaskPriorityTag';
import TaskStatusIcon from '../features/TaskStatusIcon';
import TaskSubtaskProgressTag from '../features/TaskSubtaskProgressTag';
import TaskTriggerTag from '../features/TaskTriggerTag';
import { TASK_VISIBILITY_ICONS } from '../features/taskVisibilityLabel';
import { UnassignedAssigneeIcon } from '../features/UnassignedAssigneeIcon';
import { useTaskItemContextMenu } from '../features/useTaskItemContextMenu';
import LinearTaskSyncStatus from '../shared/LinearTaskSyncStatus';
import { shouldShowMemberAssignee } from '../shared/memberAssigneeMode';
import { taskDetailPath } from '../shared/taskDetailPath';
import { useTaskWorkflowGlyph } from '../shared/TaskWorkflowBadge';

const styles = createStaticStyles(({ css, cssVar }) => ({
  /* Cordy keeps the empty-assign affordance hidden until the card is hovered —
     an always-on dashed circle on every unassigned card reads as noise. */
  assignReveal: css`
    opacity: 0;
    transition: opacity 0.2s;

    [data-task-board-card]:hover &,
    [data-task-board-card]:focus-within &,
    [data-task-board-card]:has([data-open]) & {
      opacity: 1;
    }

    @media (hover: none) {
      opacity: 1;
    }
  `,
  card: css`
    cursor: pointer;

    position: relative;

    padding-block: 8px;
    padding-inline: 12px;
    border-radius: 8px;

    /* Linear: no stroke — a 0.5px hairline ring plus a soft drop shadow. */
    background: ${cssVar.colorFillQuaternary};
    box-shadow:
      0 0 0 0.5px ${cssVar.colorBorder},
      0 1px 2px rgb(0 0 0 / 30%);

    transition: background 0.2s;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  cardOverlay: css`
    /* DragOverlay twin: no hover affordance, shadow reads as "lifted". */
    background: ${cssVar.colorBgElevated};

    &:hover {
      background: ${cssVar.colorBgElevated};
    }
  `,
  description: css`
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;

    margin-block-start: 4px;

    font-size: 12px;
    line-height: 18px;
    color: ${cssVar.colorTextTertiary};
  `,
  title: css`
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;

    font-size: 13px;
    font-weight: 500;
    line-height: 20px;
    color: ${cssVar.colorText};
    word-break: break-word;
  `,
}));

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

interface TaskBoardCardProps {
  /**
   * Board-card glyph/context-menu status. Linear-linked cards go through
   * `moveBoard`; omit to keep the store `changeTaskStatus` default.
   */
  onStatusChange?: (status: TaskStatus) => void | Promise<void>;
  /**
   * Rendered inside the DragOverlay: skip the sortable listeners and hover
   * affordance — the lifted card is a preview, not an interactive copy.
   */
  overlay?: boolean;
  routeScope?: TaskItemRouteScope;
  task: TaskListItem;
}

/**
 * The Cordy board card, rebuilt on Orvilo's task fields: identifier row,
 * status-icon + two-line title, optional description preview, a chip row
 * (priority / schedule / privacy), and a meta row carrying the human owner
 * (reviewer while paused) plus live-run and subtask affordances.
 */
const TaskBoardCard = memo<TaskBoardCardProps>(
  ({ onStatusChange, overlay, routeScope = 'agent', task }) => {
    const { t, i18n } = useTranslation('common');
    const { t: tChat } = useTranslation('chat');
    const fetchTaskDetail = useTaskStore((s) => s.fetchTaskDetail);
    const updateTask = useTaskStore((s) => s.updateTask);
    const openTopicDrawer = useTaskStore((s) => s.openTopicDrawer);
    const taskDetail = useTaskStore((s) => s.taskDetailMap[task.identifier]);
    const { items: contextMenuItems, onContextMenu: handleContextMenuOpen } =
      useTaskItemContextMenu(task, routeScope, onStatusChange);
    const navigate = useWorkspaceAwareNavigate();
    const activeWorkspaceId = useActiveWorkspaceId();
    // Project chip: `projectId` resolves through the cached project list — an
    // unknown project renders no chip rather than a raw id (Linear honesty).
    useProjectStore((s) => s.useFetchProjectList)(Boolean(activeWorkspaceId && task.projectId));
    const projects = useCurrentProjectList();
    const projectName = task.projectId
      ? projects.find((project) => project.id === task.projectId)?.name
      : undefined;

    const status = toTaskStatus(task.status);
    // One status mark per card: the workflow state when the task has one.
    const workflowGlyph = useTaskWorkflowGlyph({
      executionStatus: task.status,
      workflowCategory: task.workflowCategory,
      workflowStateId: task.workflowStateId,
      workflowStateRefId: task.workflowStateRefId,
    });
    const hasName = Boolean(task.name?.trim());
    const time = formatTaskItemDate(task.createdAt, {
      formatOtherYear: t('time.formatOtherYear'),
      formatThisYear: t('time.formatThisYear'),
      locale: i18n.language,
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

    const isPrivate = task.visibility === 'private';
    const privacyBadge = isPrivate ? (
      <Tooltip title={tChat('createTask.visibility.helperPrivate', { defaultValue: 'Private' })}>
        <Icon color={cssVar.colorTextDescription} icon={TASK_VISIBILITY_ICONS.private} size={14} />
      </Tooltip>
    ) : null;

    // Executor slot (top-right): the agent — or the hover-revealed assign
    // affordance when the card has none. Mirrors Cordy's board card.
    const executorNode = (
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
            <span className={styles.assignReveal} style={{ display: 'inline-flex' }}>
              <UnassignedAssigneeIcon kind={'agent'} />
            </span>
          </Tooltip>
        )}
      </AssigneeAgentSelector>
    );

    // Owner slot (meta row, left): who is accountable to a human reader. While
    // paused the reviewer owns the review — not the executor assignee.
    const ownerNode =
      status === 'paused'
        ? shouldShowMemberAssignee(activeWorkspaceId, task.reviewerUserId) && (
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
          );

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

    const card = (
      <div
        data-task-board-card
        className={cx(styles.card, overlay && styles.cardOverlay)}
        data-collab-id={`task:${task.id}`}
        data-collab-id-alt={`task:${task.identifier}`}
        data-collab-private={isPrivate || undefined}
        onClick={overlay ? undefined : handleClick}
      >
        {/* Row 1 — identifier + executor (Cordy: issue identifier top-left,
          assigned executor top-right). */}
        <Flexbox horizontal align={'center'} gap={8} style={{ minHeight: 24 }}>
          <Text
            ellipsis
            fontSize={12}
            style={{ flex: 1, minWidth: 0 }}
            type={'secondary'}
            weight={450}
          >
            {task.identifier}
          </Text>
          {privacyBadge}
          <Flexbox horizontal align={'center'} flex={'none'} gap={4}>
            {executorNode}
          </Flexbox>
        </Flexbox>

        {/* Row 2 — status glyph + title, two lines max. */}
        <Flexbox horizontal align={'flex-start'} gap={6} style={{ marginTop: 4, minWidth: 0 }}>
          <span
            data-collab-id={`task:${task.id}:status`}
            data-collab-id-alt={`task:${task.identifier}:status`}
            style={{ flex: 'none', marginTop: 2 }}
          >
            {workflowGlyph ? (
              <Tooltip title={workflowGlyph.label}>
                <Icon color={workflowGlyph.color} icon={workflowGlyph.icon} size={14} />
              </Tooltip>
            ) : (
              <TaskStatusIcon size={14} status={status} />
            )}
          </span>
          <span className={styles.title}>{hasName ? task.name : task.identifier}</span>
        </Flexbox>

        {/* Optional description preview (Cordy shows one muted line). */}
        {task.description?.trim() ? (
          <p className={styles.description} style={{ margin: 0 }}>
            {task.description.trim()}
          </p>
        ) : null}

        {/* Chip row — priority, schedule, subtask progress. */}
        <Flexbox
          horizontal
          align={'center'}
          gap={6}
          style={{ marginTop: 6, minHeight: 20, minWidth: 0 }}
          wrap={'wrap'}
        >
          <TaskPriorityTag priority={task.priority} taskIdentifier={task.identifier} />
          <LinearTaskSyncStatus taskId={task.id} />
          {projectName ? (
            <Tag
              icon={<Icon icon={PROJECT_ENTITY_ICON} size={12} />}
              size="small"
              variant="outlined"
            >
              {projectName}
            </Tag>
          ) : null}
          {task.automationMode ? (
            <TaskTriggerTag
              automationMode={task.automationMode}
              heartbeatInterval={task.heartbeatInterval}
              schedulePattern={task.schedulePattern}
              scheduleTimezone={task.scheduleTimezone}
            />
          ) : null}
          {status === 'scheduled' ? (
            <Text fontSize={12} type={'secondary'}>
              {tChat('taskDetail.status.scheduled', { defaultValue: 'Scheduled' })}
            </Text>
          ) : null}
        </Flexbox>

        {/* Meta row — human owner + date on the left, subtask progress and the
          live-run entry on the right. */}
        <Flexbox
          horizontal
          align={'center'}
          gap={8}
          style={{ marginTop: 6, minHeight: 24, minWidth: 0 }}
        >
          <Flexbox
            horizontal
            align={'center'}
            data-collab-id={`task:${task.id}:assignee`}
            data-collab-id-alt={`task:${task.identifier}:assignee`}
            flex={'none'}
            gap={4}
          >
            {ownerNode}
          </Flexbox>
          {time ? (
            <Text ellipsis fontSize={12} style={{ minWidth: 0 }} type={'secondary'}>
              {/* Linear cards stamp the creation date, not the last touch. */}
              {tChat('taskList.createdAt', { date: time, defaultValue: 'Created {{date}}' })}
            </Text>
          ) : null}
          <Flexbox horizontal align={'center'} flex={'none'} gap={4} style={{ marginLeft: 'auto' }}>
            <TaskSubtaskProgressTag
              currentIdentifier={task.identifier}
              progress={task.subtaskProgress}
              subtasks={taskDetail?.subtasks}
              onRequestSubtasks={handleRequestSubtasks}
              onSubtaskClick={handleSubtaskClick}
            />
            {openRunNode}
          </Flexbox>
        </Flexbox>
      </div>
    );

    const content = <GeneratingBorder generating={status === 'running'}>{card}</GeneratingBorder>;

    // The overlay twin never opens menus — it only previews the dragged card.
    if (overlay) return content;

    return (
      <ContextMenuTrigger items={contextMenuItems} onContextMenu={handleContextMenuOpen}>
        {content}
      </ContextMenuTrigger>
    );
  },
);

export default TaskBoardCard;
