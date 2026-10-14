import { TRPCError } from '@trpc/server';
import { and, eq, isNull } from 'drizzle-orm';

import { agentOperations, messagePlugins, messages, tasks, taskTopics } from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';

import { assertCanUseMessageTargets } from './conversationResourceGuard';
import { assertIssueExecutionInput } from './issueExecutionInput';
import { assertCanUseWorkspaceAgent } from './workspaceAgentGuard';

/** Issue input follows the current assignee; private Chat input stays owner-scoped. */
export const assertCanUseOperationAgent = async (params: {
  db: OrviloDatabase;
  operationId: string;
  topicId?: string;
  userId: string;
  workspaceId?: string | null;
}) => {
  const { db, operationId, topicId, userId, workspaceId } = params;
  const [row] = await db
    .select({
      agentId: agentOperations.agentId,
      groupId: agentOperations.chatGroupId,
      status: agentOperations.status,
      topicId: agentOperations.topicId,
      userId: agentOperations.userId,
      workspaceId: agentOperations.workspaceId,
    })
    .from(agentOperations)
    .where(eq(agentOperations.id, operationId))
    .limit(1);
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Operation not found' });
  if (row.workspaceId !== (workspaceId ?? null)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Operation is outside the caller scope' });
  }
  if (topicId && row.topicId !== topicId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Operation does not belong to this topic' });
  }
  const [issue] =
    row.topicId && row.workspaceId
      ? await db
          .select({ assigneeAgentId: tasks.assigneeAgentId, assigneeUserId: tasks.assigneeUserId })
          .from(taskTopics)
          .innerJoin(tasks, eq(tasks.id, taskTopics.taskId))
          .where(
            and(
              eq(taskTopics.topicId, row.topicId),
              eq(taskTopics.workspaceId, row.workspaceId),
              eq(tasks.workspaceId, row.workspaceId),
              eq(tasks.currentTopicId, row.topicId),
              eq(taskTopics.operationId, operationId),
            ),
          )
          .limit(1)
      : [];
  if (issue) {
    await assertIssueExecutionInput({ serverDB: db, userId, workspaceId }, issue, row.agentId);
  } else if (row.userId !== userId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Operation is outside the caller scope' });
  }
  if (row.workspaceId) {
    if (!row.agentId)
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Operation has no authorized Agent' });
    await assertCanUseWorkspaceAgent({
      agentId: row.agentId,
      db,
      groupId: row.groupId,
      userId,
      workspaceId: row.workspaceId,
    });
  }
  return row;
};

/** Server-only operation authorization must precede loading the native card. */
export const assertPendingNativeInterventionCard = async (params: {
  db: OrviloDatabase;
  operation: Awaited<ReturnType<typeof assertCanUseOperationAgent>>;
  operationId: string;
  toolCallId: string;
  toolMessageId: string;
  userId: string;
  workspaceId?: string | null;
}) => {
  const { db, operation, operationId, toolCallId, toolMessageId, userId, workspaceId } = params;
  await assertCanUseMessageTargets({ db, userId, workspaceId }, [toolMessageId]);
  const [source] = await db
    .select({
      apiName: messagePlugins.apiName,
      arguments: messagePlugins.arguments,
      identifier: messagePlugins.identifier,
      intervention: messagePlugins.intervention,
      state: messagePlugins.state,
    })
    .from(messagePlugins)
    .innerJoin(messages, eq(messages.id, messagePlugins.id))
    .where(
      and(
        eq(messagePlugins.id, toolMessageId),
        eq(messagePlugins.userId, operation.userId),
        eq(messages.userId, operation.userId),
        eq(messages.role, 'tool'),
        operation.topicId ? eq(messages.topicId, operation.topicId) : isNull(messages.topicId),
        eq(messagePlugins.toolCallId, toolCallId),
      ),
    )
    .limit(1);
  if (
    !['running', 'waiting_for_human'].includes(operation.status) ||
    source?.intervention?.operationId !== operationId ||
    source.intervention.status !== 'pending'
  ) {
    throw new TRPCError({ code: 'CONFLICT', message: 'This Agent question is no longer pending.' });
  }
  return source;
};
