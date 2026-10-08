import type { TaskPriority, TaskStatus, TaskWorkflowCategory } from '@orvilo/types';
import { format, parseISO } from 'date-fns';
import type { ReactNode } from 'react';
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
import IssueStatusPicker from '../features/IssueStatusPicker';
import TaskExecutionBadge from '../features/TaskExecutionBadge';
import TaskLabelSelector from '../features/TaskLabelSelector';
import TaskPriorityTag from '../features/TaskPriorityTag';
import { openTaskScheduleDialog } from '../features/TaskScheduleDialog';
import TaskTriggerTag from '../features/TaskTriggerTag';
import { useTeamWorkflowStates } from '../features/useTeamWorkflowStates';
import { shouldShowMemberAssignee } from '../shared/memberAssigneeMode';
import { useUserDisplayMeta } from '../shared/useUserDisplayMeta';
import { isDueDateOverdue } from './isDueDateOverdue';
import { taskDetailLayoutStyles as styles } from './taskDetailLayoutStyles';
import { useTaskDetailSelector, useTaskDetailTaskId } from './TaskDetailScope';
import TaskPrerequisites from './TaskPrerequisites';
import TaskScheduleConfig from './TaskScheduleConfig';

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

/**
 * One value-only property. The value controls carry their own glyph and
 * placeholder ("Add assignee", "No priority"), so a second label column only
 * repeated them; the field name stays on the group's accessible name and as a
 * hover title.
 */
const PropertyRow = ({ children, label }: { children: ReactNode; label: string }) => (
  <div aria-label={label} className={styles.propertyRow} role="group" title={label}>
    <div className={styles.propertyValue}>{children}</div>
  </div>
);

