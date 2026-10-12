import type {
  TaskDetailActivity,
  TaskDispatchPhase,
  TaskExecutionState,
  TaskWorkflowCategory,
} from '@orvilo/types';
import { deriveTaskExecutionState } from '@orvilo/types';

import { type DispatchNoticeCopy, resolveIssueDispatchNotices } from '../shared/dispatchNotice';

/**
 * What the Issue page says about agent execution, and the one thing the reader
 * can do about it.
 *
 * An Issue starts when it is assigned to an agent and moved to In Progress, so
 * there is no standing "Run" button. An action appears only where nothing else
 * would start or resume the work: the server parks a stopped or failed Issue
 * (automatic intake skips parked Issues), and an Issue that reached In Progress
 * without the status move that starts it has no run at all.
 *
 * Driven by the execution projection (`deriveTaskExecutionState`). The legacy
 * status is read for two things it alone still carries: `scheduled`, and
 * whether the server accepts a run right now.
 */

export type IssueExecutionKind =
  | 'awaitingAcceptance'
  | 'failed'
  | 'needsAgent'
  | 'notStarted'
  | 'outcomeUnknown'
  | 'provisioning'
  | 'queued'
  | 'running'
  | 'scheduled'
  | 'stopped'
  | 'stopping'
  | 'succeeded'
  | 'timedOut'
  | 'waiting';

export type IssueExecutionAction = 'resume' | 'retry' | 'start';

export interface IssueExecutionView {
  /** The single run action that makes sense in this state, if any. */
  action?: IssueExecutionAction;
  /** The action exists but unfinished prerequisites hold it. */
  actionBlocked: boolean;
  /** Glyph of the projected execution state; absent before any run. */
  badge?: TaskExecutionState;
  /** Sentences explaining the state or the next step, most relevant first. */
  hints: DispatchNoticeCopy[];
  kind: IssueExecutionKind;
  /** The latest run ended badly, so its recorded reason belongs here. */
  showFailureReason: boolean;
}

export interface IssueExecutionInput {
  agentId?: string | null;
  assigneeUserId?: string | null;
  automationMode?: string | null;
  blocked?: boolean;
  dispatchPhase?: TaskDispatchPhase | null;
  dispatchWaitingReason?: string | null;
  /** `status` of the Issue's own latest run row, if it has one. */
  latestRunStatus?: string | null;
  orchestrationAdmission?: 'disabled' | 'enabled' | null;
  /** Legacy status projection. */
  status?: string | null;
  workflowCategory?: TaskWorkflowCategory | null;
}

const HINT = (name: string): DispatchNoticeCopy => ({ key: `taskDetail.execution.hint.${name}` });

const STOPPED_HINT = HINT('stopped');

/** Legacy statuses from which the server accepts a new run (`canRunTask`). */
const RUNNABLE_STATUSES = new Set(['backlog', 'completed', 'failed', 'paused']);

/** Categories from which moving to In Progress starts the agent. */
const STARTS_ON_MOVE = new Set<TaskWorkflowCategory>(['backlog', 'in_review', 'todo', 'triage']);

const isRunnable = (input: IssueExecutionInput): boolean =>
  !!input.agentId &&
  RUNNABLE_STATUSES.has(input.status ?? '') &&
  input.workflowCategory !== 'canceled';

const projectExecution = (input: IssueExecutionInput) =>
  deriveTaskExecutionState({ dispatchPhase: input.dispatchPhase, legacyStatus: input.status });

/**
 * Re-running an Issue whose run already succeeded is a deliberate second pass,
 * not the next step, so it lives in the overflow menu.
 */
export const canRerunIssue = (input: IssueExecutionInput): boolean =>
  projectExecution(input) === 'succeeded' && isRunnable(input);

