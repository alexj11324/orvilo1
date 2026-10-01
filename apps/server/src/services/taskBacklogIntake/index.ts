import debug from 'debug';

import { TaskModel } from '@/database/models/task';
import { type TaskBacklogIntakeCandidate, TaskDispatchModel } from '@/database/models/taskDispatch';
import type { OrviloDatabase } from '@/database/type';
import {
  TaskDispatchConflictError,
  TaskDispatchWaitingError,
} from '@/server/services/taskDispatch';
import { TaskRunnerService } from '@/server/services/taskRunner';
import { taskRunIdempotencyKey } from '@/server/services/taskRunner/idempotency';

const log = debug('task-backlog-intake');

/**
 * How many backlog tasks one sweep pass may start. Intake is deliberately
 * small: every project opt-in (`orchestrationPolicy.autoDispatch`) is served
 * in created-at order, and a task that parks `waiting` keeps its durable
 * intent for the resume sweep to re-evaluate.
 */
const INTAKE_LIMIT = 10;

export type TaskBacklogIntakeOutcome =
  | { outcome: 'blocked'; reason: string; taskId: string }
  | { outcome: 'error'; reason: string; taskId: string }
  | { outcome: 'started'; taskId: string }
  | { outcome: 'waiting'; reason: string; taskId: string };

const processBacklogIntake = async (input: {
  candidate: TaskBacklogIntakeCandidate;
  db: OrviloDatabase;
}): Promise<TaskBacklogIntakeOutcome> => {
  const { candidate, db } = input;
  if (!candidate.userId) {
    return { outcome: 'blocked', reason: 'no_principal', taskId: candidate.taskId };
  }
  const taskModel = new TaskModel(db, candidate.userId, candidate.workspaceId);
  if (!(await taskModel.areAllDependenciesCompleted(candidate.taskId))) {
    return { outcome: 'blocked', reason: 'dependencies_incomplete', taskId: candidate.taskId };
  }

  try {
    await new TaskRunnerService(db, candidate.userId, candidate.workspaceId).runTask({
      idempotencyKey: taskRunIdempotencyKey.backlogIntake({
        executionGeneration: candidate.executionGeneration,
        taskId: candidate.taskId,
      }),
      requestedBy: 'backlog_intake',
      taskId: candidate.taskId,
      trigger: 'orchestrator',
    });
    return { outcome: 'started', taskId: candidate.taskId };
  } catch (error) {
    if (error instanceof TaskDispatchWaitingError) {
      return { outcome: 'waiting', reason: error.message.slice(0, 200), taskId: candidate.taskId };
    }
    if (error instanceof TaskDispatchConflictError) {
      return { outcome: 'blocked', reason: 'busy', taskId: candidate.taskId };
    }
    log('intake %s failed: %O', candidate.taskId, error);
    return {
      outcome: 'error',
      reason: (error instanceof Error ? error.message : String(error)).slice(0, 500),
      taskId: candidate.taskId,
    };
  }
};

/**
 * Pull ready work out of `backlog` for projects that opted into autonomous
 * dispatch (`orchestrationPolicy.autoDispatch`). Each start runs through the
 * durable dispatch arbiter with trigger `orchestrator`, so project policy
 * (allowed agents, concurrency, budgets), goal gates and the CAID admission
 * flag all apply — a gated task simply parks its durable intent at `waiting`
 * for the resume sweep instead of vanishing.
 */
export const sweepTaskBacklogIntake = async (input: {
  db: OrviloDatabase;
  limit?: number;
}): Promise<TaskBacklogIntakeOutcome[]> => {
  const candidates = await TaskDispatchModel.findBacklogIntakeCandidates(input.db, {
    limit: input.limit ?? INTAKE_LIMIT,
  });
  const outcomes: TaskBacklogIntakeOutcome[] = [];
  for (const candidate of candidates) {
    outcomes.push(await processBacklogIntake({ candidate, db: input.db }));
  }
  return outcomes;
};
