import type { TaskDetailData, TaskLabelSummary, TaskVerifyConfig } from '@orvilo/types';

import type { SaveStatus } from '@/types/saveState';

import type { TaskStoreState } from '../initialState';

/**
 * Detail selectors come in pairs: `taskX(state, taskId)` is entity-scoped —
 * the taskId is supplied by the caller — while `activeTaskX(state)` reads
 * whichever task the global `activeTaskId` slot points at. Detail subtrees
 * (page, Portal, automation host) bind through `useTaskDetailSelector` with
 * their own mounted taskId so a second host can never redirect their reads;
 * `activeTaskX` remains for genuinely global consumers (kanban highlight,
 * control bar, overlays).
 */

const taskDetail = (s: TaskStoreState, taskId?: string): TaskDetailData | undefined =>
  taskId ? s.taskDetailMap[taskId] : undefined;

const activeTaskId = (s: TaskStoreState) => s.activeTaskId;

const activeTaskDetail = (s: TaskStoreState): TaskDetailData | undefined =>
  taskDetail(s, s.activeTaskId);

const taskDatabaseId = (s: TaskStoreState, taskId?: string) => taskDetail(s, taskId)?.id;

const taskDetailById = (id: string) => (s: TaskStoreState) => s.taskDetailMap[id];

const isTaskDetailLoadingFor = (s: TaskStoreState, taskId?: string): boolean =>
  !taskId || !s.taskDetailMap[taskId];

const isTaskDetailLoading = (s: TaskStoreState): boolean =>
  isTaskDetailLoadingFor(s, s.activeTaskId);

const taskName = (s: TaskStoreState, taskId?: string) => taskDetail(s, taskId)?.name;

const taskStatus = (s: TaskStoreState, taskId?: string) => taskDetail(s, taskId)?.status;
const taskDispatchPhase = (s: TaskStoreState, taskId?: string) =>
  taskDetail(s, taskId)?.dispatchPhase;

const taskWorkflowCategory = (s: TaskStoreState, taskId?: string) =>
  taskDetail(s, taskId)?.workflowCategory;

const taskWorkflowStateId = (s: TaskStoreState, taskId?: string) =>
  taskDetail(s, taskId)?.workflowStateId;

const taskWorkflowStateRefId = (s: TaskStoreState, taskId?: string) =>
  taskDetail(s, taskId)?.workflowStateRefId;

const taskTeamId = (s: TaskStoreState, taskId?: string) => taskDetail(s, taskId)?.teamId;

const taskDueDate = (s: TaskStoreState, taskId?: string) => taskDetail(s, taskId)?.dueDate;

const taskPriority = (s: TaskStoreState, taskId?: string) => taskDetail(s, taskId)?.priority ?? 0;

const taskVisibility = (s: TaskStoreState, taskId?: string): 'private' | 'public' =>
  taskDetail(s, taskId)?.visibility ?? 'public';

const taskCreatedByUserId = (s: TaskStoreState, taskId?: string) =>
  taskDetail(s, taskId)?.createdByUserId;

const taskInstruction = (s: TaskStoreState, taskId?: string) => taskDetail(s, taskId)?.instruction;

// Labels assigned to the task (Linear-style issue labels) — chips on the
// properties rail. A shared empty constant keeps the selector referentially
// stable for tasks with no labels.
const EMPTY_LABELS: TaskLabelSummary[] = [];
const taskLabels = (s: TaskStoreState, taskId?: string) =>
  taskDetail(s, taskId)?.labels ?? EMPTY_LABELS;

const taskInstructionRevision = (s: TaskStoreState, taskId?: string) =>
  (taskId ? s.taskInstructionRevisionMap[taskId] : undefined) ?? 0;

const taskEditorData = (s: TaskStoreState, taskId?: string) => taskDetail(s, taskId)?.editorData;

const taskFiles = (s: TaskStoreState, taskId?: string) => taskDetail(s, taskId)?.files;