export const resolveIssueExecution = (input: IssueExecutionInput): IssueExecutionView | null => {
  const { agentId, blocked, dispatchPhase, status, workflowCategory } = input;
  const execution = projectExecution(input);
  const runnable = isRunnable(input);
  const actionBlocked = !!blocked;

  const withAction = (
    view: Omit<IssueExecutionView, 'action' | 'actionBlocked'>,
    action: IssueExecutionAction,
  ): IssueExecutionView => {
    // A finished or canceled Issue is not waiting on a retry; reopening it is
    // the way back, and the page says so instead of naming a missing button.
    if (workflowCategory === 'done' || workflowCategory === 'canceled')
      return {
        ...view,
        actionBlocked: false,
        hints: [...view.hints.filter((hint) => hint.key !== STOPPED_HINT.key), HINT('reopenToRun')],
      };
    if (!runnable) {
      return {
        ...view,
        actionBlocked: false,
        hints: agentId ? view.hints : [...view.hints, HINT('assignAgentToRun')],
      };
    }
    return {
      ...view,
      action,
      actionBlocked,
      hints: actionBlocked
        ? [...view.hints, { key: 'taskDetail.prerequisites.blocked' }]
        : view.hints,
    };
  };

  // Automation owns the next run, so there is no retry here. A failed last
  // occurrence still reads as failed — a failed glyph captioned "Scheduled"
  // would say two things at once.
  if (status === 'scheduled') {
    const lastFailed = execution === 'failed';
    return {
      actionBlocked: false,
      badge: lastFailed ? execution : undefined,
      hints: [HINT('scheduled')],
      kind: lastFailed ? 'failed' : 'scheduled',
      showFailureReason: lastFailed,
    };
  }

  if (!execution) {
    if (!agentId) {
      // A person owns it, or it is not being worked on yet: nothing to explain.
      if (workflowCategory !== 'in_progress' || input.assigneeUserId) return null;
      return {
        actionBlocked: false,
        hints: [HINT('needsAgent')],
        kind: 'needsAgent',
        showFailureReason: false,
      };
    }

    const base = { hints: [] as DispatchNoticeCopy[], kind: 'notStarted' as const };
    // In Progress with an agent and no run: it got here without the status
    // move that starts it (an import, an integration, an API write).
    if (workflowCategory === 'in_progress')
      return withAction(
        { ...base, hints: [HINT('inProgressNoRun')], showFailureReason: false },
        'start',
      );

    const startsOnMove =
      !!workflowCategory && STARTS_ON_MOVE.has(workflowCategory) && !input.automationMode;
    return {
      ...base,
      actionBlocked: false,
      hints: startsOnMove ? [HINT('moveToStart')] : [],
      showFailureReason: false,
    };
  }

  // A canceled Issue projects as canceled execution whether or not anything
  // ever ran. With no dispatch there is no execution to explain.
  if (workflowCategory === 'canceled' && !dispatchPhase) return null;

  switch (execution) {
    case 'queued':
    case 'provisioning':
    case 'waiting':
    case 'running': {
      // Already dispatched: the one state with nothing for the reader to start.
      return {
        actionBlocked: false,
        badge: execution,
        hints: resolveIssueDispatchNotices(input),
        kind: dispatchPhase === 'cancel_requested' ? 'stopping' : execution,
        showFailureReason: false,
      };
    }

    case 'failed': {
      const timedOut = input.latestRunStatus === 'timeout';
      return withAction(
        {
          badge: execution,
          hints: timedOut ? [HINT('timedOut')] : [],
          kind: timedOut ? 'timedOut' : 'failed',
          showFailureReason: true,
        },
        'retry',
      );
    }

    case 'canceled': {
      return withAction(
        { badge: execution, hints: [STOPPED_HINT], kind: 'stopped', showFailureReason: false },
        'resume',
      );
    }

    case 'outcome_unknown': {
      // With no dispatch row the projection only has the legacy `paused` to go
      // on, which is what pressing Stop leaves behind — not a lost outcome.
      if (!dispatchPhase && status === 'paused')
        return withAction(
          {
            badge: 'canceled',
            hints: [STOPPED_HINT],
            kind: 'stopped',
            showFailureReason: false,
          },
          'resume',
        );
      return withAction(
        {
          badge: execution,
          hints: [HINT('outcomeUnknown')],
          kind: 'outcomeUnknown',
          showFailureReason: true,
        },
        'retry',
      );
    }

    case 'succeeded': {
      const settled = workflowCategory === 'done' || workflowCategory === 'canceled';
      return {
        actionBlocked: false,
        badge: execution,
        hints: settled ? [] : [HINT('awaitingAcceptance')],
        kind: settled ? 'succeeded' : 'awaitingAcceptance',
        showFailureReason: false,
      };
    }
  }
};

/**
 * The Issue's own most recent run. A parent detail also lists its sub-issues'
 * runs; those say nothing about whether this Issue's execution failed.
 */
export const findLatestOwnRun = (
  activities: TaskDetailActivity[] | undefined,
  taskDatabaseId?: string | null,
): TaskDetailActivity | undefined => {
  let latest: TaskDetailActivity | undefined;
  for (const activity of activities ?? []) {
    if (activity.type !== 'topic') continue;
    if (activity.sourceTaskId && activity.sourceTaskId !== taskDatabaseId) continue;
    if (!latest || (activity.seq ?? 0) > (latest.seq ?? 0)) latest = activity;
  }
  return latest;
};

/**
 * The Issue header keeps a run control only where it stops something or
 * manages a schedule — never to start a run: Stop while a run is in progress,
 * and the cancel-schedule / run-now pair while the schedule owns the Issue.
 */
export const showsHeaderRunControl = (input: {
  canPause: boolean;
  status?: string | null;
}): boolean => input.canPause || input.status === 'scheduled';

/** Kinds whose wording says more than the projected state's default name. */
export const EXECUTION_KIND_LABEL_KEYS: Partial<Record<IssueExecutionKind, string>> = {
  awaitingAcceptance: 'taskDetail.execution.view.awaitingAcceptance',
  needsAgent: 'taskDetail.execution.view.needsAgent',
  notStarted: 'taskDetail.execution.view.notStarted',
  scheduled: 'taskDetail.execution.view.scheduled',
  stopped: 'taskDetail.execution.view.stopped',
  stopping: 'taskDetail.execution.view.stopping',
  timedOut: 'taskDetail.execution.view.timedOut',
};
