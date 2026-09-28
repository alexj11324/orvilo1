import type { TaskRunTrigger } from '@orvilo/types';
import debug from 'debug';
import { and, eq } from 'drizzle-orm';
import type { Context } from 'hono';

import { agentOperations, taskDispatches, tasks, taskTopics } from '@/database/schemas';
import { getServerDB } from '@/database/server';
import { TaskLifecycleService } from '@/server/services/taskLifecycle';

const log = debug('orvilo-server:workflows:task:on-topic-complete');

export interface OnTopicCompletePayload {
  dispatchFence?: number;
  dispatchId?: string;
  errorMessage?: string;
  /** Structured terminal error type (e.g. `InsufficientBudgetForModel`). Spread
   *  onto the webhook body from the completion lifecycle event (no eventFields
   *  filter), used to pick the error brief's remedy action. */
  errorType?: string;
  executionGeneration?: number;
  hookId?: string;
  hookType?: string;
  lastAssistantContent?: string;
  operationId: string;
  reason?: string;
  // Static body field set by TaskRunnerService — what triggered the run.
  runTrigger?: TaskRunTrigger;
  taskId: string;
  taskIdentifier: string;
  topicId?: string;
  userId: string;
}

export async function onTopicComplete(c: Context) {
  try {
    const body = (await c.req.json()) as OnTopicCompletePayload;
    const {
      errorMessage,
      errorType,
      dispatchFence,
      dispatchId,
      executionGeneration,
      lastAssistantContent,
      operationId,
      reason,
      runTrigger,
      taskId,
      taskIdentifier,
      topicId,
      userId,
    } = body;

    if (!taskId || !userId || !taskIdentifier || !operationId || !topicId) {
      return c.json({ error: 'Missing required fields' }, 400);
    }
    const normalizedReason = reason === 'max_steps' || reason === 'cost_limit' ? 'done' : reason;
    if (
      typeof normalizedReason !== 'string' ||
      !['done', 'error', 'interrupted'].includes(normalizedReason)
    ) {
      return c.json({ error: 'Unsupported task completion reason' }, 400);
    }
    const hasAnyDispatchClaim =
      dispatchId !== undefined || dispatchFence !== undefined || executionGeneration !== undefined;
    const hasCompleteDispatchClaim =
      Boolean(dispatchId) && dispatchFence !== undefined && executionGeneration !== undefined;
    if (hasAnyDispatchClaim && !hasCompleteDispatchClaim) {
      return c.json({ error: 'Incomplete dispatch claim' }, 400);
    }

    log(
      'Received: taskId=%s topicId=%s reason=%s operationId=%s',
      taskId,
      topicId,
      reason,
      operationId,
    );

    const db = await getServerDB();
    // Resolve the authenticated callback through its durable operation. The
    // executor may differ from the task creator in a shared workspace, and a
    // request body must not be allowed to silently select another task/topic.
    const [operation] = await db
      .select({
        taskId: agentOperations.taskId,
        topicId: agentOperations.topicId,
        userId: agentOperations.userId,
        workspaceId: agentOperations.workspaceId,
        status: agentOperations.status,
      })
      .from(agentOperations)
      .where(eq(agentOperations.id, operationId))
      .limit(1);
    if (
      !operation ||
      operation.taskId !== taskId ||
      operation.userId !== userId ||
      operation.topicId !== topicId ||
      operation.status !== normalizedReason
    ) {
      return c.json({ error: 'Operation does not match the task callback' }, 409);
    }

    const [taskRow] = await db
      .select({
        currentTopicId: tasks.currentTopicId,
        identifier: tasks.identifier,
        status: tasks.status,
        workspaceId: tasks.workspaceId,
      })
      .from(tasks)
      .where(eq(tasks.id, operation.taskId))
      .limit(1);
    if (!taskRow || taskRow.workspaceId !== operation.workspaceId) {
      return c.json({ error: 'Task workspace does not match the operation' }, 409);
    }

    if (hasCompleteDispatchClaim) {
      const [dispatch] = await db
        .select({ id: taskDispatches.id })
        .from(taskDispatches)
        .where(
          and(
            eq(taskDispatches.taskId, taskId),
            eq(taskDispatches.id, dispatchId!),
            eq(taskDispatches.fence, dispatchFence!),
            eq(taskDispatches.generation, executionGeneration!),
            eq(taskDispatches.operationId, operationId),
          ),
        )
        .limit(1);
      if (!dispatch) return c.json({ error: 'Task dispatch claim does not match this run' }, 409);
    }

    // A very fast operation can publish its durable QStash callback before the
    // dispatcher has registered task_topics/currentTopicId. Returning success
    // there loses the only terminal delivery. Ask QStash to retry while this is
    // still the active unregistered generation; acknowledge genuinely stale
    // callbacks so they do not retry forever.
    const [registeredTopic] = await db
      .select({ operationId: taskTopics.operationId })
      .from(taskTopics)
      .where(and(eq(taskTopics.taskId, taskId), eq(taskTopics.topicId, topicId)))
      .limit(1);
    if (!registeredTopic) {
      if (
        taskRow.status === 'running' &&
        (!taskRow.currentTopicId || taskRow.currentTopicId === topicId)
      ) {
        return c.json({ error: 'Task run registration is still in progress' }, 503);
      }
      return c.json({ ignored: true, success: true });
    }
    if (registeredTopic.operationId !== operationId || taskRow.currentTopicId !== topicId) {
      return c.json({ ignored: true, success: true });
    }

    const wsId = operation.workspaceId ?? undefined;
    const taskLifecycle = new TaskLifecycleService(db, operation.userId, wsId);

    await taskLifecycle.onTopicComplete({
      errorCode: errorType,
      errorMessage,
      dispatchFence,
      dispatchId,
      executionGeneration,
      lastAssistantContent,
      operationId,
      reason: normalizedReason,
      runTrigger,
      taskId,
      taskIdentifier: taskRow.identifier,
      topicId,
    });

    return c.json({ success: true });
  } catch (error) {
    console.error('[task/on-topic-complete] Error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
}
