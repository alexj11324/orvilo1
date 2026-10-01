import type { TaskPriority, TaskStatus } from '@orvilo/types';
import { cssVar } from 'antd-style';
import { format, parseISO } from 'date-fns';
import { CalendarIcon, TagIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { WORKFLOW_CATEGORY_VISUALS } from '@/components/ExecutionStatus';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import LabelChips from '@/features/Labels/LabelChips';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import AssigneeMemberSelector from '../features/AssigneeMemberSelector';
import AssigneeUserAvatar from '../features/AssigneeUserAvatar';
import TaskLabelSelector from '../features/TaskLabelSelector';
import TaskPriorityTag from '../features/TaskPriorityTag';
import { openTaskScheduleDialog } from '../features/TaskScheduleDialog';
import TaskStatusTag from '../features/TaskStatusTag';
import TaskTriggerTag from '../features/TaskTriggerTag';
import { UnassignedAssigneeIcon } from '../features/UnassignedAssigneeIcon';
import { useTeamWorkflowStates } from '../features/useTeamWorkflowStates';
import { shouldShowMemberAssignee } from '../shared/memberAssigneeMode';
import { useUserDisplayMeta } from '../shared/useUserDisplayMeta';
import { isDueDateOverdue } from './isDueDateOverdue';
import { RAIL_VALUE_FONT_SIZE } from './railText';
import { taskDetailLayoutStyles as styles } from './taskDetailLayoutStyles';
import { useTaskDetailSelector, useTaskDetailTaskId } from './TaskDetailScope';
import TaskScheduleConfig from './TaskScheduleConfig';
import { resolveTaskStatusRow } from './taskStatusRow';

interface StatusMeta {
  labelKey: string;
}

const STATUS_META: Record<TaskStatus, StatusMeta> = {
  backlog: { labelKey: 'status.backlog' },
  canceled: { labelKey: 'status.canceled' },
  completed: { labelKey: 'status.completed' },
  failed: { labelKey: 'status.failed' },
  paused: { labelKey: 'status.paused' },
  running: { labelKey: 'status.running' },
  scheduled: { labelKey: 'status.scheduled' },
};

interface PriorityMeta {
  labelKey: string;
}

const PRIORITY_META: Record<TaskPriority, PriorityMeta> = {
  0: { labelKey: 'priority.none' },
  1: { labelKey: 'priority.urgent' },
  2: { labelKey: 'priority.high' },
  3: { labelKey: 'priority.normal' },
  4: { labelKey: 'priority.low' },
};

const TaskProperties = memo(() => {
  const { t } = useTranslation(['chat', 'common']);

  const taskId = useTaskDetailTaskId();
  const status = useTaskDetailSelector(taskDetailSelectors.taskStatus) as TaskStatus | undefined;
  const workflowCategory = useTaskDetailSelector(taskDetailSelectors.taskWorkflowCategory);
  const workflowStateId = useTaskDetailSelector(taskDetailSelectors.taskWorkflowStateId);
  const workflowStateRefId = useTaskDetailSelector(taskDetailSelectors.taskWorkflowStateRefId);
  const taskTeamId = useTaskDetailSelector(taskDetailSelectors.taskTeamId);
  const priority = useTaskDetailSelector(taskDetailSelectors.taskPriority);
  const dueDate = useTaskDetailSelector(taskDetailSelectors.taskDueDate);
  const labels = useTaskDetailSelector(taskDetailSelectors.taskLabels);
  const assigneeUserId = useTaskDetailSelector(taskDetailSelectors.taskAssigneeUserId);
  const reviewerUserId = useTaskDetailSelector(taskDetailSelectors.taskReviewerUserId);
  const createdByUserId = useTaskDetailSelector(taskDetailSelectors.taskCreatedByUserId);
  const visibility = useTaskDetailSelector(taskDetailSelectors.taskVisibility);
  const heartbeatInterval = useTaskDetailSelector(taskDetailSelectors.taskPeriodicInterval);
  const automationMode = useTaskDetailSelector(taskDetailSelectors.taskAutomationMode);
  const schedulePattern = useTaskDetailSelector(taskDetailSelectors.taskSchedulePattern);
  const scheduleTimezone = useTaskDetailSelector(taskDetailSelectors.taskScheduleTimezone);
  const memberMeta = useUserDisplayMeta(assigneeUserId);
  const reviewerMeta = useUserDisplayMeta(reviewerUserId);
  const updateTask = useTaskStore((s) => s.updateTask);
  const activeWorkspaceId = useActiveWorkspaceId();
  // The rail names the team's own workflow state (the shared Issue status
  // model), falling back to the category label until the catalog resolves.
  const teamStates = useTeamWorkflowStates(workflowStateId != null ? taskTeamId : null);

  if (!taskId) return null;

  const statusMeta = status ? STATUS_META[status] : STATUS_META.backlog;
  const statusRow = resolveTaskStatusRow(status, workflowCategory, workflowStateId);
  const workflowStateName = teamStates?.find(
    (state) => state.id === workflowStateRefId || state.remoteStateId === workflowStateId,
  )?.name;
  const priorityMeta = PRIORITY_META[priority as TaskPriority] ?? PRIORITY_META[0];

  const workflowMark =
    statusRow.kind === 'workflow'
      ? {
          category: statusRow.category,
          color: WORKFLOW_CATEGORY_VISUALS[statusRow.category].color,
          Icon: WORKFLOW_CATEGORY_VISUALS[statusRow.category].icon,
        }
      : null;
  const WorkflowIcon = workflowMark?.Icon;

  const statusChip = (
    <div
      className={`flex cursor-pointer items-center gap-2 ${styles.propertyItem}`}
      data-task-workflow-state={workflowMark?.category}
    >
      {WorkflowIcon && workflowMark ? (
        status ? (
          // The chip itself is the status menu trigger. Wrapping the whole
          // chip in a tooltip swallows the trigger props, so the menu never
          // opens. The execution-status hint stays on the glyph only.
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="inline-flex">
                  <WorkflowIcon color={workflowMark.color} size={16} />
                </span>
              }
            />
            <TooltipContent>
              {`${t('taskDetail.executionStatus')} · ${t(`taskDetail.status.${status}` as never)}`}
            </TooltipContent>
          </Tooltip>
        ) : (
          <WorkflowIcon color={workflowMark.color} size={16} />
        )
      ) : (
        <TaskStatusTag disableDropdown size={16} status={status} taskIdentifier={taskId} />
      )}
      <div className="font-medium" style={{ fontSize: RAIL_VALUE_FONT_SIZE }}>
        {workflowMark
          ? (workflowStateName ??
            t(`taskDetail.workflow.category.${workflowMark.category}` as never))
          : t(`taskDetail.${statusMeta.labelKey}` as never)}
      </div>
    </div>
  );

  return (
    // Linear's rail order: Status → Priority → Assignee, then the Orvilo-only
    // cells (reviewer, acceptance, schedule). Status is one row: the workflow
    // state when the task has one, else its execution status (taskStatusRow).
    <div className={styles.railSection}>
      <span className={styles.railSectionLabel}>{t('taskDetail.properties')}</span>
      <div className={styles.properties}>
        {/* One Status row — the workflow state when the task has one, else
            its execution status — over one picker: the Kanban board's own
            columns, order and glyphs, triage included. The chip stays the
            menu trigger; the execution-status tooltip sits on the glyph. */}
        <TaskStatusTag
          status={status}
          taskIdentifier={taskId}
          teamId={taskTeamId}
          workflowCategory={workflowCategory}
          workflowStateId={workflowStateId}
          workflowStateRefId={workflowStateRefId}
        >
          {statusChip}
        </TaskStatusTag>

        <TaskPriorityTag priority={priority} taskIdentifier={taskId}>
          <div className={`flex cursor-pointer items-center gap-2 ${styles.propertyItem}`}>
            <TaskPriorityTag
              disableDropdown
              priority={priority}
              size={16}
              taskIdentifier={taskId}
            />
            <div className="font-medium" style={{ fontSize: RAIL_VALUE_FONT_SIZE }}>
              {t(`taskDetail.${priorityMeta.labelKey}` as never)}
            </div>
          </div>
        </TaskPriorityTag>

        {shouldShowMemberAssignee(activeWorkspaceId, assigneeUserId) && (
          <AssigneeMemberSelector
            currentUserId={assigneeUserId}
            disabled={status === 'running'}
            taskCreatorId={createdByUserId}
            taskIdentifier={taskId}
            taskVisibility={visibility}
          >
            <div className={`flex cursor-pointer items-center gap-2 ${styles.propertyItem}`}>
              {assigneeUserId ? (
                <>
                  <AssigneeUserAvatar size={16} userId={assigneeUserId} />
                  <div
                    className="truncate block font-medium"
                    style={{ minWidth: 0, fontSize: RAIL_VALUE_FONT_SIZE }}
                  >
                    {memberMeta?.title}
                  </div>
                </>
              ) : (
                <>
                  <UnassignedAssigneeIcon kind={'human'} size={16} />
                  <div
                    className="font-medium"
                    style={{ color: cssVar.colorTextDescription, fontSize: RAIL_VALUE_FONT_SIZE }}
                  >
                    {t('taskDetail.assignee')}
                  </div>
                </>
              )}
            </div>
          </AssigneeMemberSelector>
        )}

        {/* Linear's Due date row — the shared schedule dialog (calendar +
            reminder presets) is the picker; overdue renders warning-orange. */}
        <div
          className={`flex cursor-pointer items-center gap-2 ${styles.propertyItem}`}
          onClick={() => openTaskScheduleDialog({ dueDate: dueDate ?? null, identifier: taskId })}
        >
          <CalendarIcon color={cssVar.colorTextDescription} size={16} />
          <div
            className="font-medium"
            style={{
              color:
                dueDate &&
                isDueDateOverdue(dueDate) &&
                status !== 'completed' &&
                status !== 'canceled' &&
                workflowCategory !== 'done'
                  ? cssVar.colorWarning
                  : dueDate
                    ? undefined
                    : cssVar.colorTextDescription,
              fontSize: RAIL_VALUE_FONT_SIZE,
            }}
          >
            {dueDate
              ? format(parseISO(dueDate), 'MMM d, yyyy')
              : t('taskDetail.dueDate', { defaultValue: 'Due date' })}
          </div>
        </div>

        {/* Review-phase owner: visible once the task has someone accountable for
          review (auto-stamped on the paused transition) or while it sits in
          'paused', where the picker can re-point the review. */}
        {(status === 'paused' || reviewerUserId) &&
          shouldShowMemberAssignee(activeWorkspaceId, reviewerUserId) && (
            <AssigneeMemberSelector
              currentUserId={reviewerUserId}
              disabled={status === 'running'}
              taskCreatorId={createdByUserId}
              taskIdentifier={taskId}
              taskVisibility={visibility}
              onChange={(userId, member) =>
                void updateTask(
                  taskId,
                  { reviewerUserId: userId },
                  {
                    optimisticReviewer: member
                      ? {
                          avatar: member.user?.avatar ?? null,
                          id: member.userId,
                          name: member.user?.fullName ?? null,
                          type: 'user',
                        }
                      : undefined,
                  },
                )
              }
            >
              <Tooltip>
                <TooltipTrigger
                  render={
                    <div
                      className={`flex cursor-pointer items-center gap-2 ${styles.propertyItem}`}
                    >
                      {reviewerUserId ? (
                        <>
                          <AssigneeUserAvatar size={16} userId={reviewerUserId} />
                          <div
                            className="truncate block font-medium"
                            style={{ minWidth: 0, fontSize: RAIL_VALUE_FONT_SIZE }}
                          >
                            {reviewerMeta?.title}
                          </div>
                        </>
                      ) : (
                        <>
                          <UnassignedAssigneeIcon kind={'human'} size={16} />
                          <div
                            className="font-medium"
                            style={{
                              color: cssVar.colorTextDescription,
                              fontSize: RAIL_VALUE_FONT_SIZE,
                            }}
                          >
                            {t('taskDetail.reviewer')}
                          </div>
                        </>
                      )}
                    </div>
                  }
                />
                <TooltipContent>{t('taskDetail.reviewer')}</TooltipContent>
              </Tooltip>
            </AssigneeMemberSelector>
          )}

        {/* Linear's issue labels — the rail row is the picker trigger and the
            chips themselves; empty state reads as the property name. */}
        <TaskLabelSelector
          assignedLabels={labels}
          disabled={status === 'running'}
          taskIdentifier={taskId}
        >
          <div className={`flex cursor-pointer items-center gap-2 ${styles.propertyItem}`}>
            <TagIcon color={cssVar.colorTextDescription} size={16} />
            {labels.length > 0 ? (
              <LabelChips labels={labels} max={3} />
            ) : (
              <div
                className="font-medium"
                style={{ color: cssVar.colorTextDescription, fontSize: RAIL_VALUE_FONT_SIZE }}
              >
                {t('taskDetail.labels.title')}
              </div>
            )}
          </div>
        </TaskLabelSelector>

        <TaskScheduleConfig>
          <div className={`flex cursor-pointer items-center gap-2 ${styles.propertyItem}`}>
            <TaskTriggerTag
              automationMode={automationMode}
              heartbeatInterval={heartbeatInterval}
              mode="inline"
              schedulePattern={schedulePattern}
              scheduleTimezone={scheduleTimezone}
            />
          </div>
        </TaskScheduleConfig>
      </div>
    </div>
  );
});

export default TaskProperties;
