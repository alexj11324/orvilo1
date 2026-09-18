import { LinearSyncModel } from '@/database/models/linearSync';
import {
  TaskDispatchModel,
  type TaskPlanningDispatchCandidate,
} from '@/database/models/taskDispatch';
import type { OrviloDatabase } from '@/database/type';
import { taskPlanningProposalSchema } from '@/server/services/linearSync/contract';
import { TaskRunnerService } from '@/server/services/taskRunner';

export type TaskDispatchStartOutcome =
  | { dispatchId: string; outcome: 'retry'; reason: string }
  | { dispatchId: string; outcome: 'skipped' }
  | { dispatchId: string; outcome: 'started' }
  | { dispatchId: string; outcome: 'waiting'; reason: string };

/**
 * Wake one committed planner dispatch intent. The stable idempotency key makes
 * a crash between the planning transaction and this call safe to retry.
 */
export const processPlanningTaskDispatchStart = async (input: {
  candidate: TaskPlanningDispatchCandidate;
  db: OrviloDatabase;
}): Promise<TaskDispatchStartOutcome> => {
  const { candidate } = input;
  if (!candidate.workspaceId) return { dispatchId: candidate.dispatchId, outcome: 'skipped' };
  const workspaceId = candidate.workspaceId;
  const dispatchModel = new TaskDispatchModel(input.db, workspaceId);
  const revision = await new LinearSyncModel(
    input.db,
    workspaceId,
  ).findPlanningRevisionByInputRevision(candidate.planRevision);
  const parsed = taskPlanningProposalSchema.safeParse(
    revision?.status === 'applied' ? revision.proposal : undefined,
  );
  const action = parsed.success
    ? parsed.data.actions.find(
        (item) => item.action === 'request_resume' && item.taskId === candidate.taskId,
      )
    : undefined;
  if (!action || action.action !== 'request_resume') {
    const reason = 'planning_resume_instruction_missing';
    await dispatchModel.markWaiting(candidate.dispatchId, reason);
    return { dispatchId: candidate.dispatchId, outcome: 'waiting', reason };
  }

  try {
    await new TaskRunnerService(input.db, candidate.userId, workspaceId).runTask({
      extraPrompt: action.instruction,
      idempotencyKey: candidate.idempotencyKey,
      planRevision: candidate.planRevision,
      requestedBy: candidate.requestedBy,
      taskId: candidate.taskId,
      trigger: 'orchestrator',
    });
    return { dispatchId: candidate.dispatchId, outcome: 'started' };
  } catch (error) {
    const dispatch = await dispatchModel.findById(candidate.dispatchId);
    if (dispatch?.phase === 'requested') {
      return {
        dispatchId: candidate.dispatchId,
        outcome: 'retry',
        reason: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
      };
    }
    if (dispatch?.phase === 'waiting') {
      return {
        dispatchId: candidate.dispatchId,
        outcome: 'waiting',
        reason: dispatch.waitingReason ?? 'dispatch_waiting',
      };
    }
    return { dispatchId: candidate.dispatchId, outcome: 'skipped' };
  }
};

/** Recover planner wakeups from the durable dispatch table after a crash or queue loss. */
export const sweepPlanningTaskDispatchStarts = async (input: {
  db: OrviloDatabase;
  limit?: number;
}): Promise<TaskDispatchStartOutcome[]> => {
  const candidates = await TaskDispatchModel.findPlanningStartCandidates(input.db, {
    limit: input.limit,
  });
  const outcomes: TaskDispatchStartOutcome[] = [];
  for (const candidate of candidates) {
    outcomes.push(await processPlanningTaskDispatchStart({ candidate, db: input.db }));
  }
  return outcomes;
};
