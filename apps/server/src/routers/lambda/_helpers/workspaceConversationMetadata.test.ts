// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import { MessageModel } from '@/database/models/message';
import { TaskTopicModel } from '@/database/models/taskTopic';
import {
  agents,
  messages,
  resourcePermissions,
  tasks,
  taskTopics,
  topics,
  users,
  workspaceMembers,
  workspaces,
} from '@/database/schemas';

import { messageRouter } from '../message';
import { taskRouter } from '../task';
import { getResourceConfigAccess } from './resourceConfigGuard';
import { projectWorkspaceConversationMetadata } from './workspaceConversationMetadata';

vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: vi.fn(() => db) }));
vi.mock('@/server/services/file', () => ({
  FileService: vi.fn(function () {
    return { getFileAccessUrl: vi.fn(({ url }: { url: string }) => url) };
  }),
}));
const db = await getTestDB();
const owner = 'conversation-metadata-owner';
const member = 'conversation-metadata-member';
const admin = 'conversation-metadata-admin';
const workspaceId = 'conversation-metadata-workspace';
const otherWorkspaceId = 'conversation-metadata-other-workspace';
const agentId = 'conversation-metadata-agent';
const topicId = 'conversation-metadata-topic';
const taskId = 'task_conversation_metadata';
const runtimeMetadata = {
  workingDirectory: 'fixture-private-directory',
  workingDirectoryConfig: { custom: 'fixture-private-directory' },
  heteroSessionId: 'fixture-native-session',
  heteroMessageId: 'fixture-native-message',
  heteroSessionIdByWorkingDirectory: { fixture: 'fixture-native-session' },
  heteroSessionBindingKey: 'fixture-binding-key',
  heteroSessionBindingKeyByWorkingDirectory: { fixture: 'fixture-binding-key' },
  executionConfig: { boundDeviceId: 'fixture-device', executionTarget: 'device' },
  boundDeviceId: 'fixture-device',
  bindingRevision: 2,
  model: 'codex',
  provider: 'subscription',
  runningOperation: { operationId: 'fixture-operation' },
  agentHandoffs: [{ at: 'fixture-time', fromAgentId: agentId, toAgentId: agentId }],
};
const cleanup = async () => {
  await db.delete(users).where(eq(users.id, owner));
  await db.delete(users).where(eq(users.id, member));
  await db.delete(users).where(eq(users.id, admin));
};
beforeEach(async () => {
  await cleanup();
  await db.insert(users).values([{ id: owner }, { id: member }, { id: admin }]);
  await db.insert(workspaces).values([
    { id: workspaceId, name: 'Conversation metadata', slug: workspaceId, primaryOwnerId: owner },
    { id: otherWorkspaceId, name: 'Other scope', slug: otherWorkspaceId, primaryOwnerId: owner },
  ]);
  await db.insert(workspaceMembers).values([
    { userId: owner, workspaceId, role: 'owner' },
    { userId: member, workspaceId, role: 'member' },
    { userId: admin, workspaceId, role: 'admin' },
    { userId: member, workspaceId: otherWorkspaceId, role: 'member' },
  ]);
  await db
    .insert(agents)
    .values({ id: agentId, slug: agentId, userId: owner, workspaceId, visibility: 'private' });
  await db.insert(tasks).values({
    id: taskId,
    identifier: 'CM-1',
    seq: 1,
    instruction: 'Issue',
    createdByUserId: owner,
    workspaceId,
    assigneeAgentId: agentId,
    visibility: 'private',
  });
  await db
    .insert(topics)
    .values({ id: topicId, userId: owner, workspaceId, agentId, metadata: runtimeMetadata });
  await db
    .insert(taskTopics)
    .values({ taskId, topicId, userId: owner, workspaceId, seq: 1, visibility: 'private' });
  await db.insert(messages).values({
    id: 'conversation-metadata-message',
    role: 'assistant',
    content: 'Shared conversation answer',
    userId: owner,
    workspaceId,
    agentId,
    topicId,
    metadata: {
      heteroSessionId: 'fixture-native-session',
      heteroMessageId: 'fixture-native-message',
      model: 'codex',
    },
  });
});
afterEach(cleanup);
const ctx = (userId: string) => ({ db, userId, workspaceId });
const expectSafe = (metadata: unknown) => {
  for (const key of Object.keys(runtimeMetadata).filter(
    (key) => !['model', 'provider', 'runningOperation', 'agentHandoffs'].includes(key),
  ))
    expect(metadata).not.toHaveProperty(key);
};

