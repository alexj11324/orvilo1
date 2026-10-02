import { randomUUID } from 'node:crypto';

import { AgentOperationModel } from '@/database/models/agentOperation';
import { MessageModel } from '@/database/models/message';
import { TaskModel } from '@/database/models/task';
import { TaskDispatchModel, type TaskDispatchRecoveryClaim } from '@/database/models/taskDispatch';
import type { AgentOperationItem } from '@/database/schemas/agentOperations';
import type { OrviloDatabase } from '@/database/type';
import { TaskLifecycleService } from '@/server/services/taskLifecycle';

const DEFAULT_LEASE_MS = 2 * 60 * 1000;
const DEFAULT_RETRY_MS = 30 * 1000;
/**
 * Window matching the operation lease convention (`settleStaleRunning`): a
 * `running` operation row is liveness evidence only while the runner keeps
 * touching `updatedAt` (`touchRunning`). A stale row is the signature of a
 * dead executor — treating it as active would reset the reconcile bound and
 * re-arm the task heartbeat every pass, live-locking the dispatch forever.
 * `waiting_*` statuses park legitimately quiet and converge through their
 * own abandonment path, so the staleness gate applies to `running` only.
 */
const DEFAULT_STALE_OPERATION_MS = 5 * 60 * 1000;
/**
 * Bound on consecutive unresolved `outcome_unknown` reconciles: each
 * reschedule bumps `recovery_attempts` (a stable live identity resets it),
 * so an op that never reaches a persisted terminal state cannot retry
 * forever while its dispatch pins the task's single execution slot.
 */
const MAX_RECOVERY_ATTEMPTS = 60;

export type TaskDispatchRecoveryOutcome =
  | { dispatchId: string; outcome: 'abandoned' }
  | { dispatchId: string; outcome: 'active'; operationId: string }
  | { dispatchId: string; outcome: 'retry'; reason: string }
  | { dispatchId: string; outcome: 'settled'; operationId: string }
  | { dispatchId: string; outcome: 'skipped' };

const retryReason = (reason: string) => reason.slice(0, 500);

const hasStableIdentity = (
  claim: TaskDispatchRecoveryClaim,
  operation: AgentOperationItem,
): boolean => {
  const { dispatch, task, topic } = claim;
  const context = operation.appContext;
  return Boolean(
    dispatch.operationId &&
    topic?.topicId &&
    topic.dispatchId === dispatch.id &&
    topic.operationId === dispatch.operationId &&
    topic.dispatchFence === dispatch.fence &&
    topic.executionGeneration === dispatch.generation &&
    operation.id === dispatch.operationId &&
    operation.taskId === task.id &&
    operation.topicId === topic.topicId &&
    context?.dispatchId === dispatch.id &&
    context.dispatchFence === dispatch.fence &&
    context.executionGeneration === dispatch.generation,
  );
};

const releaseUnknown = async (input: {
  claim: TaskDispatchRecoveryClaim;
  model: TaskDispatchModel;
  owner: string;
  reason: string;
  retryMs: number;
}): Promise<TaskDispatchRecoveryOutcome> => {
  const reason = retryReason(input.reason);
  await input.model.releaseRecovery({
    dispatchId: input.claim.dispatch.id,
    fence: input.claim.fence,
    owner: input.owner,
    phase: 'outcome_unknown',
    reason,
    retryAfterMs: input.retryMs,
  });
  return { dispatchId: input.claim.dispatch.id, outcome: 'retry', reason };
};

/**
 * Reconcile one expired dispatch lease against its persisted operation.
 * Recovery never invokes the runner: the dispatch, topic and operation must
 * agree on the same stable identity before local lifecycle state can advance.
 */
