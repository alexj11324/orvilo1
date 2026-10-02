import type { TaskItem } from '@orvilo/types';
import { and, asc, lt } from 'drizzle-orm';

import { TaskModel, type TaskMutationContext } from '@/database/models/task';
import { matchesDispatchAssignee, TaskDispatchModel } from '@/database/models/taskDispatch';
import { hasActiveExecution } from '@/database/models/taskExecutionSql';
import { tasks } from '@/database/schemas/task';
import type { OrviloDatabase } from '@/database/type';

/**
 * Ownership-invariant reconciler (watchdog sweep).
 *
 * The task row, its single active dispatch and the remote writer must agree
 * on WHO executes the task. Two drift shapes are converged here rather than
 * just reported:
 *
 *   - `running` task with NO active dispatch: nothing can ever settle it —
 *     park at 'paused' so a human sees the task needs attention.
 *   - `running` task whose active dispatch's `agentId` no longer equals the
 *     stored assignee (a stale reassignment or failed transfer): fence the
 *     dispatch with requestStop — the cancellation sweep then interrupts the
 *     remote writer and parks the task, closing the split-brain.
 *
 * Only rows untouched for `MIN_TASK_AGE_MS` are scanned so a task mid-kickoff
 * (dispatch row racing its status transition) is never fenced by accident.
 */
const MIN_TASK_AGE_MS = 2 * 60 * 1000;
const ORPHAN_PARK_REASON = 'Execution owner missing; parked by the ownership reconciler.';

export type TaskOwnershipInvariantOutcome =
  | { outcome: 'drift_fenced'; taskId: string }
  | { outcome: 'orphan_parked'; taskId: string }
  | { outcome: 'skipped'; taskId: string };

export const sweepTaskOwnershipInvariants = async (input: {
  db: OrviloDatabase;
  limit?: number;
  minTaskAgeMs?: number;
}): Promise<TaskOwnershipInvariantOutcome[]> => {
  const cutoff = new Date(Date.now() - (input.minTaskAgeMs ?? MIN_TASK_AGE_MS));
  const limit = Math.max(1, Math.min(100, Math.trunc(input.limit ?? 50)));
  const candidates = await input.db
    .select({
      createdByUserId: tasks.createdByUserId,
      taskId: tasks.id,
      workspaceId: tasks.workspaceId,
    })
    .from(tasks)
    .where(and(hasActiveExecution, lt(tasks.updatedAt, cutoff)))
    .orderBy(asc(tasks.updatedAt), asc(tasks.id))
    .limit(limit);

  const outcomes: TaskOwnershipInvariantOutcome[] = [];
  for (const candidate of candidates) {
    const workspaceId = candidate.workspaceId ?? undefined;
    const taskModel = new TaskModel(input.db, candidate.createdByUserId ?? '', workspaceId);
    const dispatchModel = new TaskDispatchModel(input.db, workspaceId);

    const task = await taskModel.findById(candidate.taskId);
    if (
      !task ||
      (await taskModel.derivedStatusByIds([candidate.taskId]))[candidate.taskId] !== 'running'
    ) {
      outcomes.push({ outcome: 'skipped', taskId: candidate.taskId });
      continue;
    }

    const active = await dispatchModel.findActiveByTaskId(candidate.taskId);
    if (!active) {
      await taskModel.updateStatus(candidate.taskId, 'paused', { error: ORPHAN_PARK_REASON });
      outcomes.push({ outcome: 'orphan_parked', taskId: candidate.taskId });
      continue;
    }

    if (active.phase === 'cancel_requested' || matchesDispatchAssignee(task, active)) {
      outcomes.push({ outcome: 'skipped', taskId: candidate.taskId });
      continue;
    }

    const stopped = await dispatchModel.requestStop({
      dispatchId: active.id,
      fence: active.fence,
      generation: active.generation,
      operationId: active.operationId ?? undefined,
      reason: 'ownership_drift',
    });
    outcomes.push(
      stopped
        ? { outcome: 'drift_fenced', taskId: candidate.taskId }
        : { outcome: 'skipped', taskId: candidate.taskId },
    );
  }
  return outcomes;
};

/**
 * Execution-ownership transfer for system initiators — the single write path
 * every non-interactive reassignment of a live task must take (Linear inbound
 * sync, goal agent moves, …).
 *
 * Order is the protocol: fence the incumbent's active dispatch FIRST, then
 * rewrite the assignee under `executionTransfer`, so no commit can ever read
 * "stored owner B / running executor A". The cancellation sweep then settles
 * the fenced dispatch and parks the task at 'paused' — this is the `park`
 * successor policy; whether and when a successor dispatch starts is left to
 * the caller's orchestrator. The interactive `restart` policy lives in
 * `TaskService.handoffTask`, which additionally confirms the remote
 * interrupt and dispatches the successor itself.
 *
 * `patch` may carry sibling fields alongside `assigneeAgentId` — they land in
 * the same write. Pass `mutation.expectedDomainRevision` (usually the
 * revision the task was read at) to CAS the transfer against interleaving
 * writes.
 */
export const transferTaskExecutionOwnership = async (input: {
  db: OrviloDatabase;
  mutation?: TaskMutationContext;
  patch: Parameters<TaskModel['update']>[1];
  /** Fencing reason stamped on the incumbent dispatch's waitingReason. */
  reason: string;
  task: TaskItem;
}): Promise<TaskItem | null> => {
  const taskModel = new TaskModel(
    input.db,
    input.task.createdByUserId ?? '',
    input.task.workspaceId ?? undefined,
  );
  // Fence first under the derived state — `task.status` is the frozen column
  // and cannot report a live run.
  if ((await taskModel.derivedStatusByIds([input.task.id]))[input.task.id] === 'running') {
    await TaskDispatchModel.requestStopForTasks(input.db, [input.task.id], input.reason);
  }
  return taskModel.update(input.task.id, input.patch, {
    ...input.mutation,
    executionTransfer: true,
  });
};
