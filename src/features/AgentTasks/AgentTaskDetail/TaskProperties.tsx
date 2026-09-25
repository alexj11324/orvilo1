import { Block, Icon, Tooltip } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import type { TaskPriority, TaskStatus } from '@orvilo/types';
import { cssVar } from 'antd-style';
import { PlusIcon, TagIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import LabelChips from '@/features/Labels/LabelChips';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import AssigneeAgentSelector from '../features/AssigneeAgentSelector';
import AssigneeAvatar from '../features/AssigneeAvatar';
import AssigneeMemberSelector from '../features/AssigneeMemberSelector';
import AssigneeUserAvatar from '../features/AssigneeUserAvatar';
import TaskLabelSelector from '../features/TaskLabelSelector';
import TaskPriorityTag from '../features/TaskPriorityTag';
import TaskStatusTag from '../features/TaskStatusTag';
import TaskTriggerTag from '../features/TaskTriggerTag';
import { UnassignedAssigneeIcon } from '../features/UnassignedAssigneeIcon';
import { shouldShowMemberAssignee } from '../shared/memberAssigneeMode';
import TaskWorkflowBadge from '../shared/TaskWorkflowBadge';
import { useAgentDisplayMeta } from '../shared/useAgentDisplayMeta';
import { useUserDisplayMeta } from '../shared/useUserDisplayMeta';
import TaskAcceptanceStateRow from './TaskAcceptanceStateRow';
import { taskDetailLayoutStyles as styles } from './taskDetailLayoutStyles';
import TaskScheduleConfig from './TaskScheduleConfig';

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

  const taskId = useTaskStore(taskDetailSelectors.activeTaskId);
  const status = useTaskStore(taskDetailSelectors.activeTaskStatus) as TaskStatus | undefined;
  const workflowCategory = useTaskStore(taskDetailSelectors.activeTaskWorkflowCategory);
  const workflowStateId = useTaskStore(taskDetailSelectors.activeTaskWorkflowStateId);
  const priority = useTaskStore(taskDetailSelectors.activeTaskPriority);
  const labels = useTaskStore(taskDetailSelectors.activeTaskLabels);
  const assigneeUserId = useTaskStore(taskDetailSelectors.activeTaskAssigneeUserId);
  const assigneeAgentId = useTaskStore(taskDetailSelectors.activeTaskAgentId);
  const reviewerUserId = useTaskStore(taskDetailSelectors.activeTaskReviewerUserId);
  const createdByUserId = useTaskStore(taskDetailSelectors.activeTaskCreatedByUserId);
  const databaseId = useTaskStore(taskDetailSelectors.activeTaskDatabaseId);
  const teamId = useTaskStore(taskDetailSelectors.activeTaskTeamId);
  const domainRevision = useTaskStore(taskDetailSelectors.activeTaskDomainRevision);
  const visibility = useTaskStore(taskDetailSelectors.activeTaskVisibility);
  const heartbeatInterval = useTaskStore(taskDetailSelectors.activeTaskPeriodicInterval);
  const automationMode = useTaskStore(taskDetailSelectors.activeTaskAutomationMode);
  const schedulePattern = useTaskStore(taskDetailSelectors.activeTaskSchedulePattern);
  const scheduleTimezone = useTaskStore(taskDetailSelectors.activeTaskScheduleTimezone);
  const memberMeta = useUserDisplayMeta(assigneeUserId);
  const reviewerMeta = useUserDisplayMeta(reviewerUserId);
  const assigneeAgentMeta = useAgentDisplayMeta(assigneeAgentId);
  const updateTask = useTaskStore((s) => s.updateTask);
  const activeWorkspaceId = useActiveWorkspaceId();

  if (!taskId) return null;

  const statusMeta = status ? STATUS_META[status] : STATUS_META.backlog;
  const priorityMeta = PRIORITY_META[priority as TaskPriority] ?? PRIORITY_META[0];

  return (
    // Linear's rail order: Status → Priority → Assignee, then the Orvilo-only
    // cells (reviewer, workflow, acceptance, schedule). The section heading is
    // part of the rail's labeled groups; the container query hides it in the
    // narrow pill layout where groups collapse into one row of pills.
    <>
      <div className={styles.railSection}>
        <span aria-level={3} className={styles.railSectionLabel} role={'heading'}>
          {t('taskDetail.properties')}
        </span>
        <div className={styles.properties}>
          <TaskStatusTag
            status={status}
            taskIdentifier={taskId}
            triageTarget={
              databaseId && teamId && domainRevision
                ? { domainRevision, id: databaseId, teamId }
                : undefined
            }
          >
            <Block
              clickable
              horizontal
              align="center"
              className={styles.propertyItem}
              gap={8}
              variant={'borderless'}
            >
              <TaskStatusTag disableDropdown size={16} status={status} taskIdentifier={taskId} />
              <Text weight={500}>{t(`taskDetail.${statusMeta.labelKey}` as never)}</Text>
            </Block>
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
              <Text weight={500}>{t(`taskDetail.${priorityMeta.labelKey}` as never)}</Text>
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
                    <Text ellipsis style={{ minWidth: 0 }} weight={500}>
                      {memberMeta?.title}
                    </Text>
                  </>
                ) : (
                  <>
                    <UnassignedAssigneeIcon kind={'human'} size={16} />
                    <Text style={{ color: cssVar.colorTextDescription }} weight={500}>
                      {t('taskDetail.assignee')}
                    </Text>
                  </>
                )}
              </Block>
            </AssigneeMemberSelector>
          )}

          {/* Agent executor — Orvilo-only cell (Linear has no counterpart):
            which agent runs the task. Lives in the rail with Assignee so the
            under-title row stays a single primary-CTA cluster. */}
          <AssigneeAgentSelector
            currentAgentId={assigneeAgentId}
            disabled={status === 'running'}
            taskIdentifier={taskId}
            taskVisibility={visibility}
          >
            <Tooltip title={assigneeAgentId ? undefined : t('taskList.unassignedAgentHint')}>
              <Block
                clickable
                horizontal
                align="center"
                className={styles.propertyItem}
                gap={8}
                variant={'borderless'}
              >
                {assigneeAgentId ? (
                  <>
                    <AssigneeAvatar agentId={assigneeAgentId} size={16} />
                    <Text ellipsis style={{ minWidth: 0 }} weight={500}>
                      {assigneeAgentMeta?.title}
                    </Text>
                  </>
                ) : (
                  <>
                    <UnassignedAssigneeIcon kind={'agent'} size={16} />
                    <Text style={{ color: cssVar.colorTextDescription }} weight={500}>
                      {t('taskDetail.agent')}
                    </Text>
                  </>
                )}
              </Block>
            </Tooltip>
          </AssigneeAgentSelector>

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
                        <Text ellipsis style={{ minWidth: 0 }} weight={500}>
                          {reviewerMeta?.title}
                        </Text>
                      </>
                    ) : (
                      <>
                        <UnassignedAssigneeIcon kind={'human'} size={16} />
                        <Text style={{ color: cssVar.colorTextDescription }} weight={500}>
                          {t('taskDetail.reviewer')}
                        </Text>
                      </>
                    )}
                  </Block>
                </Tooltip>
              </AssigneeMemberSelector>
            )}

          {status && workflowStateId && (
            <Block
              horizontal
              align="center"
              className={styles.propertyItem}
              gap={8}
              variant={'borderless'}
            >
              <TaskWorkflowBadge
                executionStatus={status}
                workflowCategory={workflowCategory}
                workflowStateId={workflowStateId}
              />
            </Block>
          )}

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

      {/* Linear's Labels section — a peer of Properties, always rendered: the
        row is the picker trigger, chips when assigned and an "Add label"
        affordance either way. */}
      <div className={styles.railSection}>
        <div className={styles.railSectionHeader}>
          <span aria-level={3} className={styles.railSectionLabel} role={'heading'}>
            {t('taskDetail.labels.title')}
          </span>
        </div>
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
              <Text style={{ color: cssVar.colorTextDescription }} weight={500}>
                {t('taskDetail.labels.add')}
              </Text>
            )}
            <Icon
              color={cssVar.colorTextDescription}
              icon={PlusIcon}
              size={14}
              style={{ marginInlineStart: 'auto' }}
            />
          </Block>
        </TaskLabelSelector>
      </div>
    </>
  );
});

export default TaskProperties;
