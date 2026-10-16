import {
  type AgentInterventionInteractionKind,
  type AgentInterventionProvider,
  type AgentInterventionRenderArguments,
  type AgentInterventionRenderQuestion,
  sanitizeAgentInterventionRequestForReview,
} from '@orvilo/agent-gateway-client';
import { isRecord } from '@orvilo/utils/object';
import { TRPCError } from '@trpc/server';
import { and, eq, isNull, sql } from 'drizzle-orm';

import {
  agentOperations,
  messagePlugins,
  messages,
  tasks,
  taskTopics,
  topics,
} from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import { buildTaskReadableWhere } from '@/database/utils/taskTeamReadable';
import { buildTopicReadableWhere } from '@/database/utils/topicReadable';
import {
  assertCanUseOperationAgent,
  assertPendingNativeInterventionCard,
} from '@/server/routers/lambda/_helpers/nativeInterventionInput';

export interface SlackNativeReplyScope {
  /** Channel Agent recorded on the server-written Issue origin. */
  agentId: string;
  db: OrviloDatabase;
  /** Server-written Issue intake origin for this Slack thread. */
  sourceTopicId: string;
  /** Exact Issue Run topic from the server-owned Slack thread binding. */
  topicId?: string;
  userId: string;
  workspaceId: string;
}

export interface PendingSlackNativeReply {
  deadline: number;
  interactionKind: AgentInterventionInteractionKind;
  operationId: string;
  options?: Array<{ description?: string; id: string; label: string }>;
  prompt: string;
  questions: AgentInterventionRenderQuestion[];
  taskId: string;
  toolCallId: string;
  toolMessageId: string;
  topicId: string;
  windowId?: string;
}

/** A thread binding locates a Run; current Issue/Project/Agent access authorizes the actor. */
export const resolvePendingSlackReply = async (
  scope: SlackNativeReplyScope,
): Promise<PendingSlackNativeReply | null> => {
  const { agentId, db, sourceTopicId, topicId, userId, workspaceId } = scope;
  if (!sourceTopicId.trim()) return null;
  const runs = await db
    .select({ operationId: agentOperations.id, taskId: tasks.id, runTopicId: topics.id })
    .from(taskTopics)
    .innerJoin(tasks, eq(tasks.id, taskTopics.taskId))
    .innerJoin(topics, eq(topics.id, taskTopics.topicId))
    .innerJoin(agentOperations, eq(agentOperations.id, taskTopics.operationId))
    .where(
      and(
        topicId ? eq(taskTopics.topicId, topicId) : undefined,
        sql`${tasks.context}->'origin'->>'topicId' = ${sourceTopicId}`,
        eq(taskTopics.workspaceId, workspaceId),
        eq(tasks.workspaceId, workspaceId),
        eq(topics.workspaceId, workspaceId),
        eq(agentOperations.workspaceId, workspaceId),
        eq(agentOperations.topicId, topics.id),
        sql`${tasks.context}->'origin'->>'agentId' = ${agentId}`,
        eq(tasks.currentTopicId, taskTopics.topicId),
        isNull(topics.senderId),
        sql`${tasks.isDeleted} IS NOT TRUE`,
        buildTaskReadableWhere(db, { userId, workspaceId }),
        buildTopicReadableWhere(db, { userId, workspaceId }),
      ),
    )
    .limit(2);
  if (runs.length !== 1) return null;
  const { operationId, taskId, runTopicId } = runs[0];
  const operation = await assertCanUseOperationAgent({
    db,
    operationId,
    topicId: runTopicId,
    userId,
    workspaceId,
  });
  if (!['running', 'waiting_for_human'].includes(operation.status)) return null;

  const cards = await db
    .select({ toolCallId: messagePlugins.toolCallId, toolMessageId: messagePlugins.id })
    .from(messagePlugins)
    .innerJoin(messages, eq(messages.id, messagePlugins.id))
    .where(
      and(
        eq(messages.topicId, runTopicId),
        eq(messages.userId, operation.userId),
        eq(messagePlugins.userId, operation.userId),
        eq(messages.role, 'tool'),
        sql`${messagePlugins.intervention}->>'operationId' = ${operationId}`,
        sql`${messagePlugins.intervention}->>'status' = 'pending'`,
      ),
    )
    .limit(2);
  // Multiple blocked tools need an explicit selection in Orvilo, never a guessed newest card.
  if (cards.length !== 1 || !cards[0].toolCallId) return null;
  const { toolCallId, toolMessageId } = cards[0];
  const source = await assertPendingNativeInterventionCard({
    db,
    operation,
    operationId,
    toolCallId,
    toolMessageId,
    userId,
    workspaceId,
  });
  const native =
    isRecord(source.state) && isRecord(source.state.heterogeneousIntervention)
      ? source.state.heterogeneousIntervention
      : undefined;
  if (!native || source.apiName !== 'askUserQuestion' || typeof native.deadline !== 'number')
    return null;
  const request = sanitizeAgentInterventionRequestForReview({
    apiName: source.apiName,
    arguments: source.arguments ?? '',
    deadline: native.deadline,
    identifier: source.identifier ?? '',
    interactionKind: native.interactionKind as AgentInterventionInteractionKind,
    provider: native.provider as AgentInterventionProvider,
    toolCallId,
    windowId: typeof native.windowId === 'string' ? native.windowId : undefined,
  });
  if (!request || request.deadline <= Date.now()) return null;
  const { questions } = JSON.parse(request.arguments) as AgentInterventionRenderArguments;
  return {
    ...(request.windowId ? { windowId: request.windowId } : {}),
    deadline: request.deadline,
    interactionKind: request.interactionKind!,
    operationId,
    ...(request.interactionKind !== 'question'
      ? {
          options: questions[0].options.map((option) => ({ ...option, id: option.id! })),
        }
      : {}),
    prompt: questions.map((question) => question.question).join('\n'),
    questions,
    taskId,
    toolCallId,
    toolMessageId,
    topicId: runTopicId,
  };
};

