import type { TaskStatus } from '@orvilo/types';
import { cn } from 'cn';
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

const styles = {
  assignReveal:
    'opacity-0 transition-opacity duration-(--orvilo-motion-mid) [[data-task-board-card]:hover_&]:opacity-100 [[data-task-board-card]:focus-within_&]:opacity-100 [[data-task-board-card]:has([data-open])_&]:opacity-100 [@media(hover:none)]:opacity-100 motion-reduce:transition-none',
  card: 'cursor-pointer relative p-4 rounded-(--radius-card) bg-card ring-1 ring-divider transition-[background-color,box-shadow] duration-(--orvilo-motion-fast) hover:bg-popover hover:ring-border motion-reduce:transition-none',
  cardOverlay: 'bg-popover hover:bg-popover',
  description: 'line-clamp-1 m-0 text-sm leading-5.5 text-muted-foreground',
  title:
    'line-clamp-2 text-sm leading-5.5 font-medium text-foreground no-underline [word-break:break-word] focus-visible:rounded-(--radius-button) focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-3',
};

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
    // A stale `running` run state must not animate a card the Issue workflow has
    // already moved out of progress (e.g. back to Todo).
    const generating =
      status === 'running' &&
      (task.workflowCategory === 'in_progress' || task.workflowCategory === 'in_review');
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
          <span className={cn(styles.assignReveal, 'inline-flex')}>
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
                  size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
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
        className={cn(styles.card, overlay && styles.cardOverlay)}
        data-collab-id={`task:${task.id}`}
        data-collab-id-alt={`task:${task.identifier}`}
        data-collab-private={isPrivate || undefined}
        onClick={overlay ? undefined : handleClick}
      >
        {/* Row 1 — identifier + executor (Cordy: issue identifier top-left,
          assigned executor top-right). */}
        <div className="flex items-center gap-2 min-h-6">
          <div className="truncate block font-mono text-xs leading-5 text-muted-foreground flex-1 min-w-0">
            {task.identifier}
          </div>
          <div className="flex shrink-0 items-center gap-1">{executorNode}</div>
        </div>

        {/* Row 2 — status glyph + title, two lines max. */}
        <div className="flex items-start gap-1.5 mt-1 min-w-0">
          {shows('status') ? (
            <span
              className="flex-none mt-0.5"
              data-collab-id={`task:${task.id}:status`}
              data-collab-id-alt={`task:${task.identifier}:status`}
            >
              {workflowGlyph ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span className="inline-flex">
                          {createElement(workflowGlyph.icon, {
                            color: workflowGlyph.color,
                            size: 16,
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
                  size: 16,
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
              onKeyDown={(event) => event.stopPropagation()}
            >
              {hasName ? task.name : task.identifier}
            </Link>
          )}
        </div>

        {/* Optional description preview (Cordy shows one muted line). */}
        {task.description?.trim() ? (
          <p className={styles.description}>{markdownToTxt(task.description).trim()}</p>
        ) : null}

        {/* Chip row — priority, schedule, subtask progress. */}
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5 min-h-5 min-w-0">
          {shows('priority') ? (
            <TaskPriorityTag priority={task.priority} taskIdentifier={task.identifier} />
          ) : null}
          <LinearTaskSyncStatus taskId={task.id} />
          {shows('project') && projectName ? (
            <Tag className="py-0 text-xs leading-5 text-foreground" size="xl" variant="outline">
              {<PROJECT_ENTITY_ICON size={16} />}
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
        </div>

        {/* Meta row — human owner + date on the left, subtask progress and the
          live-run entry on the right. */}
        <div className="flex items-center gap-2 mt-1.5 min-h-6 min-w-0">
          <div
            className="flex shrink-0 items-center gap-1"
            data-collab-id={`task:${task.id}:assignee`}
            data-collab-id-alt={`task:${task.identifier}:assignee`}
          >
            {shows('assignee') ? ownerNode : null}
          </div>
          {shows('updated') && time ? (
            <div className="truncate block font-mono text-xs leading-5 text-muted-foreground min-w-0">
              {/* Linear cards stamp the creation date, not the last touch. */}
              {tChat('taskList.createdAt', { date: time, defaultValue: 'Created {{date}}' })}
            </div>
          ) : null}
          <div className="flex shrink-0 items-center gap-1 ms-auto">
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
      return <GeneratingBorder generating={generating}>{card}</GeneratingBorder>;
    }

    // The trigger has to clone the real DOM card: wrapping GeneratingBorder
    // (which does not forward props) drops the injected contextmenu handlers.
    return (
      <GeneratingBorder generating={generating}>
        <SidebarContextMenu items={contextMenuItems} onMenuOpen={handleContextMenuOpen}>
          {card}
        </SidebarContextMenu>
      </GeneratingBorder>
    );
  },
);

export default TaskBoardCard;
