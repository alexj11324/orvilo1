import type { AgentState } from '@orvilo/agent-runtime';
import debug from 'debug';
import type { Context } from 'hono';

import { getServerDB } from '@/database/core/db-adaptor';
import { AgentOperationModel } from '@/database/models/agentOperation';
import { MessageModel } from '@/database/models/message';
import { ThreadModel } from '@/database/models/thread';
import { createAgentStateManager } from '@/server/modules/AgentExecution/factory';
import {
  completeThreadRun,
  normalizeThreadCompletionReason,
  updateThreadRunProgress,
} from '@/server/services/aiAgent/hooks/threadRunHooks';

const log = debug('orvilo-server:agent:thread-run-callback');

/** Persist isolated-thread progress and completion after a queue worker boundary. */
export async function threadRunCallback(c: Context): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { callbackType, operationId, sourceMessageId, startedAt, threadId, userId, workspaceId } =
    body;
  if (
    (callbackType !== 'step' && callbackType !== 'completion') ||
    typeof operationId !== 'string' ||
    typeof startedAt !== 'string' ||
    typeof threadId !== 'string' ||
    typeof userId !== 'string' ||
    (workspaceId !== undefined && typeof workspaceId !== 'string')
  ) {
    return c.json(
      {
        error:
          'Missing or invalid fields: callbackType, operationId, startedAt, threadId, userId, workspaceId',
      },
      400,
    );
  }
  if (callbackType === 'completion' && typeof sourceMessageId !== 'string') {
    return c.json({ error: 'Missing required field: sourceMessageId' }, 400);
  }

  try {
    const db = await getServerDB();
    const operationModel = new AgentOperationModel(db, userId, workspaceId as string | undefined);
    const operation = await operationModel.findById(operationId);
    if (!operation || operation.threadId !== threadId) {
      return c.json({ error: 'Invalid operation or unauthorized' }, 401);
    }

    const threadModel = new ThreadModel(db, userId, workspaceId as string | undefined);
    const messageModel = new MessageModel(
      db,
      userId,
      workspaceId as string | undefined,
      undefined,
      {
        includeShareVisitor: true,
      },
    );
    const thread = await threadModel.findById(threadId);
    if (!thread || (callbackType === 'completion' && thread.sourceMessageId !== sourceMessageId)) {
      return c.json({ error: 'Invalid thread callback target' }, 401);
    }

    let state: AgentState | null = null;
    try {
      state = (await createAgentStateManager().loadAgentState(operationId)) as AgentState | null;
    } catch (error) {
      log(
        'Redis state unavailable for operation %s, using durable summary: %O',
        operationId,
        error,
      );
    }

    const durableState = {
      ...state,
      cost: state?.cost ?? operation.cost,
      error: state?.error ?? operation.error,
      operationId,
      usage: state?.usage ?? operation.usage,
    } as AgentState;

    if (callbackType === 'step') {
      await updateThreadRunProgress(threadModel, threadId, startedAt, durableState);
    } else {
      const reason = normalizeThreadCompletionReason(
        operation.completionReason ?? (typeof body.reason === 'string' ? body.reason : undefined),
      );
      const [lastAssistantMessage, totalMessages] = await Promise.all([
        operation.topicId
          ? messageModel.findLatestAssistantByOperationId({
              operationId,
              topicId: operation.topicId,
            })
          : undefined,
        messageModel.countByThreadId(threadId),
      ]);
      durableState.messages = lastAssistantMessage ? [lastAssistantMessage as never] : [];
      await completeThreadRun(threadModel, messageModel, {
        finalState: durableState,
        reason,
        sourceMessageId: sourceMessageId as string,
        startedAt,
        threadId,
        totalMessages,
        totalToolCalls: operation.toolCalls ?? undefined,
      });
    }

    log('%s persisted for operation %s thread %s', callbackType, operationId, threadId);
    return c.json({ operationId, success: true, threadId });
  } catch (error) {
    console.error('thread-run-callback error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
}
