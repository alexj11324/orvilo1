import { Block, Icon, Tooltip } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import type { TaskPriority, TaskStatus } from '@orvilo/types';
import { cssVar } from 'antd-style';
import { format, parseISO } from 'date-fns';
import { CalendarIcon, TagIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { WORKFLOW_CATEGORY_VISUALS } from '@/components/ExecutionStatus';
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
import { RAIL_VALUE_FONT_SIZE } from './railText';
import TaskAcceptanceStateRow from './TaskAcceptanceStateRow';
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

  const statusChip = (
    <Block
      clickable
      horizontal
      align="center"
      className={styles.propertyItem}
      data-task-workflow-state={statusRow.kind === 'workflow' ? statusRow.category : undefined}
      gap={8}
      variant={'borderless'}
    >
      {statusRow.kind === 'workflow' ? (
        <Icon
          color={WORKFLOW_CATEGORY_VISUALS[statusRow.category].color}
          icon={WORKFLOW_CATEGORY_VISUALS[statusRow.category].icon}
          size={16}
        />
      ) : (
        <TaskStatusTag disableDropdown size={16} status={status} taskIdentifier={taskId} />
      )}
      <Text fontSize={RAIL_VALUE_FONT_SIZE} weight={500}>
        {statusRow.kind === 'workflow'
          ? (workflowStateName ?? t(`taskDetail.workflow.category.${statusRow.category}` as never))
          : t(`taskDetail.${statusMeta.labelKey}` as never)}
      </Text>
    </Block>
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
            columns, order and glyphs, triage included. The Tooltip mounts
            only when it has a title — lobehub returns the bare child when it
            doesn't, which would swallow the props Menu.Trigger clones on. */}
        <TaskStatusTag
          status={status}
          taskIdentifier={taskId}
          teamId={taskTeamId}
          workflowCategory={workflowCategory}
          workflowStateId={workflowStateId}
          workflowStateRefId={workflowStateRefId}
        >
          {statusRow.kind === 'workflow' && status ? (
            <Tooltip
              title={`${t('taskDetail.executionStatus')} · ${t(`taskDetail.status.${status}` as never)}`}
            >
              {statusChip}
            </Tooltip>
          ) : (
            statusChip
          )}
        </TaskStatusTag>

        <TaskPriorityTag priority={priority} taskIdentifier={taskId}>
          <Block
            clickable
            horizontal
            align="center"
            className={styles.propertyItem}
            gap={8}
            variant={'borderless'}
          >
            <TaskPriorityTag
              disableDropdown
              priority={priority}
              size={16}
              taskIdentifier={taskId}
            />
            <Text fontSize={RAIL_VALUE_FONT_SIZE} weight={500}>
              {t(`taskDetail.${priorityMeta.labelKey}` as never)}
            </Text>
          </Block>
        </TaskPriorityTag>

        {shouldShowMemberAssignee(activeWorkspaceId, assigneeUserId) && (
          <AssigneeMemberSelector
            currentUserId={assigneeUserId}
            disabled={status === 'running'}
            taskCreatorId={createdByUserId}
            taskIdentifier={taskId}
            taskVisibility={visibility}
          >
            <Block
              clickable
              horizontal
              align="center"
              className={styles.propertyItem}
              gap={8}
              variant={'borderless'}
            >
              {assigneeUserId ? (
                <>
                  <AssigneeUserAvatar size={16} userId={assigneeUserId} />
                  <Text
                    ellipsis
                    fontSize={RAIL_VALUE_FONT_SIZE}
                    style={{ minWidth: 0 }}
                    weight={500}
                  >
                    {memberMeta?.title}
                  </Text>
                </>
              ) : (
                <>
                  <UnassignedAssigneeIcon kind={'human'} size={16} />
                  <Text
                    fontSize={RAIL_VALUE_FONT_SIZE}
                    style={{ color: cssVar.colorTextDescription }}
                    weight={500}
                  >
                    {t('taskDetail.assignee')}
                  </Text>
                </>
              )}
            </Block>
          </AssigneeMemberSelector>
        )}

        {/* Linear's Due date row — the shared schedule dialog (calendar +
            reminder presets) is the picker; overdue renders warning-orange. */}
        <Block
          clickable
          horizontal
          align="center"
          className={styles.propertyItem}
          gap={8}
          variant={'borderless'}
          onClick={() => openTaskScheduleDialog({ dueDate: dueDate ?? null, identifier: taskId })}
        >
          <Icon color={cssVar.colorTextDescription} icon={CalendarIcon} size={16} />
          <Text
            fontSize={RAIL_VALUE_FONT_SIZE}
            weight={500}
            style={{
              color: dueDate
                ? parseISO(dueDate).getTime() < Date.now() - 24 * 60 * 60 * 1000
                  ? cssVar.colorWarning
                  : undefined
                : cssVar.colorTextDescription,
            }}
          >
            {dueDate
              ? format(parseISO(dueDate), 'MMM d, yyyy')
              : t('taskDetail.dueDate', { defaultValue: 'Due date' })}
          </Text>
        </Block>

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
              <Tooltip title={t('taskDetail.reviewer')}>
                <Block
                  clickable
                  horizontal
                  align="center"
                  className={styles.propertyItem}
                  gap={8}
                  variant={'borderless'}
                >
                  {reviewerUserId ? (
                    <>
                      <AssigneeUserAvatar size={16} userId={reviewerUserId} />
                      <Text
                        ellipsis
                        fontSize={RAIL_VALUE_FONT_SIZE}
                        style={{ minWidth: 0 }}
                        weight={500}
                      >
                        {reviewerMeta?.title}
                      </Text>
                    </>
                  ) : (
                    <>
                      <UnassignedAssigneeIcon kind={'human'} size={16} />
                      <Text
                        fontSize={RAIL_VALUE_FONT_SIZE}
                        style={{ color: cssVar.colorTextDescription }}
                        weight={500}
                      >
                        {t('taskDetail.reviewer')}
                      </Text>
                    </>
                  )}
                </Block>
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
          <Block
            clickable
            horizontal
            align="center"
            className={styles.propertyItem}
            gap={8}
            variant={'borderless'}
          >
            <Icon color={cssVar.colorTextDescription} icon={TagIcon} size={16} />
            {labels.length > 0 ? (
              <LabelChips labels={labels} max={3} />
            ) : (
              <Text
                fontSize={RAIL_VALUE_FONT_SIZE}
                style={{ color: cssVar.colorTextDescription }}
                weight={500}
              >
                {t('taskDetail.labels.title')}
              </Text>
            )}
          </Block>
        </TaskLabelSelector>

        {/* The human layer: whether the delivery is accepted. Read-only here —
            the decision itself is made on the acceptance page this links to.
            Recurring tasks have no delivery acceptance, so no state to show. */}
        {!automationMode && <TaskAcceptanceStateRow />}

        <TaskScheduleConfig>
          <Block
            clickable
            horizontal
            align="center"
            className={styles.propertyItem}
            gap={8}
            variant={'borderless'}
          >
            <TaskTriggerTag
              automationMode={automationMode}
              heartbeatInterval={heartbeatInterval}
              mode="inline"
              schedulePattern={schedulePattern}
              scheduleTimezone={scheduleTimezone}
            />
          </Block>
        </TaskScheduleConfig>
      </div>
    </div>
  );
});

export default TaskProperties;