const TaskProperties = memo(() => {
  const { t } = useTranslation(['chat', 'common']);

  const taskId = useTaskDetailTaskId();
  const dispatchPhase = useTaskDetailSelector(taskDetailSelectors.taskDispatchPhase);
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

  const workflowStateName = teamStates?.find(
    (state) => state.id === workflowStateRefId || state.remoteStateId === workflowStateId,
  )?.name;
  const priorityMeta = PRIORITY_META[priority as TaskPriority] ?? PRIORITY_META[0];

  // The rail's Status row is the canonical Issue Status — the workflow
  // category — for every task; execution run state is a separate badge.
  const issueCategory: TaskWorkflowCategory = workflowCategory ?? 'backlog';
  const workflowMark = {
    category: issueCategory,
    color: WORKFLOW_CATEGORY_VISUALS[issueCategory].color,
    Icon: WORKFLOW_CATEGORY_VISUALS[issueCategory].icon,
  };
  const WorkflowIcon = workflowMark.Icon;

  const dueDateOverdue =
    !!dueDate &&
    isDueDateOverdue(dueDate) &&
    status !== 'completed' &&
    status !== 'canceled' &&
    workflowCategory !== 'done';
  const priorityLevel = (priority as TaskPriority | undefined) ?? 0;

  const statusValue = (
    <div
      className="flex min-w-0 cursor-pointer items-center gap-1.5"
      data-task-workflow-state={workflowMark?.category}
    >
      <WorkflowIcon color={workflowMark.color} size={16} />
      <span className="truncate">
        {workflowStateName ?? t(`taskDetail.workflow.category.${workflowMark.category}` as never)}
      </span>
    </div>
  );

  return (
    // Plane's property order for the fields we share: State, Assignee,
    // Priority, Due date, Labels. Reviewer and Schedule stay after those.
    <div className={styles.railSection}>
      <span className={styles.railSectionLabel}>{t('taskDetail.properties')}</span>
      <div className={styles.properties}>
        <PropertyRow label={t('taskDetail.property.state')}>
          <IssueStatusPicker
            taskIdentifier={taskId}
            teamId={taskTeamId}
            workflowCategory={workflowCategory}
            workflowStateId={workflowStateId}
            workflowStateRefId={workflowStateRefId}
          >
            {statusValue}
          </IssueStatusPicker>
        </PropertyRow>

        <PropertyRow label={t('taskDetail.executionStatus')}>
          <TaskExecutionBadge showLabel dispatchPhase={dispatchPhase} size={16} status={status} />
        </PropertyRow>

        {shouldShowMemberAssignee(activeWorkspaceId, assigneeUserId) && (
          <PropertyRow label={t('taskDetail.assignee')}>
            <AssigneeMemberSelector
              currentUserId={assigneeUserId}
              disabled={status === 'running'}
              taskCreatorId={createdByUserId}
              taskIdentifier={taskId}
              taskVisibility={visibility}
            >
              <div className="flex min-w-0 cursor-pointer items-center gap-1.5">
                {assigneeUserId ? (
                  <>
                    <AssigneeUserAvatar size={16} userId={assigneeUserId} />
                    <span className="truncate">{memberMeta?.title}</span>
                  </>
                ) : (
                  <span className={styles.propertyPlaceholder}>
                    {t('taskDetail.property.addAssignee')}
                  </span>
                )}
              </div>
            </AssigneeMemberSelector>
          </PropertyRow>
        )}

        <PropertyRow label={t('taskDetail.property.priority')}>
          <TaskPriorityTag priority={priority} taskIdentifier={taskId}>
            <div className="flex min-w-0 cursor-pointer items-center gap-1.5">
              <TaskPriorityTag
                disableDropdown
                priority={priority}
                size={16}
                taskIdentifier={taskId}
              />
              <span className={priorityLevel === 0 ? styles.propertyPlaceholder : undefined}>
                {t(`taskDetail.${priorityMeta.labelKey}` as never)}
              </span>
            </div>
          </TaskPriorityTag>
        </PropertyRow>

        <PropertyRow label={t('taskDetail.dueDate')}>
          <div
            className="flex min-w-0 cursor-pointer items-center"
            onClick={() => openTaskScheduleDialog({ dueDate: dueDate ?? null, identifier: taskId })}
          >
            <span
              className={
                dueDateOverdue
                  ? styles.propertyDanger
                  : dueDate
                    ? undefined
                    : styles.propertyPlaceholder
              }
            >
              {dueDate
                ? format(parseISO(dueDate), 'MMM d, yyyy')
                : t('taskDetail.property.addDueDate')}
            </span>
          </div>
        </PropertyRow>

        <PropertyRow label={t('taskDetail.labels.title')}>
          <TaskLabelSelector
            assignedLabels={labels}
            disabled={status === 'running'}
            taskIdentifier={taskId}
          >
            <div className="flex min-w-0 cursor-pointer items-center">
              {labels.length > 0 ? (
                <LabelChips labels={labels} max={3} />
              ) : (
                <span className={styles.propertyPlaceholder}>
                  {t('taskDetail.property.addLabels')}
                </span>
              )}
            </div>
          </TaskLabelSelector>
        </PropertyRow>

        {(workflowCategory === 'in_review' || reviewerUserId) &&
          shouldShowMemberAssignee(activeWorkspaceId, reviewerUserId) && (
            <PropertyRow label={t('taskDetail.reviewer')}>
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
                      <div className="flex min-w-0 cursor-pointer items-center gap-1.5">
                        {reviewerUserId ? (
                          <>
                            <AssigneeUserAvatar size={16} userId={reviewerUserId} />
                            <span className="truncate">{reviewerMeta?.title}</span>
                          </>
                        ) : (
                          <span className={styles.propertyPlaceholder}>
                            {t('taskDetail.property.addReviewer')}
                          </span>
                        )}
                      </div>
                    }
                  />
                  <TooltipContent>{t('taskDetail.reviewer')}</TooltipContent>
                </Tooltip>
              </AssigneeMemberSelector>
            </PropertyRow>
          )}

        <PropertyRow label={t('taskDetail.property.schedule')}>
          <TaskScheduleConfig>
            <div className="flex min-w-0 cursor-pointer items-center">
              <TaskTriggerTag
                automationMode={automationMode}
                heartbeatInterval={heartbeatInterval}
                mode="inline"
                schedulePattern={schedulePattern}
                scheduleTimezone={scheduleTimezone}
              />
            </div>
          </TaskScheduleConfig>
        </PropertyRow>

        {/* Linear parks relations in the properties sidebar: Blocked by, Blocks,
            Related — one flag-marked field per kind. */}
        <TaskPrerequisites />
      </div>
    </div>
  );
});

export default TaskProperties;
