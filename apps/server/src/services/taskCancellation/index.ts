import { randomUUID } from 'node:crypto';

import { TaskDispatchModel } from '@/database/models/taskDispatch';
import type { OrviloDatabase } from '@/database/type';
import { AiAgentService } from '@/server/services/aiAgent';
import { TaskIntegrationService } from '@/server/services/taskIntegration';

const DEFAULT_LEASE_MS = 2 * 60 * 1000;
const DEFAULT_RETRY_MS = 30 * 1000;

export type TaskCancellationOutcome =
  | { dispatchId: string; outcome: 'canceled'; taskId: string }
  | { dispatchId: string; outcome: 'retry'; reason: string }
  | { dispatchId: string; outcome: 'skipped' };

const retryReason = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return `cancel_retry:${message}`.slice(0, 500);
};

/**
 * Consume one durable cancel_requested dispatch.
 *
 * Remote interruption deliberately runs outside a database transaction. The
 * dispatch fence prevents the old completion callback from settling while the
 * intent is active; a crash after a confirmed interrupt leaves the same
 * operationId claimable for an idempotent retry.
 */
export const processTaskCancellation = async (input: {
  db: OrviloDatabase;
  dispatchId: string;
  leaseMs?: number;
  retryMs?: number;
  workspaceId?: string;
}): Promise<TaskCancellationOutcome> => {
  const model = new TaskDispatchModel(input.db, input.workspaceId);
  const owner = `task-cancel:${randomUUID()}`;
  const claim = await model.claimCancellation(
    input.dispatchId,
    owner,
    input.leaseMs ?? DEFAULT_LEASE_MS,
  );
  if (!claim) return { dispatchId: input.dispatchId, outcome: 'skipped' };

  try {
    const operationId = claim.dispatch.operationId;
    if (operationId) {
      if (!claim.topic?.userId) {
        throw new Error('running dispatch has no cancellation principal');
      }
      const interruption = await new AiAgentService(input.db, claim.topic.userId, {
        workspaceId: input.workspaceId,
      }).interruptTask({
        operationId,
        topicId: claim.topic.topicId ?? undefined,
      });
      if (!interruption.success || interruption.deviceCancellationConfirmed === false) {
        throw new Error('runtime interruption was not confirmed');
      }
    }

    const settled = await model.settleCancellation({
      dispatchId: claim.dispatch.id,
      fence: claim.fence,
      generation: claim.dispatch.generation,
      operationId,
      owner,
    });
    if (!settled) throw new Error('cancellation claim changed before settlement');

    if (claim.topic?.userId) {
      // Cleanup is intentionally best-effort and after the durable settlement:
      // a worktree failure cannot resurrect a confirmed canceled execution.
      await new TaskIntegrationService(input.db, claim.topic.userId, input.workspaceId)
        .cleanupTaskWorktrees(claim.dispatch.taskId)
        .catch((error) => {
          console.error(
            '[task-cancellation] failed to clean worktrees for task %s:',
            claim.dispatch.taskId,
            error,
          );
        });
    }

    return {
      dispatchId: claim.dispatch.id,
      outcome: 'canceled',
      taskId: claim.dispatch.taskId,
    };
  } catch (error) {
    const reason = retryReason(error);
    await model.retryCancellation({
      dispatchId: claim.dispatch.id,
      fence: claim.fence,
      owner,
      reason,
      retryAfterMs: input.retryMs ?? DEFAULT_RETRY_MS,
    });
    return { dispatchId: claim.dispatch.id, outcome: 'retry', reason };
  }
};

/** Recover stop intents whose immediate post-commit wakeup was lost. */
export const sweepTaskCancellations = async (input: {
  db: OrviloDatabase;
  limit?: number;
}): Promise<TaskCancellationOutcome[]> => {
  const candidates = await TaskDispatchModel.findCancellationCandidates(input.db, {
    limit: input.limit,
  });
  const outcomes: TaskCancellationOutcome[] = [];
  for (const candidate of candidates) {
    outcomes.push(
      await processTaskCancellation({
        db: input.db,
        dispatchId: candidate.dispatchId,
        workspaceId: candidate.workspaceId ?? undefined,
      }),
    );
  }
  return outcomes;
};
