import { TaskIdentifier } from '@orvilo/builtin-tool-task';
import type {
  IssueChecklistReviewItem,
  IssueDeliveryProof,
  IssueReviewState,
  TaskItem,
} from '@orvilo/types';
import { isAutomationRunTrigger } from '@orvilo/types';
import { toRecord } from '@orvilo/utils/object';
import { and, eq, notInArray } from 'drizzle-orm';

import { AgentModel } from '@/database/models/agent';
import { AgentOperationModel } from '@/database/models/agentOperation';
import { MessageModel } from '@/database/models/message';
import { TaskModel } from '@/database/models/task';
import { TaskTopicModel } from '@/database/models/taskTopic';
import { TopicModel } from '@/database/models/topic';
import { agentOperations, taskDispatches } from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import { assertCanUseWorkspaceAgent } from '@/server/routers/lambda/_helpers/workspaceAgentGuard';
import { DEVICE_QUEUE_GRACE_MS } from '@/server/services/aiAgent/deviceQueue';
import { agentCanMountBuiltinToolSurface } from '@/server/services/aiAgent/pipeline/resolveExecutionBinding';
import { deviceGateway } from '@/server/services/deviceGateway';
import { readRemoteRunAdmission } from '@/server/services/heterogeneousAgent/runAdmission';

import { IssueChecklistService } from './checklist';

export const readIssueReview = (task: Pick<TaskItem, 'config'>): IssueReviewState | undefined =>
  toRecord(task.config)?.issueReview as IssueReviewState | undefined;

/** The same saved Agent/runtime capability the picker advertises. */
export async function resolveIssueReviewer(
  db: OrviloDatabase,
  userId: string,
  taskId: string,
  workspaceId?: string,
) {
  const task = await new TaskModel(db, userId, workspaceId).findById(taskId);
  const agentId = task?.reviewerAgentId;
  if (!agentId) throw new Error('Set a reviewer Agent on the Issue.');
  await assertCanUseWorkspaceAgent({ agentId, db, userId, workspaceId });
  const agent = await new AgentModel(db, userId, workspaceId).getAgentConfigForExecution(agentId);
  if (!agent || !agentCanMountBuiltinToolSurface(agent, agent.model)) {
    throw new Error(
      'The reviewer runtime cannot mount submitTaskReview. Choose a supported Agent.',
    );
  }
  return agentId;
}