const taskDescription = (s: TaskStoreState, taskId?: string) => taskDetail(s, taskId)?.description;

const taskAgentId = (s: TaskStoreState, taskId?: string) => taskDetail(s, taskId)?.agentId;

// Human assignee (workspace member). `detail.userId` is populated from the
// server-side `tasks.assignee_user_id` column.
const taskAssigneeUserId = (s: TaskStoreState, taskId?: string) => taskDetail(s, taskId)?.userId;

// Review-phase owner: the member accountable while the task sits paused for
// review. Falls back to assignee→creator server-side on the paused transition.
const taskReviewerUserId = (s: TaskStoreState, taskId?: string) =>
  taskDetail(s, taskId)?.reviewerUserId;

// TODO: Once the frontend store switches to reading from detail.model / detail.provider returned by the backend getTaskDetail procedure
const taskModel = (s: TaskStoreState, taskId?: string) =>
  taskDetail(s, taskId)?.config?.model as string | undefined;

const taskProvider = (s: TaskStoreState, taskId?: string) =>
  taskDetail(s, taskId)?.config?.provider as string | undefined;

const taskSubtasks = (s: TaskStoreState, taskId?: string) => taskDetail(s, taskId)?.subtasks ?? [];

const taskDependencies = (s: TaskStoreState, taskId?: string) =>
  taskDetail(s, taskId)?.dependencies ?? [];

const taskParent = (s: TaskStoreState, taskId?: string) => taskDetail(s, taskId)?.parent;

// Periodic execution interval (seconds); 0 or undefined means not configured
const taskPeriodicInterval = (s: TaskStoreState, taskId?: string) =>
  taskDetail(s, taskId)?.heartbeat?.interval ?? 0;

// Automation mode: 'heartbeat' | 'schedule' | null (null = no automation)
const taskAutomationMode = (s: TaskStoreState, taskId?: string) =>
  taskDetail(s, taskId)?.automationMode ?? null;

// Schedule (cron) mode fields. pattern/timezone are columns; maxExecutions lives in config.schedule.
const taskSchedulePattern = (s: TaskStoreState, taskId?: string) =>
  taskDetail(s, taskId)?.schedule?.pattern ?? null;

const taskScheduleTimezone = (s: TaskStoreState, taskId?: string) =>
  taskDetail(s, taskId)?.schedule?.timezone ?? null;

const taskScheduleMaxExecutions = (s: TaskStoreState, taskId?: string) =>
  taskDetail(s, taskId)?.schedule?.maxExecutions ?? null;

const taskCheckpoint = (s: TaskStoreState, taskId?: string) => taskDetail(s, taskId)?.checkpoint;

// Read the RESOLVED verify config that getTaskDetail populates via
// TaskModel.getVerifyConfig (which includes the legacy `config.review` fallback
// during migration) — not the raw `config.verify`. Reading raw config.verify
// would return undefined for a legacy review-only task, so the panel would open
// as unconfigured and the first autosave could clobber the old settings.
const taskVerifyConfig = (s: TaskStoreState, taskId?: string): TaskVerifyConfig | undefined =>
  taskDetail(s, taskId)?.verify ?? undefined;

const taskWorkspace = (s: TaskStoreState, taskId?: string) =>
  taskDetail(s, taskId)?.workspace ?? [];

const taskWorkspaceId = (s: TaskStoreState, taskId?: string) => taskDetail(s, taskId)?.workspaceId;

const taskError = (s: TaskStoreState, taskId?: string) => taskDetail(s, taskId)?.error;

const taskTopicCount = (s: TaskStoreState, taskId?: string) =>
  taskDetail(s, taskId)?.topicCount ?? 0;

const isTaskBlocked = (s: TaskStoreState, taskId?: string): boolean =>
  taskDetail(s, taskId)?.dependencies?.some(
    (dep) => dep.type === 'blocks' && dep.direction !== 'blocking' && dep.status !== 'completed',
  ) ?? false;

