import type { TaskPriority, TaskStatus, TaskWorkflowCategory } from '@orvilo/types';
import { formatAbsoluteDate } from '@orvilo/utils/time';
import { cn } from 'cn';
import { parseISO } from 'date-fns';
import { CalendarIcon, ClockIcon, PlusIcon, TagIcon, UserCheckIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { memo, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { WORKFLOW_CATEGORY_VISUALS } from '@/components/ExecutionStatus';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import LabelChips from '@/features/Labels/LabelChips';
import { taskDetailSelectors } from '@/store/task/selectors';

import AssigneeAvatar from '../features/AssigneeAvatar';
import AssigneeMemberSelector from '../features/AssigneeMemberSelector';
import AssigneeUserAvatar from '../features/AssigneeUserAvatar';
import IssueStatusPicker from '../features/IssueStatusPicker';
import { type PickerControl } from '../features/PickerTrigger';
import { ReviewerAgentSelector } from '../features/ReviewerAgentSelector';
import TaskLabelSelector from '../features/TaskLabelSelector';
import TaskPriorityTag from '../features/TaskPriorityTag';
import { openTaskScheduleDialog } from '../features/TaskScheduleDialog';
import TaskTriggerTag from '../features/TaskTriggerTag';
import { UnassignedAssigneeIcon } from '../features/UnassignedAssigneeIcon';
import { useTeamWorkflowStates } from '../features/useTeamWorkflowStates';
import { shouldShowMemberAssignee } from '../shared/memberAssigneeMode';
import { useAgentDisplayMeta } from '../shared/useAgentDisplayMeta';
import { useUserDisplayMeta } from '../shared/useUserDisplayMeta';
import { isDueDateOverdue } from './isDueDateOverdue';
import { RAIL_CONTROL_CLASS, RAIL_PLACEHOLDER_CLASS } from './railControl';
import { ISSUE_RELATION_KINDS } from './relationGroups';
import TaskDetailAssignee from './TaskDetailAssignee';
import { taskDetailLayoutStyles as styles } from './taskDetailLayoutStyles';
import { useTaskDetailSelector, useTaskDetailTaskId } from './TaskDetailScope';
import TaskExecutionSection from './TaskExecutionSection';
import TaskPrerequisites from './TaskPrerequisites';
import {
  addsWithoutRow,
  createPropertyRevealState,
  reconcilePropertyReveal,
  revealProperty,
  settleOpening,
} from './taskPropertyReveal';
import TaskScheduleConfig from './TaskScheduleConfig';
import { useIssueDetailCapabilities } from './useIssueDetailActions';

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
  const { readOnly } = useIssueDetailCapabilities();
  const taskId = useTaskDetailTaskId();
  // Optional fields the user asked to add while they are still unset. They
  // belong to one Issue: a peek pane keeps this instance mounted while the
  // taskId changes, so the state is reset during render (no effect, no frame
  // of the previous Issue's fields).
  const [revealState, setRevealState] = useState(() => createPropertyRevealState(taskId));
  const currentReveal = reconcilePropertyReveal(revealState, taskId);
  if (currentReveal !== revealState) setRevealState(currentReveal);
  const revealed = currentReveal.keys;
  // The property that was just added: its picker opens as its row mounts.
  const opening = currentReveal.opening;
  // Choosing an item from "+ Add property" hands focus to the picker it opens;
  // the menu must not pull it back to its own button.
  const addedFromMenu = useRef(false);
  useEffect(() => {
    // The added row has mounted with its picker open; open it only this once.
    if (opening) setRevealState(settleOpening);
  }, [opening]);

  const status = useTaskDetailSelector(taskDetailSelectors.taskStatus) as TaskStatus | undefined;
  const workflowCategory = useTaskDetailSelector(taskDetailSelectors.taskWorkflowCategory);
  const workflowStateId = useTaskDetailSelector(taskDetailSelectors.taskWorkflowStateId);
  const workflowStateRefId = useTaskDetailSelector(taskDetailSelectors.taskWorkflowStateRefId);
  const taskTeamId = useTaskDetailSelector(taskDetailSelectors.taskTeamId);
  const priority = useTaskDetailSelector(taskDetailSelectors.taskPriority);
  const dueDate = useTaskDetailSelector(taskDetailSelectors.taskDueDate);
  const labels = useTaskDetailSelector(taskDetailSelectors.taskLabels);
  const assigneeUserId = useTaskDetailSelector(taskDetailSelectors.taskAssigneeUserId);
  const reviewerAgentId = useTaskDetailSelector(taskDetailSelectors.taskReviewerAgentId);
  const createdByUserId = useTaskDetailSelector(taskDetailSelectors.taskCreatedByUserId);
  const visibility = useTaskDetailSelector(taskDetailSelectors.taskVisibility);
  const heartbeatInterval = useTaskDetailSelector(taskDetailSelectors.taskPeriodicInterval);
  const automationMode = useTaskDetailSelector(taskDetailSelectors.taskAutomationMode);
  const schedulePattern = useTaskDetailSelector(taskDetailSelectors.taskSchedulePattern);
  const scheduleTimezone = useTaskDetailSelector(taskDetailSelectors.taskScheduleTimezone);
  const memberMeta = useUserDisplayMeta(assigneeUserId);
  const reviewerMeta = useAgentDisplayMeta(reviewerAgentId);
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

  // Linear shows Status, Priority and Assignee by default; every other field
  // appears once it has a value, or after it is added from the menu.
  const optionalFields = {
    dueDate: !!dueDate || revealed.has('dueDate'),
    labels: labels.length > 0 || revealed.has('labels'),
    reviewer: workflowCategory === 'in_review' || !!reviewerAgentId || revealed.has('reviewer'),
    schedule: !!(schedulePattern || heartbeatInterval) || revealed.has('schedule'),
  };
  const addableFields = [
    { key: 'dueDate', label: t('taskDetail.dueDate'), shown: optionalFields.dueDate },
    { key: 'labels', label: t('taskDetail.labels.title'), shown: optionalFields.labels },
    { key: 'reviewer', label: t('taskDetail.reviewer'), shown: optionalFields.reviewer },
    { key: 'schedule', label: t('taskDetail.property.schedule'), shown: optionalFields.schedule },
    ...ISSUE_RELATION_KINDS.map((kind) => ({
      key: kind,
      label: t(`taskDetail.relations.${kind}` as never),
      shown: revealed.has(kind),
    })),
  ];
  // Adding a property goes straight to choosing its value. A due date is
  // chosen in a dialog, so no row appears until there is a date to show; the
  // others need their row as the picker's anchor, and it opens with the picker.
  const addProperty = (key: string) => {
    addedFromMenu.current = true;
    if (addsWithoutRow(key)) {
      openTaskScheduleDialog({ dueDate: dueDate ?? null, identifier: taskId });
      return;
    }
    setRevealState((prev) => revealProperty(reconcilePropertyReveal(prev, taskId), key));
  };

  const railControl: PickerControl = { className: RAIL_CONTROL_CLASS };
  const statusValue = (
    <Button
      className={cn(RAIL_CONTROL_CLASS, "[&_svg:not([class*='size-'])]:size-4")}
      data-task-workflow-state={workflowMark?.category}
      size="sm"
      variant="ghost"
    >
      <WorkflowIcon color={workflowMark.color} size={16} />
      <span className="truncate">
        {workflowStateName ?? t(`taskDetail.workflow.category.${workflowMark.category}` as never)}
      </span>
    </Button>
  );

  return (
    // Plane's property order for the fields we share: State, Assignee,
    // Priority, Due date, Labels. Reviewer and Schedule stay after those.
    // Each picker enforces its permission; the due-date button is disabled below. Keep
    // the values and relation links available to assistive technology.
    <div className={cn(styles.railSection, readOnly && 'opacity-60')}>
      <span className={styles.railSectionLabel}>{t('taskDetail.properties')}</span>
      <div className={styles.properties}>
        <PropertyRow label={t('taskDetail.property.state')}>
          <IssueStatusPicker
            nativeButton
            taskIdentifier={taskId}
            teamId={taskTeamId}
            workflowCategory={workflowCategory}
            workflowStateId={workflowStateId}
            workflowStateRefId={workflowStateRefId}
          >
            {statusValue}
          </IssueStatusPicker>
        </PropertyRow>

        <PropertyRow label={t('taskDetail.agent')}>
          <TaskDetailAssignee />
        </PropertyRow>

        {/* Execution sits under the agent it describes: state, reason and the
            one action that moves it on, in a single place. */}
        <TaskExecutionSection />

        {shouldShowMemberAssignee(activeWorkspaceId, assigneeUserId) && (
          <PropertyRow label={t('taskDetail.assignee')}>
            <AssigneeMemberSelector
              control={railControl}
              currentUserId={assigneeUserId}
              disabled={status === 'running'}
              taskCreatorId={createdByUserId}
              taskIdentifier={taskId}
              taskVisibility={visibility}
            >
              {assigneeUserId ? (
                <>
                  <AssigneeUserAvatar size={16} userId={assigneeUserId} />
                  <span className="truncate">{memberMeta?.title}</span>
                </>
              ) : (
                <>
                  <UnassignedAssigneeIcon kind="human" size={16} />
                  <span className={RAIL_PLACEHOLDER_CLASS}>
                    {t('taskDetail.property.addAssignee')}
                  </span>
                </>
              )}
            </AssigneeMemberSelector>
          </PropertyRow>
        )}

        <PropertyRow label={t('taskDetail.property.priority')}>
          <TaskPriorityTag nativeButton priority={priority} taskIdentifier={taskId}>
            <Button
              className={cn(RAIL_CONTROL_CLASS, "[&_svg:not([class*='size-'])]:size-4")}
              size="sm"
              variant="ghost"
            >
              <TaskPriorityTag
                disableDropdown
                priority={priority}
                size={16}
                taskIdentifier={taskId}
              />
              <span className={cn(priorityLevel === 0 && RAIL_PLACEHOLDER_CLASS)}>
                {t(`taskDetail.${priorityMeta.labelKey}` as never)}
              </span>
            </Button>
          </TaskPriorityTag>
        </PropertyRow>

        {optionalFields.dueDate && (
          <PropertyRow label={t('taskDetail.dueDate')}>
            {/* A real button: the due date opens its dialog from the keyboard
                as well as on click. */}
            <Button
              className={cn(styles.propertyButton, 'min-w-0 justify-start font-normal')}
              disabled={readOnly}
              size="sm"
              variant="ghost"
              onClick={() =>
                openTaskScheduleDialog({ dueDate: dueDate ?? null, identifier: taskId })
              }
            >
              {!dueDate && <CalendarIcon aria-hidden className={RAIL_PLACEHOLDER_CLASS} />}
              <span
                className={cn(
                  dueDateOverdue && styles.propertyDanger,
                  !dueDate && RAIL_PLACEHOLDER_CLASS,
                )}
              >
                {dueDate
                  ? formatAbsoluteDate(parseISO(dueDate))
                  : t('taskDetail.property.addDueDate')}
              </span>
            </Button>
          </PropertyRow>
        )}

        {optionalFields.labels && (
          <PropertyRow label={t('taskDetail.labels.title')}>
            <TaskLabelSelector
              assignedLabels={labels}
              control={railControl}
              defaultOpen={opening === 'labels'}
              disabled={status === 'running'}
              taskIdentifier={taskId}
            >
              {labels.length > 0 ? (
                <LabelChips labels={labels} max={3} />
              ) : (
                <>
                  <TagIcon aria-hidden className={RAIL_PLACEHOLDER_CLASS} size={16} />
                  <span className={RAIL_PLACEHOLDER_CLASS}>
                    {t('taskDetail.property.addLabels')}
                  </span>
                </>
              )}
            </TaskLabelSelector>
          </PropertyRow>
        )}

        {optionalFields.reviewer && (
          <PropertyRow label={t('taskDetail.reviewer')}>
            <ReviewerAgentSelector
              control={{ ...railControl, title: t('taskDetail.reviewer') }}
              currentAgentId={reviewerAgentId}
              defaultOpen={opening === 'reviewer'}
              taskIdentifier={taskId}
            >
              {reviewerAgentId ? (
                <>
                  <AssigneeAvatar agentId={reviewerAgentId} size={16} />
                  <span className="truncate">{reviewerMeta?.title}</span>
                </>
              ) : (
                <>
                  <UserCheckIcon aria-hidden className={RAIL_PLACEHOLDER_CLASS} size={16} />
                  <span className={RAIL_PLACEHOLDER_CLASS}>
                    {t('taskDetail.property.addReviewer')}
                  </span>
                </>
              )}
            </ReviewerAgentSelector>
          </PropertyRow>
        )}

        {optionalFields.schedule && (
          <PropertyRow label={t('taskDetail.property.schedule')}>
            <TaskScheduleConfig defaultOpen={opening === 'schedule'}>
              <div className="flex min-w-0 cursor-pointer items-center gap-1.5">
                {!(schedulePattern || heartbeatInterval) && (
                  <ClockIcon aria-hidden className={RAIL_PLACEHOLDER_CLASS} size={16} />
                )}
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
        )}

        {/* Linear parks relations in the properties sidebar: Blocked by, Blocks,
            Related — one flag-marked field per kind. */}
        <TaskPrerequisites openKind={opening} revealedKinds={revealed} />

        {!readOnly && addableFields.some((field) => !field.shown) && (
          <DropdownMenu
            onOpenChange={(open) => {
              if (open) addedFromMenu.current = false;
            }}
          >
            <DropdownMenuTrigger
              render={
                <Button className={styles.addProperty} size="sm" variant="ghost">
                  <PlusIcon data-icon="inline-start" />
                  {t('taskDetail.property.add')}
                </Button>
              }
            />
            <DropdownMenuContent align="start" finalFocus={() => !addedFromMenu.current}>
              <DropdownMenuGroup>
                {addableFields
                  .filter((field) => !field.shown)
                  .map((field) => (
                    <DropdownMenuItem key={field.key} onClick={() => addProperty(field.key)}>
                      {field.label}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
});

export default TaskProperties;
