import { TRPCError } from '@trpc/server';
import debug from 'debug';

import { TaskModel } from '@/database/models/task';
import { type TaskBacklogIntakeCandidate, TaskDispatchModel } from '@/database/models/taskDispatch';
import type { OrviloDatabase } from '@/database/type';
import { TaskDispatchWaitingError } from '@/server/services/taskDispatch';
import { TaskRunnerService } from '@/server/services/taskRunner';
import { taskRunIdempotencyKey } from '@/server/services/taskRunner/idempotency';

import { resolveBacklogIntakeAssignment } from './tieredAssignment';

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

  // Tiered routing: bind the cheapest enabled roster agent whose band meets
  // the task's required tier (priority baseline, escalated one step after a
  // terminally failed orchestrated attempt). The assignee write IS the
  // dispatch binding — `runTask` snapshots `task.assigneeAgentId` into the
  // dispatch row — so reassigning here is how an escalation actually moves
  // the work to a stronger agent. `executionTransfer` marks it as an
  // ownership move rather than a user edit. When nothing satisfies the
  // requirement (untiered roster, policy gates) the pick is null and the
  // task keeps its assignee — the pre-tiering failure path, unchanged.
  const assignment = await resolveBacklogIntakeAssignment({ candidate, db });
  if (assignment.agentId && assignment.agentId !== candidate.assigneeAgentId) {
    log(
      'intake %s routed to %s (required=%s, escalatedFrom=%s)',
      candidate.taskId,
      assignment.agentId,
      assignment.required,
      assignment.escalatedFrom ?? 'none',
    );
    await taskModel.updateWithLog(
      candidate.taskId,
      { assigneeAgentId: assignment.agentId },
      {},
      { executionTransfer: true },
    );
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
    // `runTask` surfaces a held dispatch as PRECONDITION_FAILED with the
    // typed cause preserved, and a lost reservation as CONFLICT.
    if (error instanceof TRPCError && error.cause instanceof TaskDispatchWaitingError) {
      return {
        outcome: 'waiting',
        reason: error.cause.message.slice(0, 200),
        taskId: candidate.taskId,
      };
    }
    if (error instanceof TRPCError && error.code === 'CONFLICT') {
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