export const submitPendingSlackReply = async (
  input: SlackNativeReplyScope & {
    answers?: Record<string, string | string[]>;
    windowId?: string;
    operationId: string;
    optionId?: string;
    resolutionRequestId: string;
    toolCallId: string;
    toolMessageId: string;
  },
) => {
  const pending = await resolvePendingSlackReply(input);
  if (
    !pending ||
    pending.operationId !== input.operationId ||
    pending.toolCallId !== input.toolCallId ||
    pending.toolMessageId !== input.toolMessageId ||
    pending.windowId !== input.windowId
  ) {
    throw new TRPCError({ code: 'CONFLICT', message: 'This Agent question is no longer pending.' });
  }
  let result: Record<string, string | string[]>;
  if (pending.interactionKind !== 'question') {
    if (
      !input.optionId ||
      input.answers ||
      !pending.options?.some((option) => option.id === input.optionId)
    ) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Select an exact native option.' });
    }
    result = { [pending.questions[0].question]: input.optionId };
  } else {
    const answers = input.answers;
    if (
      !answers ||
      input.optionId ||
      Object.keys(answers).length !== pending.questions.length ||
      pending.questions.some((question) => {
        const answer = answers[question.question];
        return question.multiSelect
          ? !Array.isArray(answer) ||
              answer.length === 0 ||
              answer.some((value) => typeof value !== 'string' || !value || value.length > 4000)
          : typeof answer !== 'string' || !answer || answer.length > 4000;
      })
    ) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Answer every native question.' });
    }
    result = answers;
  }
  // Use the same authenticated native endpoint as Orvilo. It revalidates the
  // pending card and records the real replying actor while retaining Run owner.
  const { aiAgentRouter } = await import('@/server/routers/lambda/aiAgent');
  return aiAgentRouter
    .createCaller({ userId: input.userId, workspaceId: input.workspaceId })
    .submitHeteroIntervention({
      operationId: pending.operationId,
      resolutionRequestId: input.resolutionRequestId,
      result,
      toolCallId: pending.toolCallId,
      toolMessageId: pending.toolMessageId,
      windowId: pending.windowId,
    });
};