const canRunTask = (s: TaskStoreState, taskId?: string): boolean => {
  const detail = taskDetail(s, taskId);
  if (!detail) return false;
  // 'scheduled' is intentionally excluded — automation owns the next run; the
  // user can only cancel, not force an immediate run.
  return (
    !isTaskBlocked(s, taskId) &&
    ['backlog', 'failed', 'paused', 'completed'].includes(detail.status)
  );
};

const canPauseTask = (s: TaskStoreState, taskId?: string): boolean =>
  taskDetail(s, taskId)?.status === 'running';

const canCancelTask = (s: TaskStoreState, taskId?: string): boolean => {
  const detail = taskDetail(s, taskId);
  if (!detail) return false;
  return ['backlog', 'paused', 'running', 'scheduled'].includes(detail.status);
};

// Save status is keyed per task, so switching tasks reads the target task's own
// status (defaulting to 'idle') instead of a stale 'failed' from a prior task.
const taskSaveStatusFor = (s: TaskStoreState, taskId?: string): SaveStatus =>
  (taskId ? s.taskSaveStatusMap[taskId] : undefined) ?? 'idle';

const activeTopicDrawerTopicId = (s: TaskStoreState) => s.activeTopicDrawerTopicId;

/**
 * Which agent the open run drawer talks to. A run opened from a task detail
 * inherits the task's agent; one opened from the home inbox carries its own,
 * since the topic may have no parent task.
 */
const topicDrawerAgentId = (s: TaskStoreState, taskId?: string) =>
  s.activeTopicDrawerAgentId ?? taskAgentId(s, taskId ?? s.activeTaskId);

const topicDrawerTitle = (s: TaskStoreState) => s.activeTopicDrawerTitle;

