import { parseReferTopicTags } from '@orvilo/context-engine';
import { TRPCError } from '@trpc/server';

import { AgentOperationModel } from '@/database/models/agentOperation';
import { MessageModel } from '@/database/models/message';
import { ProjectModel } from '@/database/models/project';
import { TaskModel } from '@/database/models/task';
import { TaskTopicModel } from '@/database/models/taskTopic';
import { TopicModel } from '@/database/models/topic';
import type { OrviloDatabase } from '@/database/type';
import type { HeteroOperationJwtClaims } from '@/libs/trpc/utils/internalJwt';
import { assertCanViewTopicTargets } from '@/server/routers/lambda/_helpers/conversationResourceGuard';

import { resolveActiveHeteroOperationPrincipal } from './operationPrincipal';

/** The builtin context reader and native transcript reader share the source-channel ceiling. */
export const resolveReadableTopicReference = async (params: {
  db: OrviloDatabase;
  sourceTopicId?: string;
  topicId: string;
  userId: string;
  workspaceId?: string;
}) => {
  const { db, sourceTopicId, topicId, userId, workspaceId } = params;
  const topicModel = new TopicModel(db, userId, workspaceId);
  const source = sourceTopicId ? await topicModel.findOwnTopicById(sourceTopicId) : null;
  if (sourceTopicId && !source) return { error: 'Source conversation is unavailable.' };
  const issue = await new TaskTopicModel(db, userId, workspaceId).findIssueTopicById(topicId);
  if (
    source?.trigger === 'slack' &&
    (!workspaceId || !issue || issue.workspaceId !== workspaceId)
  ) {
    return { error: 'Slack references require a readable Issue session in this workspace.' };
  }
  if (issue) {
    const task = await new TaskModel(db, userId, workspaceId).findById(issue.taskId);
    if (
      !task ||
      (source?.trigger === 'slack' && task.workspaceId !== workspaceId) ||
      (task.projectId &&
        !(await new ProjectModel(db, userId, workspaceId).findById(task.projectId)))
    )
      return { error: 'Issue session is not readable.' };
  }
  await assertCanViewTopicTargets({ db, userId, workspaceId }, [topicId]);
  const topic = await topicModel.findOwnTopicById(topicId);
  return {
    topic: source?.trigger === 'slack' && topic?.workspaceId !== workspaceId ? null : topic,
  };
};

/** Reads live rows only for genuine user references on this operation's current conversation branch. */
export const getOperationReferencedTopicTranscript = async (params: {
  claims: HeteroOperationJwtClaims;
  db: OrviloDatabase;
  includeMessages: boolean;
  limit: number;
  offset: number;
  operationId: string;
  topicId: string;
  workspaceId?: string;
}) => {
  const { claims, db, includeMessages, limit, offset, operationId, topicId } = params;
  const principal = await resolveActiveHeteroOperationPrincipal({
    capability: 'topic:reference:read',
    claims,
    db,
    operationId,
  });
  if (params.workspaceId !== principal.workspaceId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Operation workspace does not match the request',
    });
  }
  const { userId, workspaceId } = principal;
  const operation = await new AgentOperationModel(db, userId, workspaceId).findById(operationId);
  const sourceMessageId = operation?.appContext?.sourceMessageId;
  if (!operation?.topicId || !sourceMessageId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Operation has no user conversation anchor',
    });
  }
  const messageModel = new MessageModel(db, userId, workspaceId);
  const anchor = await messageModel.findById(sourceMessageId);
  if (
    !anchor ||
    anchor.role !== 'user' ||
    anchor.topicId !== operation.topicId ||
    (anchor.threadId ?? null) !== (operation.threadId ?? null)
  )
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Operation user conversation anchor is unavailable',
    });
  const source = await new TopicModel(db, userId, workspaceId).findOwnTopicById(operation.topicId);
  if (!source)
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Source conversation is unavailable' });
  await assertCanViewTopicTargets({ db, userId, workspaceId }, [source.id]);

  const tree = await messageModel.queryTopicMessageTree({
    threadId: operation.threadId,
    topicId: operation.topicId,
  });
  const parents = new Map(tree.map((row) => [row.id, row.parentId]));
  const ancestors = new Set<string>();
  let cursor: string | null = anchor.id;
  while (cursor && parents.has(cursor)) {
    if (ancestors.has(cursor))
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Invalid conversation branch' });
    ancestors.add(cursor);
    cursor = parents.get(cursor) ?? null;
  }
  const context = await messageModel.queryByIds([...ancestors]);
  const references = parseReferTopicTags(context.filter((message) => message.role === 'user'));
  if (!references.some((reference) => reference.topicId === topicId)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Topic was not explicitly referenced in this conversation',
    });
  }
  const readable = await resolveReadableTopicReference({
    db,
    sourceTopicId: source.id,
    topicId,
    userId,
    workspaceId,
  });
  if (readable.error) throw new TRPCError({ code: 'FORBIDDEN', message: readable.error });
  const topic = readable.topic;
  if (!topic) throw new TRPCError({ code: 'NOT_FOUND', message: 'Topic not found' });
  if (!includeMessages) return { items: [], topic, total: null };
  return { ...(await messageModel.queryTopicTranscript({ limit, offset, topicId })), topic };
};
