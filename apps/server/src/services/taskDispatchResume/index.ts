import type { TaskRunTrigger } from '@orvilo/types';
import debug from 'debug';

import {
  TaskDispatchModel,
  type TaskDispatchResumeCandidate,
} from '@/database/models/taskDispatch';
import type { OrviloDatabase } from '@/database/type';
import {
  TaskDispatchConflictError,
  TaskDispatchWaitingError,
} from '@/server/services/taskDispatch';
import { TaskRunnerService } from '@/server/services/taskRunner';

const log = debug('task-dispatch-resume');

const STALE_START_GRACE_MS = 5 * 60 * 1000;
const WAITING_RESUME_GRACE_MS = 5 * 60 * 1000;
/**
 * Bound on sweep-driven resume attempts per dispatch. Each claimed re-drive
 * bumps `recovery_attempts`; a row that resumes clears it. An intent that
 * reaches the bound without ever starting is stopped — the task's single
 * execution slot frees so a fresh trigger (or backlog intake) may retry.
 */
const MAX_RESUME_ATTEMPTS = 20;

export type TaskDispatchResumeOutcome =
  | { dispatchId: string; outcome: 'resumed' }
  | { dispatchId: string; outcome: 'retry'; reason: string }
  | { dispatchId: string; outcome: 'skipped'; reason: string }
  | { dispatchId: string; outcome: 'stopped'; reason: string }
  | { dispatchId: string; outcome: 'waiting'; reason: string };

const RESUMABLE_TRIGGERS = ['goal', 'heartbeat', 'manual', 'orchestrator', 'schedule'] as const;

/**
 * The trigger prefix persisted in `requestedBy` (`${trigger}:${actor}`). A
 * stale row is re-driven under its original trigger so policy and goal gates
 * see the same requester class the intent was minted with. `event` rows are
 * never re-driven: their admission evidence belongs to the event delivery
 * that minted them and a sweep cannot mint a replacement.
 */
const resumeTrigger = (requestedBy: string): TaskRunTrigger | null => {
  const prefix = requestedBy.split(':', 1)[0];
  return (RESUMABLE_TRIGGERS as readonly string[]).includes(prefix)
    ? (prefix as TaskRunTrigger)
    : null;
};

/**
 * Re-drive one resumable dispatch under its stored idempotency key. The
 * shared `request()` path re-evaluates project policy, goal gates and
 * assignee presence under the task lock, so a row that still cannot start
 * re-parks (or stays parked) with the current reason.
 */
export const processTaskDispatchResume = async (input: {
  candidate: TaskDispatchResumeCandidate;
  db: OrviloDatabase;
}): Promise<TaskDispatchResumeOutcome> => {
  const { candidate, db } = input;
  const model = new TaskDispatchModel(db, candidate.workspaceId ?? undefined);

  const trigger = resumeTrigger(candidate.requestedBy);
  const stopReason =
    candidate.recoveryAttempts >= MAX_RESUME_ATTEMPTS
      ? 'resume_attempts_exhausted'
      : !trigger
        ? 'resume_unsupported_trigger'
        : null;
  if (stopReason || !trigger) {
    // Bound the sweep's own re-drives and retire unresumable intents: both
    // converge on `requestStop`, after which the bounded cancellation sweep
    // settles the row and frees the task's execution slot.
    const reason = stopReason ?? 'resume_unsupported_trigger';
    const stopped = await model.requestStop({
      dispatchId: candidate.dispatchId,
      fence: candidate.fence,
      generation: candidate.generation,
      reason,
    });
    return {
      dispatchId: candidate.dispatchId,
      outcome: stopped ? 'stopped' : 'skipped',
      reason,
    };
  }

  const claim = await model.claimForResume(candidate.dispatchId);
  if (!claim) return { dispatchId: candidate.dispatchId, outcome: 'skipped', reason: 'claim_lost' };

  try {
    await new TaskRunnerService(db, candidate.userId, candidate.workspaceId ?? undefined).runTask({
      idempotencyKey: candidate.idempotencyKey,
      planRevision: candidate.planRevision ?? undefined,
      requestedBy: candidate.requestedBy,
      taskId: candidate.taskId,
      trigger,
    });
    return { dispatchId: candidate.dispatchId, outcome: 'resumed' };
  } catch (error) {
    if (error instanceof TaskDispatchWaitingError) {
      return {
        dispatchId: candidate.dispatchId,
        outcome: 'waiting',
        reason: error.message.slice(0, 200),
      };
    }
    if (error instanceof TaskDispatchConflictError) {
      return { dispatchId: candidate.dispatchId, outcome: 'skipped', reason: 'busy' };
    }
    log('resume %s failed: %O', candidate.dispatchId, error);
    return {
      dispatchId: candidate.dispatchId,
      outcome: 'retry',
      reason: (error instanceof Error ? error.message : String(error)).slice(0, 500),
    };
  }
};

/**
 * Resume stranded start intents and parked waiting dispatches. A run can be
 * orphaned at `requested`/`claimed` when the process dies between the minted
 * request and provisioning, or left parked at `waiting` when no trigger ever
 * re-evaluates it; both are converged here so no dispatch goes unowned.
 */
export const sweepTaskDispatchResume = async (input: {
  db: OrviloDatabase;
  limit?: number;
}): Promise<TaskDispatchResumeOutcome[]> => {
  const [stale, waiting] = await Promise.all([
    TaskDispatchModel.findStaleStartCandidates(input.db, {
      graceMs: STALE_START_GRACE_MS,
      limit: input.limit,
    }),
    TaskDispatchModel.findWaitingResumeCandidates(input.db, {
      graceMs: WAITING_RESUME_GRACE_MS,
      limit: input.limit,
    }),
  ]);
  const outcomes: TaskDispatchResumeOutcome[] = [];
  for (const candidate of [...stale, ...waiting]) {
    outcomes.push(await processTaskDispatchResume({ candidate, db: input.db }));
  }
  return outcomes;
};
