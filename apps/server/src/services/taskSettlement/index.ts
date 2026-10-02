import { deriveTaskExecutionState, type TaskItem, type TaskStatus } from '@orvilo/types';

import { TaskModel } from '@/database/models/task';
import { TaskTopicModel } from '@/database/models/taskTopic';
import { TeamModel } from '@/database/models/team';
import type { OrviloDatabase } from '@/database/type';

import { resolveSettlementPlan } from './policy';
import type { SettlementPlan, SettlementResult, SettleTaskExecutionInput } from './types';
import { resolveWorkflowTransition, type TaskWorkflowPatch } from './workflowTransition';

export { attentionForVerifyOutcome, deriveTaskAttention } from './attention';
export { resolveSettlementPlan, resolveTaskReviewRequirement } from './policy';
export * from './types';
export { resolveWorkflowTransition, type TaskWorkflowPatch } from './workflowTransition';

const TERMINAL_LEGACY_STATUSES = new Set(['canceled', 'completed', 'failed']);

/**
 * The single chokepoint where an execution/verify outcome becomes task state.
 *
 * Given `taskId` + what just happened (`outcome`, or `verifyOutcome` for the
 * verify-driven path), the policy table decides the three canonical layers —
 * Issue Status (`workflowCategory`/`workflowStateRefId`), execution
 * projection, attention reason — plus the legacy `tasks.status` projection,
 * and applies them atomically through the caller-supplied concurrency guard
 * (`expectedContract`, `reservationId`, `expectedStatus`) or plain write.
 *
 * Callers NEVER decide state themselves: they describe the outcome and pass
 * their guard through `context`. `hold`/`skippedReason` results mean the
 * settle was fenced (stale generation, another owner) or declined by policy —
 * no write is performed.
 */
export const settleTaskExecution = async (
  db: OrviloDatabase,
  userId: string,
  input: SettleTaskExecutionInput,
  workspaceId?: string,
): Promise<SettlementResult> => {
  const { context, dispatchFence, executionGeneration, taskId } = input;
  const taskModel = new TaskModel(db, userId, workspaceId);
  const task = await taskModel.findById(taskId);

  const noWrite = (
    decision: SettlementResult['decision'],
    execution: SettlementResult['execution'],
    skippedReason: SettlementResult['skippedReason'],
  ): SettlementResult => ({
    applied: false,
    attention: 'none',
    decision,
    execution,
    skippedReason,
  });

  if (!task) {
    return noWrite({ type: 'hold' }, null, 'no_task');
  }
  if (TERMINAL_LEGACY_STATUSES.has(task.status)) {
    return noWrite({ type: 'hold' }, null, 'terminal');
  }

  // Fence: a settle whose generation no longer matches the task's current
  // topic row is a late callback — it must not move the task. Generations
  // live on `task_topics` (each run is a row); `currentTopicId` points at the
  // active one.
  if (executionGeneration !== undefined || dispatchFence !== undefined) {
    const currentTopic = task.currentTopicId
      ? await new TaskTopicModel(db, userId, workspaceId).findByTopicId(task.currentTopicId)
      : null;
    if (
      currentTopic &&
      ((executionGeneration !== undefined &&
        currentTopic.executionGeneration !== null &&
        executionGeneration !== currentTopic.executionGeneration) ||
        (dispatchFence !== undefined &&
          currentTopic.dispatchFence !== null &&
          dispatchFence !== currentTopic.dispatchFence))
    ) {
      return noWrite({ type: 'hold' }, null, 'stale_generation');
    }
  }

  const reviewRequired =
    input.outcome === 'succeeded' && !context?.verifyBound
      ? await taskModel.resolveTaskReviewRequirement(task)
      : false;

  const plan = resolveSettlementPlan({
    context,
    outcome: input.outcome,
    reviewRequired,
    runStarted: input.runStarted,
    task,
    verifyOutcome: input.verifyOutcome,
  });

  const execution = plan.execution ?? (await deriveExecution(db, userId, input, workspaceId));

  if (plan.decision.type === 'hold' || (!plan.legacyStatus && !plan.workflowCategory)) {
    return {
      applied: false,
      attention: plan.attention,
      decision: plan.decision,
      execution,
      skippedReason: plan.decision.type === 'hold' ? 'hold' : 'unchanged',
      task,
    };
  }

  // Resolve the workflow target onto the team's state list — the same
  // ambiguity rule as a board move (never a positional guess).
  let workflowAmbiguous = false;
  let workflowPatch: TaskWorkflowPatch = {};
  if (plan.workflowCategory) {
    const states = task.teamId
      ? await new TeamModel(db, userId, workspaceId).listWorkflowStates(task.teamId)
      : [];
    const transition = resolveWorkflowTransition({ category: plan.workflowCategory, states });
    workflowAmbiguous = transition.ambiguous;
    workflowPatch = transition.patch;
  }

  const updated = await applyPlan(db, userId, workspaceId, task, plan, workflowPatch, input);
  if (!updated) {
    return {
      applied: false,
      attention: plan.attention,
      decision: plan.decision,
      execution,
      skippedReason: 'stale_generation',
      task,
    };
  }

  return {
    applied: true,
    attention: plan.attention,
    decision: plan.decision,
    execution,
    legacyStatus: plan.legacyStatus,
    workflowAmbiguous,
    workflowCategory: workflowPatch.workflowCategory,
    task: updated,
  };
};