export const taskDetailSelectors = {
  activeTaskAgentId: (s: TaskStoreState) => taskAgentId(s, s.activeTaskId),
  activeTaskAssigneeUserId: (s: TaskStoreState) => taskAssigneeUserId(s, s.activeTaskId),
  activeTaskAutomationMode: (s: TaskStoreState) => taskAutomationMode(s, s.activeTaskId),
  activeTaskCheckpoint: (s: TaskStoreState) => taskCheckpoint(s, s.activeTaskId),
  activeTaskCreatedByUserId: (s: TaskStoreState) => taskCreatedByUserId(s, s.activeTaskId),
  activeTaskDatabaseId: (s: TaskStoreState) => taskDatabaseId(s, s.activeTaskId),
  activeTaskDependencies: (s: TaskStoreState) => taskDependencies(s, s.activeTaskId),
  activeTaskDescription: (s: TaskStoreState) => taskDescription(s, s.activeTaskId),
  activeTaskDetail,
  activeTaskDueDate: (s: TaskStoreState) => taskDueDate(s, s.activeTaskId),
  activeTaskEditorData: (s: TaskStoreState) => taskEditorData(s, s.activeTaskId),
  activeTaskError: (s: TaskStoreState) => taskError(s, s.activeTaskId),
  activeTaskFiles: (s: TaskStoreState) => taskFiles(s, s.activeTaskId),
  activeTaskId,
  activeTaskInstruction: (s: TaskStoreState) => taskInstruction(s, s.activeTaskId),
  activeTaskInstructionRevision: (s: TaskStoreState) => taskInstructionRevision(s, s.activeTaskId),
  activeTaskLabels: (s: TaskStoreState) => taskLabels(s, s.activeTaskId),
  activeTaskName: (s: TaskStoreState) => taskName(s, s.activeTaskId),
  activeTaskParent: (s: TaskStoreState) => taskParent(s, s.activeTaskId),
  activeTaskModel: (s: TaskStoreState) => taskModel(s, s.activeTaskId),
  activeTaskPeriodicInterval: (s: TaskStoreState) => taskPeriodicInterval(s, s.activeTaskId),
  activeTaskPriority: (s: TaskStoreState) => taskPriority(s, s.activeTaskId),
  activeTaskProvider: (s: TaskStoreState) => taskProvider(s, s.activeTaskId),
  activeTaskReviewerUserId: (s: TaskStoreState) => taskReviewerUserId(s, s.activeTaskId),
  activeTaskScheduleMaxExecutions: (s: TaskStoreState) =>
    taskScheduleMaxExecutions(s, s.activeTaskId),
  activeTaskSchedulePattern: (s: TaskStoreState) => taskSchedulePattern(s, s.activeTaskId),
  activeTaskScheduleTimezone: (s: TaskStoreState) => taskScheduleTimezone(s, s.activeTaskId),
  activeTaskStatus: (s: TaskStoreState) => taskStatus(s, s.activeTaskId),
  activeTaskSubtasks: (s: TaskStoreState) => taskSubtasks(s, s.activeTaskId),
  activeTaskTopicCount: (s: TaskStoreState) => taskTopicCount(s, s.activeTaskId),
  activeTaskVerifyConfig: (s: TaskStoreState) => taskVerifyConfig(s, s.activeTaskId),
  activeTaskVisibility: (s: TaskStoreState) => taskVisibility(s, s.activeTaskId),
  activeTaskWorkspace: (s: TaskStoreState) => taskWorkspace(s, s.activeTaskId),
  activeTaskWorkspaceId: (s: TaskStoreState) => taskWorkspaceId(s, s.activeTaskId),
  activeTaskWorkflowCategory: (s: TaskStoreState) => taskWorkflowCategory(s, s.activeTaskId),
  activeTaskWorkflowStateId: (s: TaskStoreState) => taskWorkflowStateId(s, s.activeTaskId),
  activeTaskWorkflowStateRefId: (s: TaskStoreState) => taskWorkflowStateRefId(s, s.activeTaskId),
  activeTaskTeamId: (s: TaskStoreState) => taskTeamId(s, s.activeTaskId),
  activeTopicDrawerTopicId,
  canCancelActiveTask: (s: TaskStoreState) => canCancelTask(s, s.activeTaskId),
  canCancelTask,
  canPauseActiveTask: (s: TaskStoreState) => canPauseTask(s, s.activeTaskId),
  canPauseTask,
  canRunActiveTask: (s: TaskStoreState) => canRunTask(s, s.activeTaskId),
  canRunTask,
  isActiveTaskBlocked: (s: TaskStoreState) => isTaskBlocked(s, s.activeTaskId),
  isTaskBlocked,
  isTaskDetailLoading,
  isTaskDetailLoadingFor,
  taskAgentId,
  taskAssigneeUserId,
  taskAutomationMode,
  taskCheckpoint,
  taskCreatedByUserId,
  taskDatabaseId,
  taskDependencies,
  taskDescription,
  taskDetail,
  taskDetailById,
  taskDueDate,
  taskEditorData,
  taskError,
  taskFiles,
  taskInstruction,
  taskInstructionRevision,
  taskLabels,
  taskModel,
  taskName,
  taskParent,
  taskPeriodicInterval,
  taskPriority,
  taskProvider,
  taskReviewerUserId,
  taskSaveStatus: (s: TaskStoreState) => taskSaveStatusFor(s, s.activeTaskId),
  taskSaveStatusFor,
  taskScheduleMaxExecutions,
  taskSchedulePattern,
  taskScheduleTimezone,
  taskStatus,
  taskDispatchPhase,
  taskSubtasks,
  taskTeamId,
  taskTopicCount,
  taskVerifyConfig,
  taskVisibility,
  taskWorkflowCategory,
  taskWorkflowStateId,
  taskWorkflowStateRefId,
  taskWorkspace,
  taskWorkspaceId,
  topicDrawerAgentId,
  topicDrawerTitle,
};