export async function startIssueReview(
  db: OrviloDatabase,
  userId: string,
  taskId: string,
  options: { deliveryOperationId?: string } = {},
  workspaceId?: string,
) {
  const model = new TaskModel(db, userId, workspaceId);
  const initial = await model.findById(taskId);
  if (!initial) return;
  const currentDelivery = initial.currentTopicId
    ? await new TaskTopicModel(db, userId, workspaceId).findByTopicId(initial.currentTopicId)
    : null;
  const review = await model.claimIssueReview(taskId, {
    deliveryOperationId: options.deliveryOperationId ?? currentDelivery?.operationId ?? undefined,
  });
  if (!review || review.state !== 'pending') return;
  let operationId: string | undefined;
  try {
    const agentId = await resolveIssueReviewer(db, userId, taskId, workspaceId);
    const task = await model.findById(taskId);
    if (!task) return;
    const { run, proof } = await new IssueChecklistService(db, userId, workspaceId).prepareReview(
      taskId,
      review.deliveryOperationId,
    );
    const topicModel = new TaskTopicModel(db, userId, workspaceId);
    const delivery = review.deliveryOperationId
      ? await topicModel.findByOperationId(review.deliveryOperationId)
      : task.currentTopicId
        ? await topicModel.findByTopicId(task.currentTopicId)
        : null;
    const deliveredTopic = delivery?.topicId
      ? await new TopicModel(db, userId, workspaceId).findById(delivery.topicId)
      : null;
    const metadata = toRecord(deliveredTopic?.metadata);
    const directory =
      metadata?.workingDirectory ?? toRecord(metadata?.workingDirectoryConfig)?.path;
    const cwd =
      delivery?.environmentSnapshot?.workingDirectory ??
      (typeof directory === 'string' ? directory : undefined);
    const finalReply = toRecord(delivery?.handoff)?.content;
    const prompt = [
      `Review Issue ${task.identifier}: ${task.name ?? ''}`,
      `Issue background and scope:\n${task.instruction}`,
      `Confirmed Checklist (the sole acceptance criteria):\n${JSON.stringify(run.plan)}`,
      `Checklist round: ${run.id}\nDelivery proof: ${JSON.stringify(proof)}`,
      `Delivered final reply:\n${typeof finalReply === 'string' ? finalReply : '(No final reply recorded)'}`,
      ...(cwd ? [`Working directory: ${cwd}`] : []),
      `Check every Checklist item against this delivery version. Record exactly one overall verdict using submitTaskReview with identifier ${task.identifier}, runId, the exact delivery proof, and items containing each checkItemId, verdict pass/fail/uncertain, comment and real evidence. Required uncertain or failing items cannot pass. A failing overall verdict requires a repair comment. Passing review waits for human acceptance and does not complete or merge the Issue.`,
    ].join('\n\n');
    const { AiAgentService } = await import('../aiAgent');
    const result = await new AiAgentService(db, userId, { workspaceId }).execAgent({
      additionalPluginIds: [TaskIdentifier],
      agentId,
      appContext: {
        taskId,
        issueReviewCycleId: review.cycleId,
        nativeFullAccess:
          isAutomationRunTrigger(delivery?.trigger ?? undefined) ||
          !!delivery?.contract?.occurrence,
        ...(cwd ? { initialTopicMetadata: { workingDirectory: cwd } } : {}),
      },
      autoStart: true,
      beforeOperationStart: async (input) => {
        if (
          !(await model.bindIssueReviewOperation(taskId, {
            actorAgentId: agentId,
            cycleId: review.cycleId,
            operationId: input.operationId,
          }))
        )
          throw new Error('Issue review cycle changed before launch');
        operationId = input.operationId;
      },
      prompt,
      requiredToolIds: [TaskIdentifier],
      skipTaskVerification: true,
      taskId,
      userInterventionConfig: { approvalMode: 'headless' },
    });
    if (!result.success) throw new Error(result.error ?? 'Reviewer could not run');
    if (result.status === 'idle' && !result.autoStarted) {
      // Keep the operation binding: the shared device queue owns reconnect.
      await model.releaseIssueReview(taskId, {
        cycleId: review.cycleId,
        operationId: result.operationId,
        keepOperation: true,
        reason: 'Reviewer device offline; waiting for reconnect.',
      });
    }
  } catch (error) {
    console.error('[task:review] Reviewer launch failed', error);
    const operation = operationId
      ? await new AgentOperationModel(db, userId, workspaceId).findById(operationId)
      : undefined;
    await model.releaseIssueReview(taskId, {
      cycleId: review.cycleId,
      operationId,
      keepOperation:
        !!operation && ['idle', 'running', 'waiting_for_human'].includes(operation.status),
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function submitIssueReview(
  db: OrviloDatabase,
  userId: string,
  params: {
    taskId: string;
    cycleId: string;
    operationId: string;
    actorAgentId: string;
    verdict: 'pass' | 'fail';
    comment?: string;
    runId: string;
    proof: IssueDeliveryProof;
    items: IssueChecklistReviewItem[];
  },
  workspaceId?: string,
) {
  if (params.verdict === 'fail' && !params.comment?.trim())
    throw new Error('A failing review requires a comment.');
  const result = await new IssueChecklistService(db, userId, workspaceId).submitReviewItems({
    ...params,
    reviewerOperationId: params.operationId,
  });
  if (result.repairPending) await resumeIssueReviewRepair(db, userId, result.task.id, workspaceId);
  else if (params.verdict === 'pass') {
    const { TaskRunnerService } = await import('../taskRunner');
    await new TaskRunnerService(
      db,
      result.task.createdByUserId ?? userId,
      workspaceId,
    ).cascadeOnCompletion(result.task.id);
  }
  return result;
}

/** Keep the intent until the ordinary runner confirms its durable handoff. */
export async function resumeIssueReviewRepair(
  db: OrviloDatabase,
  userId: string,
  taskId: string,
  workspaceId?: string,
) {
  const model = new TaskModel(db, userId, workspaceId);
  const task = await model.findById(taskId);
  const review = task && readIssueReview(task);
  if (!task || task.workflowCategory !== 'in_progress' || !review?.repairPending) return;
  const comment = review.lastFailureCommentId
    ? await model.findCommentById(review.lastFailureCommentId)
    : undefined;
  if (!comment) return;
  try {
    const idempotencyKey = `issue-review-repair:${review.cycleId}`;
    const [dispatch] = await db
      .select()
      .from(taskDispatches)
      .where(
        and(eq(taskDispatches.taskId, taskId), eq(taskDispatches.idempotencyKey, idempotencyKey)),
      )
      .limit(1);
    if (
      dispatch &&
      ['dispatched', 'running', 'outcome_unknown', 'succeeded'].includes(dispatch.phase)
    ) {
      await model.completeIssueReviewRepair(taskId, { cycleId: review.cycleId });
      return;
    }
    // The reviewer is still inside submitTaskReview. Wait for its ordinary terminal callback.
    const [activeOperation] = await db
      .select({ id: agentOperations.id })
      .from(agentOperations)
      .where(
        and(
          eq(agentOperations.taskId, taskId),
          notInArray(agentOperations.status, ['abandoned', 'done', 'error', 'interrupted']),
        ),
      )
      .limit(1);
    if (activeOperation) return;
    const { TaskRunnerService } = await import('../taskRunner');
    const result = await new TaskRunnerService(db, userId, workspaceId).runTask({
      extraPrompt: comment.content,
      idempotencyKey,
      intent: 'repair',
      issueReviewRepairCycleId: review.cycleId,
      nativeAutomationParentDispatchId: task.currentTopicId
        ? (await new TaskTopicModel(db, userId, workspaceId).findByTopicId(task.currentTopicId))
            ?.contract?.occurrence?.parentDispatchId
        : undefined,
      parentOperationId: review.deliveryOperationId,
      skipTaskVerification: true,
      taskId,
    });
    if (result.success) await model.completeIssueReviewRepair(taskId, { cycleId: review.cycleId });
  } catch (error) {
    console.error('[task:review] Assignee repair remains pending', error);
  }
}

/** All terminal paths converge here, including dispatch errors and queued expiry. */
export async function completeIssueReviewOperation(
  db: OrviloDatabase,
  userId: string,
  operationId: string,
  reason: string,
  workspaceId?: string,
) {
  const operation = await new AgentOperationModel(db, userId, workspaceId).findById(operationId);
  const cycleId = operation?.appContext?.issueReviewCycleId;
  if (!operation?.taskId || typeof cycleId !== 'string') return;
  const model = new TaskModel(db, userId, workspaceId);
  await model.releaseIssueReview(operation.taskId, {
    cycleId,
    operationId,
    reason:
      reason === 'done'
        ? 'Reviewer finished without submitting a verdict.'
        : `Reviewer run ended: ${operation.error?.message ?? reason}`,
  });
  const task = await model.findById(operation.taskId);
  const review = task && readIssueReview(task);
  if (
    review?.cycleId === cycleId &&
    review.reviewerOperationId === operationId &&
    review.repairPending
  ) {
    await resumeIssueReviewRepair(db, userId, operation.taskId, workspaceId);
  }
}

/** Shared watchdog and local recovery use the durable Issue intents. */
export async function sweepIssueReviews(
  db: OrviloDatabase,
  options: { createdByUserId?: string; workspaceId?: string } = {},
) {
  const candidates = await TaskModel.queryPendingIssueReviews(db, options);
  for (const task of candidates) {
    const userId = task.createdByUserId ?? task.createdBySubjectId;
    if (!userId) continue;
    const workspaceId = task.workspaceId ?? undefined;
    const review = readIssueReview(task);
    try {
      if (review?.reviewerOperationId) {
        const operation = await new AgentOperationModel(db, userId, workspaceId).findById(
          review.reviewerOperationId,
        );
        if (
          operation &&
          ['idle', 'running', 'waiting_for_human', 'waiting_for_async_tool'].includes(
            operation.status,
          )
        ) {
          const stale =
            operation.status === 'running' &&
            Date.now() - new Date(operation.updatedAt).getTime() >= DEVICE_QUEUE_GRACE_MS;
          if (!stale) continue;
          const admission = readRemoteRunAdmission(operation.metadata);
          const probe = admission?.deviceId
            ? await deviceGateway.executeToolCall(
                {
                  deviceId: admission.deviceId,
                  userId: admission.deviceUserId ?? userId,
                  workspaceId: admission.deviceWorkspaceId,
                },
                {
                  apiName: 'getHeteroTaskStatus',
                  identifier: 'getHeteroTaskStatus',
                  arguments: JSON.stringify({ taskId: operation.id }),
                },
                10_000,
              )
            : undefined;
          const active = probe?.success ? toRecord(probe.state)?.active : undefined;
          if (active === true) continue;
          // A quiet run or lost dispatch ACK cannot prove absence. Only its admitted host can.
          if (
            active !== false ||
            !admission ||
            !['running', 'acknowledged'].includes(admission.state)
          ) {
            await new TaskModel(db, userId, workspaceId).releaseIssueReview(task.id, {
              cycleId: review.cycleId,
              operationId: operation.id,
              keepOperation: true,
              reason:
                'Reviewer stopped responding; waiting for its device to confirm the run ended.',
            });
            continue;
          }
          if (
            !(await new AgentOperationModel(db, userId, workspaceId).settleRunning(
              operation.id,
              'error',
            ))
          )
            continue;
          const { finalizeHeteroDispatchError } =
            await import('../aiAgent/pipeline/heteroDispatch');
          await finalizeHeteroDispatchError(
            {
              db,
              userId,
              workspaceId,
              messageModel: new MessageModel(db, userId, workspaceId),
              topicModel: new TopicModel(db, userId, workspaceId),
            },
            {
              agentId: operation.agentId ?? undefined,
              assistantMessageId: String(operation.metadata?.assistantMessageId ?? ''),
              operationId: operation.id,
              topicId: operation.topicId ?? '',
              message: 'Reviewer process is no longer active on its device.',
              detail: 'Reviewer process is no longer active on its device.',
            },
          );
        }
        // A bind precedes row creation; give an in-flight launch the existing recovery grace.
        if (!operation && Date.now() - new Date(task.updatedAt).getTime() < DEVICE_QUEUE_GRACE_MS)
          continue;
        await new TaskModel(db, userId, workspaceId).releaseIssueReview(task.id, {
          cycleId: review.cycleId,
          operationId: review.reviewerOperationId,
          reason: operation
            ? `Reviewer run ended: ${operation.error?.message ?? operation.status}`
            : 'Reviewer launch did not finish.',
        });
      }
      if (review?.repairPending) {
        await resumeIssueReviewRepair(db, userId, task.id, workspaceId);
        continue;
      }
      await startIssueReview(db, userId, task.id, {}, workspaceId);
    } catch (error) {
      console.error('[task:review] Recovery failed', error);
    }
  }
}