export const processTaskDispatchRecovery = async (input: {
  db: OrviloDatabase;
  dispatchId: string;
  leaseMs?: number;
  retryMs?: number;
  staleOperationMs?: number;
  workspaceId?: string;
}): Promise<TaskDispatchRecoveryOutcome> => {
  const model = new TaskDispatchModel(input.db, input.workspaceId);
  const owner = `task-recovery:${randomUUID()}`;
  const claim = await model.claimForRecovery(
    input.dispatchId,
    owner,
    input.leaseMs ?? DEFAULT_LEASE_MS,
  );
  if (!claim) return { dispatchId: input.dispatchId, outcome: 'skipped' };

  if (claim.dispatch.recoveryAttempts >= MAX_RECOVERY_ATTEMPTS) {
    const abandoned = await model.abandonRecovery({
      dispatchId: claim.dispatch.id,
      fence: claim.fence,
      generation: claim.dispatch.generation,
      owner,
      reason: `recovery_attempts_exhausted:${claim.dispatch.recoveryAttempts}`,
    });
    return {
      dispatchId: claim.dispatch.id,
      outcome: abandoned ? 'abandoned' : 'skipped',
    };
  }

  const retryMs = input.retryMs ?? DEFAULT_RETRY_MS;
  const operationId = claim.dispatch.operationId;
  const principalId = claim.topic?.userId;
  if (!operationId || !principalId) {
    return releaseUnknown({
      claim,
      model,
      owner,
      reason: 'recovery_identity_missing',
      retryMs,
    });
  }

  try {
    const operationModel = new AgentOperationModel(input.db, principalId, input.workspaceId);
    const operation = await operationModel.findById(operationId);
    if (!operation) {
      return releaseUnknown({
        claim,
        model,
        owner,
        reason: `operation_missing:${operationId}`,
        retryMs,
      });
    }
    if (!hasStableIdentity(claim, operation)) {
      return releaseUnknown({
        claim,
        model,
        owner,
        reason: `operation_identity_mismatch:${operationId}`,
        retryMs,
      });
    }

    if (['running', 'waiting_for_async_tool', 'waiting_for_human'].includes(operation.status)) {
      const staleBefore = Date.now() - (input.staleOperationMs ?? DEFAULT_STALE_OPERATION_MS);
      const stale = new Date(operation.updatedAt).getTime() < staleBefore;
      if (operation.status === 'running' && stale) {
        return releaseUnknown({
          claim,
          model,
          owner,
          reason: `operation_stale:${operation.status}`,
          retryMs,
        });
      }
      // `waiting_for_async_tool` parks legitimately quiet, so `updatedAt` alone
      // cannot stale it out — but a stale park with no live child op has no
      // producer left to fulfil its barrier (child missing/terminal and its
      // own abandonment path dead). Restoring 'running' re-arms the lease and
      // resets the reconcile bound every pass, which is the orphan-slot leak.
      if (
        operation.status === 'waiting_for_async_tool' &&
        stale &&
        !(await operationModel.hasLiveChildOperation(operation.id))
      ) {
        return releaseUnknown({
          claim,
          model,
          owner,
          reason: `operation_orphaned_wait:${operation.status}`,
          retryMs,
        });
      }
      const restored = await model.releaseRecovery({
        dispatchId: claim.dispatch.id,
        fence: claim.fence,
        owner,
        phase: 'running',
        reason: `runtime_${operation.status}`,
        retryAfterMs: retryMs,
      });
      if (!restored) return { dispatchId: claim.dispatch.id, outcome: 'skipped' };
      await new TaskModel(input.db, principalId, input.workspaceId).updateHeartbeat(claim.task.id);
      return { dispatchId: claim.dispatch.id, operationId, outcome: 'active' };
    }

    if (!['abandoned', 'done', 'error', 'interrupted'].includes(operation.status)) {
      return releaseUnknown({
        claim,
        model,
        owner,
        reason: `operation_not_terminal:${operation.status}`,
        retryMs,
      });
    }

    const topicId = claim.topic?.topicId ?? undefined;
    const lastAssistant = topicId
      ? await new MessageModel(input.db, principalId, input.workspaceId)
          .findLatestAssistantByOperationId({ operationId, topicId })
          .catch(() => undefined)
      : undefined;
    const reason =
      operation.status === 'done'
        ? 'done'
        : operation.status === 'interrupted'
          ? 'interrupted'
          : 'error';
    await new TaskLifecycleService(input.db, principalId, input.workspaceId).onTopicComplete({
      dispatchFence: claim.fence,
      dispatchId: claim.dispatch.id,
      errorMessage:
        operation.error?.message ??
        (reason === 'error' ? (operation.completionReason ?? operation.status) : undefined),
      executionGeneration: claim.dispatch.generation,
      lastAssistantContent:
        typeof lastAssistant?.content === 'string' ? lastAssistant.content : undefined,
      operationId,
      reason,
      runTrigger: claim.topic?.trigger ?? undefined,
      taskId: claim.task.id,
      taskIdentifier: claim.task.identifier,
      topicId,
    });
    return { dispatchId: claim.dispatch.id, operationId, outcome: 'settled' };
  } catch (error) {
    return releaseUnknown({
      claim,
      model,
      owner,
      reason: `recovery_failed:${error instanceof Error ? error.message : String(error)}`,
      retryMs,
    });
  }
};

/** Recover expired dispatch leases without creating replacement operations. */
export const sweepTaskDispatchRecovery = async (input: {
  db: OrviloDatabase;
  limit?: number;
}): Promise<TaskDispatchRecoveryOutcome[]> => {
  const candidates = await TaskDispatchModel.findRecoveryCandidates(input.db, {
    limit: input.limit,
  });
  const outcomes: TaskDispatchRecoveryOutcome[] = [];
  for (const candidate of candidates) {
    outcomes.push(
      await processTaskDispatchRecovery({
        db: input.db,
        dispatchId: candidate.dispatchId,
        workspaceId: candidate.workspaceId ?? undefined,
      }),
    );
  }
  return outcomes;
};
