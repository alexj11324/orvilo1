// @vitest-environment node
import type { OrviloDatabase } from '@orvilo/database';
import {
  agentOperations,
  agents,
  messages,
  resourcePermissions,
  tasks,
  taskTopics,
  threads,
  topics,
  users,
  workspaceMembers,
  workspaces,
} from '@orvilo/database/schemas';
import { getTestDB } from '@orvilo/database/test-utils';
import { eq, inArray } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HeteroOperationJwtClaims } from '@/libs/trpc/utils/internalJwt';

import { topicRouter } from '../../topic';

let db: OrviloDatabase;
vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: () => db }));
vi.mock('@/server/services/file', () => ({ FileService: class {} }));

describe('native operation explicit topic references', () => {
  const owner = 'native-reference-owner';
  const other = 'native-reference-other';
  const operationId = 'native-reference-operation';
  let workspaceId: string;
  let agentId: string;
  let sourceId: string;
  let consumerId: string;
  let anchorId: string;
  let claims: HeteroOperationJwtClaims;

  const insertMessage = async (values: Partial<typeof messages.$inferInsert>) => {
    const [message] = await db
      .insert(messages)
      .values({
        agentId,
        content: 'User turn',
        role: 'user',
        topicId: consumerId,
        userId: owner,
        workspaceId,
        ...values,
      })
      .returning({ id: messages.id });
    return message;
  };
  const caller = (token = claims, selector = workspaceId) =>
    topicRouter.createCaller({
      oidcAuth: { ...token, payload: token },
      userId: token.sub,
      workspaceId: selector,
    });
  const read = (
    input: { includeMessages?: boolean; limit?: number; offset?: number; topicId?: string } = {},
  ) =>
    caller().getReferencedTopicTranscript({
      operationId: claims.operation_id,
      topicId: sourceId,
      ...input,
    });

  beforeEach(async () => {
    db = await getTestDB();
    await db.insert(users).values([{ id: owner }, { id: other }]);
    const [workspace] = await db
      .insert(workspaces)
      .values({
        name: 'Native reference',
        primaryOwnerId: owner,
        slug: 'native-reference',
      })
      .returning();
    workspaceId = workspace.id;
    await db.insert(workspaceMembers).values([
      { role: 'owner', userId: owner, workspaceId },
      { role: 'member', userId: other, workspaceId },
    ]);
    const [agent] = await db
      .insert(agents)
      .values({
        title: 'Reference agent',
        userId: owner,
        visibility: 'public',
        workspaceId,
      })
      .returning();
    agentId = agent.id;
    await db.insert(resourcePermissions).values({
      accessLevel: 'use',
      createdBy: owner,
      resourceId: agentId,
      resourceType: 'agent',
      userId: owner,
      workspaceId,
    });
    const [source, consumer] = await db
      .insert(topics)
      .values([
        { agentId, title: 'Private source', userId: owner, workspaceId },
        { agentId, title: 'Consumer', userId: owner, workspaceId },
      ])
      .returning();
    sourceId = source.id;
    consumerId = consumer.id;
    await insertMessage({ content: 'Source V1', topicId: sourceId });
    const anchor = await insertMessage({
      content: `<refer_topic id="${sourceId}" name="Private source" />`,
    });
    anchorId = anchor.id;
    await db.insert(agentOperations).values({
      appContext: { sourceMessageId: anchorId },
      id: operationId,
      status: 'running',
      topicId: consumerId,
      userId: owner,
      workspaceId,
    });
    claims = {
      aud: 'urn:orvilo:hetero-operation',
      capabilities: ['hetero:ingest', 'topic:reference:read'],
      exp: 9999999999,
      iat: 1,
      iss: 'urn:orvilo:internal',
      jti: 'reference-jti',
      operation_id: operationId,
      purpose: 'hetero-operation',
      sub: owner,
      workspace_id: workspaceId,
    };
  });
  afterEach(async () => {
    await db.delete(tasks).where(eq(tasks.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(inArray(users.id, [owner, other]));
  });

  it('reads the authorized live transcript through the strict operation path while normal endpoints reject it', async () => {
    await expect(caller().getTopicTranscript({ topicId: sourceId })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(await read()).toMatchObject({ items: [{ content: 'Source V1' }], total: 1 });
    await expect(caller().getTopics({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rereads updated source content in a later turn using an earlier real user reference', async () => {
    expect(await read()).toMatchObject({ total: 1 });
    const answer = await insertMessage({
      content: 'Earlier answer',
      parentId: anchorId,
      role: 'assistant',
    });
    const later = await insertMessage({ content: 'Read that source again', parentId: answer.id });
    await db
      .update(agentOperations)
      .set({ status: 'done' })
      .where(eq(agentOperations.id, operationId));
    const laterOperation = 'native-reference-later-operation';
    await db.insert(agentOperations).values({
      appContext: { sourceMessageId: later.id },
      id: laterOperation,
      status: 'running',
      topicId: consumerId,
      userId: owner,
      workspaceId,
    });
    claims = { ...claims, operation_id: laterOperation };
    await insertMessage({ content: 'Source V2', parentId: null, topicId: sourceId });
    const result = await read();
    expect(result.total).toBe(2);
    expect(result.items.map((message) => message.content)).toEqual(['Source V1', 'Source V2']);
    expect(await read({ limit: 1, offset: 1 })).toMatchObject({
      items: [{ content: 'Source V2' }],
      total: 2,
    });
  });

  it('authorizes metadata-only and paginated reads against the same explicit-reference boundary', async () => {
    expect(await read({ includeMessages: false })).toMatchObject({
      items: [],
      topic: { id: sourceId },
      total: null,
    });
    for (const input of [{ includeMessages: false }, { limit: 1, offset: 1 }]) {
      await expect(read({ ...input, topicId: consumerId })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    }
  });

  it.each(['assistant', 'tool', 'future', 'sibling'] as const)(
    'does not grant a reference found only in a %s message',
    async (where) => {
      await db
        .update(messages)
        .set({ content: 'No explicit reference' })
        .where(eq(messages.id, anchorId));
      const reference = await insertMessage({
        content: `<refer_topic id="${sourceId}" />`,
        parentId: where === 'future' ? anchorId : null,
        role: where === 'assistant' || where === 'tool' ? where : 'user',
      });
      if (where === 'assistant' || where === 'tool') {
        await db.update(messages).set({ parentId: reference.id }).where(eq(messages.id, anchorId));
      }
      await expect(read()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    },
  );

  it.each(['missing', 'other-topic', 'assistant'] as const)(
    'rejects a %s durable source anchor',
    async (kind) => {
      if (kind === 'missing')
        await db
          .update(agentOperations)
          .set({ appContext: {} })
          .where(eq(agentOperations.id, operationId));
      else
        await db
          .update(messages)
          .set(kind === 'other-topic' ? { topicId: sourceId } : { role: 'assistant' })
          .where(eq(messages.id, anchorId));
      await expect(read()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    },
  );

  it('does not grant references from another thread', async () => {
    await db
      .update(messages)
      .set({ content: 'No explicit reference' })
      .where(eq(messages.id, anchorId));
    const [thread] = await db
      .insert(threads)
      .values({
        topicId: consumerId,
        userId: owner,
        workspaceId,
        sourceMessageId: anchorId,
        type: 'standalone',
      })
      .returning({ id: threads.id });
    await insertMessage({ content: `<refer_topic id="${sourceId}" />`, threadId: thread.id });
    await expect(read()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rechecks current conversation view permission after a previously authorized read', async () => {
    const [privateAgent] = await db
      .insert(agents)
      .values({
        title: 'Source agent',
        userId: other,
        visibility: 'public',
        workspaceId,
      })
      .returning();
    await db.update(topics).set({ agentId: privateAgent.id }).where(eq(topics.id, sourceId));
    expect(await read()).toMatchObject({ total: 1 });
    await db.update(agents).set({ visibility: 'private' }).where(eq(agents.id, privateAgent.id));
    await expect(read()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('requires a strict token and the matching operation ID', async () => {
    await expect(
      caller().getReferencedTopicTranscript({ operationId: 'wrong-operation', topicId: sourceId }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const legacy = topicRouter.createCaller({
      oidcAuth: { purpose: 'hetero-operation', sub: owner, payload: {} },
      userId: owner,
      workspaceId,
    });
    await expect(
      legacy.getReferencedTopicTranscript({ operationId, topicId: sourceId }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects a token missing the reference capability', async () => {
    await expect(
      caller({ ...claims, capabilities: ['hetero:ingest'] }).getReferencedTopicTranscript({
        operationId,
        topicId: sourceId,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects an ended operation and stale owner or workspace bindings', async () => {
    await db
      .update(agentOperations)
      .set({ status: 'done' })
      .where(eq(agentOperations.id, operationId));
    await expect(read()).rejects.toMatchObject({ code: 'CONFLICT' });
    await db
      .update(agentOperations)
      .set({ status: 'running', userId: other })
      .where(eq(agentOperations.id, operationId));
    await expect(read()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await db
      .update(agentOperations)
      .set({ userId: owner })
      .where(eq(agentOperations.id, operationId));
    await expect(
      caller(claims, 'different-workspace').getReferencedTopicTranscript({
        operationId,
        topicId: sourceId,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      caller({ ...claims, workspace_id: 'different-workspace' }).getReferencedTopicTranscript({
        operationId,
        topicId: sourceId,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rechecks current membership and source permission on every read', async () => {
    expect(await read()).toMatchObject({ total: 1 });
    await db.delete(workspaceMembers).where(eq(workspaceMembers.userId, owner));
    await expect(read()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects unreadable and agent-share visitor source topics', async () => {
    await db.update(topics).set({ userId: other }).where(eq(topics.id, sourceId));
    await expect(read()).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await db
      .update(topics)
      .set({ senderId: 'visitor', userId: owner })
      .where(eq(topics.id, sourceId));
    await expect(read()).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('keeps Slack private references closed while allowing a readable same-workspace Issue session', async () => {
    await db.update(topics).set({ trigger: 'slack' }).where(eq(topics.id, consumerId));
    await expect(read()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const [task] = await db
      .insert(tasks)
      .values({
        createdByUserId: owner,
        identifier: 'REF-1',
        instruction: 'Readable Issue',
        seq: 1,
        workspaceId,
      })
      .returning();
    await db
      .insert(taskTopics)
      .values({ seq: 1, taskId: task.id, topicId: sourceId, userId: owner, workspaceId });
    expect(await read()).toMatchObject({ total: 1 });
  });
});