/** Derive the current canonical execution state for callers that need it back. */
const deriveExecution = async (
  db: OrviloDatabase,
  userId: string,
  input: SettleTaskExecutionInput,
  workspaceId?: string,
) => {
  const taskTopicModel = new TaskTopicModel(db, userId, workspaceId);
  const topic = input.operationId
    ? await taskTopicModel.findByOperationId(input.operationId)
    : null;
  return deriveTaskExecutionState({
    legacyStatus: topic?.status ?? undefined,
    runState: topic?.runState ?? null,
  });
};

/** Write the plan through the concurrency guard the caller supplied. */
const applyPlan = async (
  db: OrviloDatabase,
  userId: string,
  workspaceId: string | undefined,
  task: TaskItem,
  plan: SettlementPlan,
  workflowPatch: TaskWorkflowPatch,
  input: SettleTaskExecutionInput,
) => {
  const { context } = input;
  const taskModel = new TaskModel(db, userId, workspaceId);
  const status = plan.legacyStatus ?? task.status;

  const extra = {
    ...workflowPatch,
    ...(context?.error !== undefined ? { error: context.error } : {}),
    ...(context?.clearRunReservation
      ? { runReservationExpiresAt: null as Date | null, runReservationId: null as string | null }
      : {}),
    ...(status === 'running' ? { startedAt: new Date() } : {}),
    ...(status === 'completed' || status === 'failed' || status === 'canceled'
      ? { completedAt: new Date() }
      : {}),
  };

  if (context?.throughTaskService) {
    // Call-time import: services/task → taskRunner → taskLifecycle →
    // taskSettlement would be a module cycle if this were static.
    const { TaskService } = await import('../task');
    const service = new TaskService(db, userId, workspaceId);
    const result = await service.updateStatus(
      {
        error: context?.error ?? undefined,
        expectedContract: context?.expectedContract,
        id: task.id,
        status: status as TaskStatus,
        workflow: workflowPatch,
      },
      undefined,
      context?.reservationId
        ? {
            currentStatus: (context.expectedStatus ?? task.status) as TaskStatus,
            reservationId: context.reservationId,
          }
        : undefined,
      {
        beforeMutation: context?.beforeMutation,
        onStatusCommitted: context?.onStatusCommitted,
      },
    );
    return result?.task ?? null;
  }

  if (context?.expectedContract) {
    return taskModel.updateStatusForExecutionContract(
      task.id,
      status,
      {
        ...context.expectedContract,
        ...(context.reservationId ? { runReservationId: context.reservationId } : {}),
        ...(context.expectedStatus ? { status: context.expectedStatus } : {}),
      },
      extra,
    );
  }
  if (context?.reservationId) {
    return taskModel.updateStatusIfReservation(
      task.id,
      context.reservationId,
      context.expectedStatus ?? task.status,
      status,
      extra,
    );
  }
  if (context?.expectedStatus) {
    return taskModel.updateStatusIfCurrent(task.id, context.expectedStatus, status, extra);
  }
  return taskModel.updateStatus(task.id, status, extra);
};
