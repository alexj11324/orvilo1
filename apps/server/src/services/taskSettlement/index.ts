import { deriveTaskExecutionState, type TaskItem, type TaskStatus } from '@orvilo/types';

import { TaskModel } from '@/database/models/task';
import { TaskTopicModel } from '@/database/models/taskTopic';
import { TeamModel } from '@/database/models/team';
import type { OrviloDatabase } from '@/database/type';

import {
  isWaitingForReviewer,
  requestReviewerAssignment,
  WAITING_FOR_REVIEWER,
} from '../task/reviewerAssignment';
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
 * projection, attention reason — plus the legacy status-transition vocabulary,
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
  const unresolvedInput =
    !input.runStarted && !context?.issueCancel
      ? await taskModel.hasUnresolvedInput(taskId, input.operationId)
      : false;
  if (
    (!unresolvedInput && task.workflowCategory === 'done') ||
    task.workflowCategory === 'canceled' ||
    (TERMINAL_LEGACY_STATUSES.has(task.status) && !context?.expectedContract && !unresolvedInput)
  ) {
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
    input.outcome === 'succeeded' && task.automationMode && !context?.verifyBound
      ? await taskModel.resolveTaskReviewRequirement(task)
      : false;

  let plan = resolveSettlementPlan({
    context: { ...context, unresolvedInput },
    outcome: input.outcome,
    reviewRequired,
    runStarted: input.runStarted,
    task,
    verifyOutcome: input.verifyOutcome,
  });

  const deliveredIssue =
    input.outcome === 'succeeded' &&
    !task.automationMode &&
    !context?.blocked &&
    !unresolvedInput &&
    !context?.manualAcceptance;
  if (deliveredIssue) {
    plan = {
      ...plan,
      attention: 'review_required',
      decision: { type: 'review' },
      execution: 'succeeded',
      legacyStatus: 'paused',
      workflowCategory: 'in_review',
    };
  }
  // An unusable reviewer already parked this delivered operation; its completion
  // callback must preserve that explanation instead of moving it into review.
  if (deliveredIssue && task.reviewerAgentId && isWaitingForReviewer(task)) {
    plan = { ...plan, workflowCategory: 'in_progress' };
    input = { ...input, context: { ...context, error: task.error } };
  }
  const waitingForReviewer =
    !task.reviewerAgentId &&
    !context?.manualAcceptance &&
    (plan.workflowCategory === 'in_review' ||
      (input.verifyOutcome === 'passed' && !task.automationMode && !unresolvedInput));
  if (waitingForReviewer) {
    plan = {
      ...plan,
      attention: 'review_required',
      decision: { type: 'review' },
      execution: 'succeeded',
      legacyStatus: 'paused',
      workflowCategory: 'in_progress',
    };
    input = { ...input, context: { ...context, error: WAITING_FOR_REVIEWER } };
  }

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
    const stateWorkspaceId = workspaceId ?? task.workspaceId;
    const states =
      task.teamId && stateWorkspaceId
        ? await new TeamModel(db, userId, stateWorkspaceId).listWorkflowStates(task.teamId)
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

  if (deliveredIssue && !waitingForReviewer && updated.workflowCategory === 'in_review') {
    const { startIssueReview } = await import('../task/review');
    await startIssueReview(
      db,
      userId,
      taskId,
      { deliveryOperationId: input.operationId },
      workspaceId,
    );
  }

  if (waitingForReviewer) {
    await requestReviewerAssignment(
      db,
      userId,
      updated,
      workspaceId ?? updated.workspaceId ?? undefined,
    );
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
  const parkedReason =
    status === 'paused' && plan.attention !== 'none' ? plan.attention : undefined;

  const extra = {
    ...workflowPatch,
    ...(context?.expectedIssueReviewCycleId
      ? { expectedIssueReviewCycleId: context.expectedIssueReviewCycleId }
      : {}),
    ...(input.runStarted ? { preserveIssueReviewCycle: true } : {}),
    ...(parkedReason ? { parkedReason } : {}),
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
    const serviceInput = {
      error: context?.error ?? undefined,
      expectedContract: context?.expectedContract,
      id: task.id,
      status: status as TaskStatus,
      workflow: {
        ...workflowPatch,
        ...(context?.expectedIssueReviewCycleId
          ? { expectedIssueReviewCycleId: context.expectedIssueReviewCycleId }
          : {}),
        ...(parkedReason ? { parkedReason } : {}),
        ...(input.runStarted ? { preserveIssueReviewCycle: true } : {}),
      },
    };
    const options = {
      beforeMutation: context?.beforeMutation,
      onStatusCommitted: context?.onStatusCommitted,
    };
    // updateStatus's overloads distinguish a reservation CAS (guard present)
    // from a plain write — pick the call shape at the reservationId split.
    const result = context?.reservationId
      ? await service.updateStatus(
          serviceInput,
          undefined,
          {
            currentStatus: (context.expectedStatus ?? task.status) as TaskStatus,
            reservationId: context.reservationId,
          },
          options,
        )
      : await service.updateStatus(serviceInput, undefined, undefined, options);
    return result?.task ?? null;
  }

  const settled = context?.expectedContract
    ? await taskModel.updateStatusForExecutionContract(
        task.id,
        status,
        {
          ...context.expectedContract,
          ...(context.reservationId ? { runReservationId: context.reservationId } : {}),
          ...(context.expectedStatus ? { status: context.expectedStatus } : {}),
        },
        extra,
      )
    : context?.reservationId
      ? await taskModel.updateStatusIfReservation(
          task.id,
          context.reservationId,
          context.expectedStatus ?? task.status,
          status,
          extra,
        )
      : context?.expectedStatus
        ? await taskModel.updateStatusIfCurrent(task.id, context.expectedStatus, status, extra)
        : await taskModel.updateStatus(task.id, status, extra);

  // The run moved the Issue (to In Review, to Done, back to In Progress): say
  // so in its feed, under the system's name — nobody clicked anything. The
  // TaskService path above logs the same thing itself. Best-effort: the
  // settlement is committed and must not fail over its feed line.
  if (settled) {
    try {
      await taskModel.logWorkflowMove(task.id, task, settled, {});
    } catch (error) {
      console.error('[taskSettlement] failed to log workflow move', error);
    }
  }
  return settled;
};
