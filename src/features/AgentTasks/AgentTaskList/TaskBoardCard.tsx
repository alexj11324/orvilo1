import type { TaskStatus } from '@orvilo/types';
import { createStaticStyles, cx } from 'antd-style';
import { MessageSquareTextIcon } from 'lucide-react';
import { createElement, memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import ActionIcon from '@/components/ActionIcon';
import { WORKFLOW_CATEGORY_VISUALS } from '@/components/ExecutionStatus';
import GeneratingBorder from '@/components/GeneratingBorder';
import Link from '@/components/Link';
import { Badge as Tag } from '@/components/reui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import SidebarContextMenu from '@/features/NavPanel/components/SidebarContextMenu';
import { PROJECT_ENTITY_ICON } from '@/features/Projects/ProjectIcon';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';
import { useCurrentProjectList, useProjectStore } from '@/store/project';
import { useTaskStore } from '@/store/task';
import type { TaskListItem } from '@/store/task/slices/list/initialState';
import { markdownToTxt } from '@/utils/markdownToTxt';

import type { TaskItemRouteScope } from '../features/AgentTaskItem';
import AssigneeAgentSelector from '../features/AssigneeAgentSelector';
import AssigneeAvatar from '../features/AssigneeAvatar';
import AssigneeMemberSelector from '../features/AssigneeMemberSelector';
import AssigneeUserAvatar from '../features/AssigneeUserAvatar';
import { formatTaskItemDate } from '../features/formatTaskItemDate';
import TaskPriorityTag from '../features/TaskPriorityTag';
import TaskSubtaskProgressTag from '../features/TaskSubtaskProgressTag';
import TaskTriggerTag from '../features/TaskTriggerTag';
import { UnassignedAssigneeIcon } from '../features/UnassignedAssigneeIcon';
import { useTaskItemContextMenu } from '../features/useTaskItemContextMenu';
import LinearTaskSyncStatus from '../shared/LinearTaskSyncStatus';
import { shouldShowMemberAssignee } from '../shared/memberAssigneeMode';
import { taskDetailPath } from '../shared/taskDetailPath';
import { useTaskWorkflowGlyph } from '../shared/TaskWorkflowBadge';
import type { TaskStatusChoice } from './kanbanBoardModel';

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

    /* Shared surface roles work in either theme, without a heavy black shadow. */
    background: ${cssVar.colorBgContainer};
    box-shadow: 0 0 0 1px ${cssVar.colorBorderSecondary};

    transition:
      background 150ms,
      box-shadow 150ms;

    &:hover {
      background: ${cssVar.colorBgElevated};
      box-shadow: 0 0 0 1px ${cssVar.colorBorder};
    }

    @media (prefers-reduced-motion: reduce) {
      transition: none;
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
    color: ${cssVar.colorTextSecondary};
  `,
  title: css`
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;

    font-size: 14px;
    font-weight: 500;
    line-height: 20px;
    color: ${cssVar.colorText};
    word-break: break-word;
    text-decoration: none;

    &:focus-visible {
      border-radius: 2px;
      outline: 2px solid ${cssVar.colorPrimary};
      outline-offset: 3px;
    }
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
   * Display properties the list and the board share. A key in the set hides
   * that chip; omitted means every chip stays visible.
   */
  hiddenProperties?: ReadonlySet<string>;
  /**
   * Board-card glyph/context-menu status. Receives the picked board column —
   * Linear-linked cards go through `moveBoard`; omit to keep the store write.
   */
  onStatusChange?: (choice: TaskStatusChoice) => void | Promise<void>;
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
 * (priority / schedule), and a meta row carrying the human owner
 * (reviewer while in review) plus live-run and subtask affordances.
 */
const TaskBoardCard = memo<TaskBoardCardProps>(
  ({ hiddenProperties, onStatusChange, overlay, routeScope = 'agent', task }) => {
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
    const activeWorkspaceSlug = useActiveWorkspaceSlug();
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
    });
    const hasName = Boolean(task.name?.trim());
    const time = formatTaskItemDate(task.createdAt, {
      formatOtherYear: t('time.formatOtherYear'),
      formatThisYear: t('time.formatThisYear'),
      locale: i18n.language,
    });

    const detailHref = buildWorkspaceAwarePath(
      taskDetailPath(
        task.identifier,
        routeScope === 'agent' ? (task.assigneeAgentId ?? undefined) : undefined,
        task.name,
      ),
      activeWorkspaceSlug,
    );

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

    const isPrivate = !activeWorkspaceId && task.visibility === 'private';

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
        ) : status === 'running' ? (
          <span className={styles.assignReveal} style={{ display: 'inline-flex' }}>
            <UnassignedAssigneeIcon kind={'agent'} />
          </span>
        ) : (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className={`inline-flex ${styles.assignReveal}`}>
                    <UnassignedAssigneeIcon kind={'agent'} />
                  </span>
                }
              />
              <TooltipContent>{tChat('taskList.assignTo')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </AssigneeAgentSelector>
    );

    // Owner slot (meta row, left): who is accountable to a human reader. In
    // review the reviewer owns the review — not the executor assignee.
    const ownerNode =
      task.workflowCategory === 'in_review'
        ? shouldShowMemberAssignee(activeWorkspaceId, task.reviewerUserId) && (
            <AssigneeMemberSelector
              currentUserId={task.reviewerUserId}
              taskCreatorId={task.createdByUserId}
              taskIdentifier={task.identifier}
              taskVisibility={task.visibility}
              onChange={(userId) => void updateTask(task.identifier, { reviewerUserId: userId })}
            >
              {task.reviewerUserId ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span>
                          <AssigneeUserAvatar userId={task.reviewerUserId} />
                        </span>
                      }
                    />
                    <TooltipContent>{tChat('taskDetail.reviewer')}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span className="inline-flex">
                          <UnassignedAssigneeIcon kind={'human'} />
                        </span>
                      }
                    />
                    <TooltipContent>{tChat('taskDetail.reviewer')}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
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
              ) : status === 'running' ? (
                <UnassignedAssigneeIcon kind={'human'} />
              ) : (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span className="inline-flex">
                          <UnassignedAssigneeIcon kind={'human'} />
                        </span>
                      }
                    />
                    <TooltipContent>{tChat('taskList.assignTo')}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </AssigneeMemberSelector>
          );

    const openRunNode =
      status === 'running' && task.currentTopicId ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <ActionIcon
                  aria-label={tChat('taskList.contextMenu.openRun', { defaultValue: 'Open run' })}
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
              }
            />
            <TooltipContent>
              {tChat('taskList.contextMenu.openRun', { defaultValue: 'Open run' })}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null;

    const shows = (property: string) => !hiddenProperties?.has(property);

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
        <div className="flex items-center gap-2" style={{ minHeight: 24 }}>
          <div
            className="truncate block font-mono text-xs text-muted-foreground"
            style={{ flex: 1, minWidth: 0 }}
          >
            {task.identifier}
          </div>
          <div className="flex shrink-0 items-center gap-1">{executorNode}</div>
        </div>

        {/* Row 2 — status glyph + title, two lines max. */}
        <div className="flex items-start gap-1.5" style={{ marginTop: 4, minWidth: 0 }}>
          {shows('status') ? (
            <span
              data-collab-id={`task:${task.id}:status`}
              data-collab-id-alt={`task:${task.identifier}:status`}
              style={{ flex: 'none', marginTop: 2 }}
            >
              {workflowGlyph ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span className="inline-flex">
                          {createElement(workflowGlyph.icon, {
                            color: workflowGlyph.color,
                            size: 14,
                          })}
                        </span>
                      }
                    />
                    <TooltipContent>{workflowGlyph.label}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                // The Issue Status mark — the canonical category glyph; an
                // uncategorized task reads as backlog, never an execution
                // status icon.
                createElement(WORKFLOW_CATEGORY_VISUALS[task.workflowCategory ?? 'backlog'].icon, {
                  color: WORKFLOW_CATEGORY_VISUALS[task.workflowCategory ?? 'backlog'].color,
                  size: 14,
                })
              )}
            </span>
          ) : null}
          {overlay ? (
            <span className={styles.title}>{hasName ? task.name : task.identifier}</span>
          ) : (
            <Link
              aria-label={`${task.identifier} ${hasName ? task.name : ''}`.trim()}
              className={styles.title}
              href={detailHref}
              onClick={(event) => event.stopPropagation()}
            >
              {hasName ? task.name : task.identifier}
            </Link>
          )}
        </div>

        {/* Optional description preview (Cordy shows one muted line). */}
        {task.description?.trim() ? (
          <p className={styles.description} style={{ margin: 0 }}>
            {markdownToTxt(task.description).trim()}
          </p>
        ) : null}

        {/* Chip row — priority, schedule, subtask progress. */}
        <div
          className="flex flex-wrap items-center gap-1.5"
          style={{ marginTop: 6, minHeight: 20, minWidth: 0 }}
        >
          {shows('priority') ? (
            <TaskPriorityTag priority={task.priority} taskIdentifier={task.identifier} />
          ) : null}
          <LinearTaskSyncStatus taskId={task.id} />
          {shows('project') && projectName ? (
            <Tag size="sm" variant="primary-outline">
              {<PROJECT_ENTITY_ICON size={12} />}
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
            <div className="text-xs text-muted-foreground">
              {tChat('taskDetail.status.scheduled', { defaultValue: 'Scheduled' })}
            </div>
          ) : null}
        </div>

        {/* Meta row — human owner + date on the left, subtask progress and the
          live-run entry on the right. */}
        <div
          className="flex items-center gap-2"
          style={{ marginTop: 6, minHeight: 24, minWidth: 0 }}
        >
          <div
            className="flex shrink-0 items-center gap-1"
            data-collab-id={`task:${task.id}:assignee`}
            data-collab-id-alt={`task:${task.identifier}:assignee`}
          >
            {shows('assignee') ? ownerNode : null}
          </div>
          {shows('updated') && time ? (
            <div
              className="truncate block font-mono text-xs text-muted-foreground"
              style={{ minWidth: 0 }}
            >
              {/* Linear cards stamp the creation date, not the last touch. */}
              {tChat('taskList.createdAt', { date: time, defaultValue: 'Created {{date}}' })}
            </div>
          ) : null}
          <div className="flex shrink-0 items-center gap-1" style={{ marginLeft: 'auto' }}>
            <TaskSubtaskProgressTag
              currentIdentifier={task.identifier}
              progress={task.subtaskProgress}
              subtasks={taskDetail?.subtasks}
              onRequestSubtasks={handleRequestSubtasks}
              onSubtaskClick={handleSubtaskClick}
            />
            {openRunNode}
          </div>
        </div>
      </div>
    );

    // The overlay twin never opens menus — it only previews the dragged card.
    if (overlay) {
      return <GeneratingBorder generating={status === 'running'}>{card}</GeneratingBorder>;
    }

    // The trigger has to clone the real DOM card: wrapping GeneratingBorder
    // (which does not forward props) drops the injected contextmenu handlers.
    return (
      <GeneratingBorder generating={status === 'running'}>
        <SidebarContextMenu items={contextMenuItems} onMenuOpen={handleContextMenuOpen}>
          {card}
        </SidebarContextMenu>
      </GeneratingBorder>
    );
  },
);

export default TaskBoardCard;