describe('workspace conversation runtime metadata projection', () => {
  it.each([false, true])(
    'shares Issue topic/message contents without config for a member with Use=%s',
    async (grantUse) => {
      if (grantUse) {
        await db.insert(resourcePermissions).values({
          resourceType: 'agent',
          resourceId: agentId,
          userId: member,
          workspaceId,
          accessLevel: 'use',
          createdBy: owner,
        });
        // Starting the run does not make the Use grantee the Agent config owner.
        await db.update(topics).set({ userId: member }).where(eq(topics.id, topicId));
        await db.update(messages).set({ userId: member }).where(eq(messages.topicId, topicId));
        await db.update(taskTopics).set({ userId: member }).where(eq(taskTopics.taskId, taskId));
      }
      expect(await getResourceConfigAccess(ctx(member), 'agent', agentId)).not.toBe('full');
      const topicRows = await new TaskTopicModel(db, member, workspaceId).findWithDetails(taskId);
      expect(topicRows[0]?.metadata).toHaveProperty('workingDirectory');
      const topicDto = await projectWorkspaceConversationMetadata(ctx(member), topicRows);
      expectSafe(topicDto[0]?.metadata);
      expect(topicDto[0]?.metadata).toMatchObject({
        model: 'codex',
        provider: 'subscription',
        runningOperation: { operationId: 'fixture-operation' },
        agentHandoffs: runtimeMetadata.agentHandoffs,
      });
      const messageRows = await new MessageModel(db, member, workspaceId).query({
        topicId,
        skipWorks: true,
      });
      expect(messageRows[0]?.metadata).toHaveProperty('heteroSessionId');
      const messageDto = await projectWorkspaceConversationMetadata(
        ctx(member),
        messageRows,
        topicId,
      );
      expect(messageDto[0]?.content).toBe('Shared conversation answer');
      expect(messageDto[0]?.metadata).not.toHaveProperty('heteroSessionId');
      expect(messageDto[0]?.metadata).not.toHaveProperty('heteroMessageId');
      const rpcContext = { userId: member, jwtPayload: { userId: member }, workspaceId } as never;
      const topicsResponse = await taskRouter.createCaller(rpcContext).getTopics({ id: taskId });
      expectSafe(topicsResponse.data[0]?.metadata);
      const messagesResponse = await messageRouter
        .createCaller(rpcContext)
        .getMessages({ topicId, skipWorks: true });
      expect(messagesResponse[0]?.content).toBe('Shared conversation answer');
      expect(messagesResponse[0]?.metadata).not.toHaveProperty('heteroSessionId');
      expect(messagesResponse[0]?.metadata).not.toHaveProperty('heteroMessageId');
      // Runtime readers still have the original stored data.
      expect(
        (await new TaskTopicModel(db, owner, workspaceId).findWithDetails(taskId))[0]?.metadata,
      ).toEqual(runtimeMetadata);
    },
  );

  it('preserves full runtime metadata for the Agent owner and actual workspace manager', async () => {
    const rows = await new TaskTopicModel(db, owner, workspaceId).findWithDetails(taskId);
    expect(await getResourceConfigAccess(ctx(owner), 'agent', agentId)).toBe('full');
    expect(await projectWorkspaceConversationMetadata(ctx(owner), rows)).toEqual(rows);
    await db.update(agents).set({ visibility: 'public' }).where(eq(agents.id, agentId));
    expect(await getResourceConfigAccess(ctx(admin), 'agent', agentId)).toBe('full');
    expect(await projectWorkspaceConversationMetadata(ctx(admin), rows)).toEqual(rows);
  });

  it('redacts a foreign personal Agent runtime while preserving its actual owner access', async () => {
    await db.update(agents).set({ workspaceId: null }).where(eq(agents.id, agentId));
    const rows = await new TaskTopicModel(db, member, workspaceId).findWithDetails(taskId);
    expectSafe((await projectWorkspaceConversationMetadata(ctx(member), rows))[0]?.metadata);
    expect(await getResourceConfigAccess(ctx(owner), 'agent', agentId)).toBe('full');
    expect(await projectWorkspaceConversationMetadata(ctx(owner), rows)).toEqual(rows);
  });

  it('resolves Agent authority from the actual topic when a message carries no Agent id', async () => {
    const rows = [
      {
        id: 'user-message',
        topicId,
        content: 'Question',
        metadata: { heteroSessionId: 'fixture-native-session' },
      },
    ];
    expect(
      (await projectWorkspaceConversationMetadata(ctx(member), rows))[0]?.metadata,
    ).not.toHaveProperty('heteroSessionId');
    expect(await projectWorkspaceConversationMetadata(ctx(owner), rows)).toEqual(rows);
  });

  it('resolves Task-topic DTO identity from its topic id for actual owner access', async () => {
    const rows = [{ id: topicId, metadata: { heteroSessionId: 'fixture-native-session' } }];
    expect(await projectWorkspaceConversationMetadata(ctx(owner), rows, (row) => row.id)).toEqual(
      rows,
    );
    expect(
      (await projectWorkspaceConversationMetadata(ctx(member), rows, (row) => row.id))[0]?.metadata,
    ).not.toHaveProperty('heteroSessionId');
  });

  it('keeps personal and cross-workspace read scoping', async () => {
    const rows = [
      { id: 'personal-message', agentId, metadata: { heteroSessionId: 'fixture-native-session' } },
    ];
    expect(await projectWorkspaceConversationMetadata({ db, userId: owner }, rows)).toBe(rows);
    expect(await new TaskTopicModel(db, member, otherWorkspaceId).findWithDetails(taskId)).toEqual(
      [],
    );
    expect(
      await new MessageModel(db, member, otherWorkspaceId).query({ topicId, skipWorks: true }),
    ).toEqual([]);
    expect(
      (
        await projectWorkspaceConversationMetadata(
          { db, userId: member, workspaceId: otherWorkspaceId },
          rows,
        )
      )[0]?.metadata,
    ).not.toHaveProperty('heteroSessionId');
  });

  it('checks a nested conversation topic independently from its parent Agent authority', async () => {
    const nestedAgentId = 'conversation-metadata-member-agent';
    const nestedTopicId = 'conversation-metadata-member-topic';
    await db.insert(agents).values({
      id: nestedAgentId,
      slug: nestedAgentId,
      userId: member,
      workspaceId,
      visibility: 'private',
    });
    await db
      .insert(topics)
      .values({ id: nestedTopicId, userId: member, workspaceId, agentId: nestedAgentId });
    const rows = [
      {
        id: 'parent',
        agentId,
        topicId,
        tasks: [
          {
            id: 'nested',
            topicId: nestedTopicId,
            content: 'Shared nested answer',
            metadata: { heteroSessionId: 'fixture-private-nested-session' },
          },
        ],
      },
    ];
    const result = await projectWorkspaceConversationMetadata(ctx(owner), rows);
    expect(result[0]?.tasks[0]?.content).toBe('Shared nested answer');
    expect(result[0]?.tasks[0]?.metadata).not.toHaveProperty('heteroSessionId');
  });

  it('projects generated message groups while preserving tool results, events and questions', async () => {
    const rows = [
      {
        id: 'group',
        agentId,
        children: [
          {
            content: 'Answer',
            metadata: { heteroSessionId: 'fixture-native-session' },
            tools: [
              {
                result: {
                  content: 'pwd output retained',
                  metadata: { heteroSessionId: 'intentional tool output' },
                },
              },
            ],
            council: [
              {
                content: 'Council answer',
                metadata: { heteroMessageId: 'fixture-native-message' },
              },
            ],
          },
        ],
        metadata: { pendingQuestion: 'Which option?', events: [{ content: 'Visible event' }] },
      },
    ];
    const result = await projectWorkspaceConversationMetadata(ctx(member), rows);
    expect(result[0]?.children[0]?.metadata).not.toHaveProperty('heteroSessionId');
    expect(result[0]?.children[0]?.council[0]?.metadata).not.toHaveProperty('heteroMessageId');
    expect(result[0]?.children[0]?.tools).toEqual(rows[0]?.children[0]?.tools);
    expect(result[0]?.metadata).toEqual(rows[0]?.metadata);
  });
});
