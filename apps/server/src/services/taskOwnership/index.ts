import { and, asc, eq, lt } from 'drizzle-orm';

import { TaskModel } from '@/database/models/task';
import { matchesDispatchAssignee, TaskDispatchModel } from '@/database/models/taskDispatch';
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
    .where(and(eq(tasks.status, 'running'), lt(tasks.updatedAt, cutoff)))
    .orderBy(asc(tasks.updatedAt), asc(tasks.id))
    .limit(limit);

  const outcomes: TaskOwnershipInvariantOutcome[] = [];
  for (const candidate of candidates) {
    const workspaceId = candidate.workspaceId ?? undefined;
    const taskModel = new TaskModel(input.db, candidate.createdByUserId ?? '', workspaceId);
    const dispatchModel = new TaskDispatchModel(input.db, workspaceId);

    const task = await taskModel.findById(candidate.taskId);
    if (!task || task.status !== 'running') {
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
