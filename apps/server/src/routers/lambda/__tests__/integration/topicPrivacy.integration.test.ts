// @vitest-environment node
import type { OrviloDatabase } from '@orvilo/database';
import {
  agents,
  chatGroups,
  documents,
  messages,
  projects,
  resourcePermissions,
  tasks,
  taskTopics,
  threads,
  topicDocuments,
  topics,
  users,
  workspaceMembers,
  workspaces,
} from '@orvilo/database/schemas';
import { getTestDB } from '@orvilo/database/test-utils';
import { eq, inArray } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageModel } from '@/database/models/message';
import { ThreadModel } from '@/database/models/thread';
import { TopicModel } from '@/database/models/topic';

import { topicRouter } from '../../topic';

let db: OrviloDatabase;
vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: () => db }));
vi.mock('@/server/services/file', () => ({
  FileService: class {
    getFullFileUrl = async () => 'test-file-url';
  },
}));

describe('workspace topic privacy (#784)', () => {
  const creator = 'topic-privacy-creator';
  const member = 'topic-privacy-member';
  const owner = 'topic-privacy-owner';
  let workspaceId: string;
  let agentId: string;

  const caller = (userId: string) =>
    topicRouter.createCaller({ jwtPayload: { userId }, userId, workspaceId });
  const messageModel = (userId: string) => new MessageModel(db, userId, workspaceId);

  const createTopic = async (values: Partial<typeof topics.$inferInsert> = {}) => {
    const [topic] = await db
      .insert(topics)
      .values({ agentId, title: 'Conversation', userId: creator, workspaceId, ...values })
      .returning();
    const [message] = await db
      .insert(messages)
      .values({
        agentId,
        content: `content for ${topic.id}`,
        role: 'user',
        topicId: topic.id,
        userId: creator,
        workspaceId,
      })
      .returning();
    return { message, topic };
  };

  const linkIssue = async (topicId: string, projectId?: string) => {
    const [task] = await db
      .insert(tasks)
      .values({
        createdByUserId: owner,
        identifier: 'PRIV-1',
        instruction: 'Shared Issue',
        projectId,
        seq: 1,
        workspaceId,
      })
      .returning();
    await db.insert(taskTopics).values({
      seq: 1,
      taskId: task.id,
      topicId,
      userId: creator,
      workspaceId,
    });
  };

  beforeEach(async () => {
    db = await getTestDB();
    await db.insert(users).values([creator, member, owner].map((id) => ({ id })));
    const [workspace] = await db
      .insert(workspaces)
      .values({ name: 'Topic privacy', primaryOwnerId: owner, slug: 'topic-privacy-regression' })
      .returning();
    workspaceId = workspace.id;
    await db.insert(workspaceMembers).values([
      { role: 'member', userId: creator, workspaceId },
      { role: 'member', userId: member, workspaceId },
      { role: 'owner', userId: owner, workspaceId },
    ]);
    const [agent] = await db
      .insert(agents)
      .values({
        slug: 'topic-privacy-shared-agent',
        userId: creator,
        visibility: 'public',
        workspaceId,
      })
      .returning();
    agentId = agent.id;
    await db.insert(resourcePermissions).values(
      [creator, member, owner].map((userId) => ({
        accessLevel: 'use' as const,
        createdBy: creator,
        resourceId: agentId,
        resourceType: 'agent' as const,
        userId,
        workspaceId,
      })),
    );
  });

  afterEach(async () => {
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(inArray(users.id, [creator, member, owner]));
  });

  it.each([member, owner])(
    'hides another member standalone topic from %s despite Agent Use',
    async (userId) => {
      const { message, topic } = await createTopic();
      expect(await caller(userId).getTopicDetail({ id: topic.id })).toBeNull();
      await expect(caller(userId).getTopicTranscript({ topicId: topic.id })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      expect((await caller(userId).getTopics({ agentId })).items).toEqual([]);
      expect((await caller(userId).getTopics({ scope: 'workspace' })).items).toEqual([]);
      expect(await caller(userId).getTopicContext({ topicId: topic.id })).toMatchObject({
        success: false,
      });
      expect(await messageModel(userId).query({ topicId: topic.id })).toEqual([]);
      expect(await messageModel(userId).queryByIds([message.id])).toEqual([]);
      expect(await messageModel(userId).findById(message.id)).toBeUndefined();
    },
  );

  it('blocks direct message and thread reads for another member standalone conversation', async () => {
    const { message, topic } = await createTopic();
    const [thread] = await db
      .insert(threads)
      .values({
        topicId: topic.id,
        type: 'standalone',
        userId: creator,
        workspaceId,
      })
      .returning();
    const model = messageModel(member);
    expect(await model.query({ agentId, topicId: topic.id })).toEqual([]);
    expect(await model.queryByIds([message.id])).toEqual([]);
    expect(await model.findById(message.id)).toBeUndefined();
    expect(await model.queryTopicTranscript({ limit: 50, offset: 0, topicId: topic.id })).toEqual({
      items: [],
      total: 0,
    });
    const threadModel = new ThreadModel(db, member, workspaceId);
    expect(await threadModel.queryByTopicId(topic.id)).toEqual([]);
    expect(await threadModel.findById(thread.id)).toBeUndefined();
  });

  it('keeps the creator standalone topic and transcript readable', async () => {
    const { message, topic } = await createTopic();
    expect(await caller(creator).getTopicDetail({ id: topic.id })).toMatchObject({ id: topic.id });
    expect(await caller(creator).getTopicTranscript({ topicId: topic.id })).toMatchObject({
      items: [{ content: message.content, id: message.id }],
      total: 1,
    });
  });

  it('shares a taskTopics-linked Issue conversation with an active workspace member', async () => {
    const { message, topic } = await createTopic();
    await linkIssue(topic.id);
    expect(await caller(member).getTopicDetail({ id: topic.id })).toMatchObject({ id: topic.id });
    expect(await caller(member).getTopicTranscript({ topicId: topic.id })).toMatchObject({
      items: [{ content: message.content, id: message.id }],
      total: 1,
    });
  });

  it.each(['topic', 'issue'] as const)(
    'caps %s access at an inaccessible private Project, including the topic creator',
    async (binding) => {
      const [project] = await db
        .insert(projects)
        .values({
          identifier: 'PRIV',
          name: 'Private project',
          userId: owner,
          visibility: 'private',
          workspaceId,
        })
        .returning();
      const { message, topic } = await createTopic(
        binding === 'topic' ? { projectId: project.id } : {},
      );
      if (binding === 'issue') await linkIssue(topic.id, project.id);
      for (const userId of [creator, member]) {
        expect(await caller(userId).getTopicDetail({ id: topic.id })).toBeNull();
        await expect(
          caller(userId).getTopicTranscript({ topicId: topic.id }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        expect(await messageModel(userId).queryByIds([message.id])).toEqual([]);
      }
    },
  );

  it('preserves explicitly shared group and document conversations', async () => {
    const [group] = await db
      .insert(chatGroups)
      .values({ userId: creator, workspaceId })
      .returning();
    const grouped = await createTopic({ groupId: group.id });
    const [document] = await db
      .insert(documents)
      .values({
        fileType: 'custom',
        source: 'privacy-test',
        sourceType: 'api',
        totalCharCount: 0,
        totalLineCount: 0,
        userId: creator,
        visibility: 'public',
        workspaceId,
      })
      .returning();
    const documentTopic = await createTopic({ trigger: 'document' });
    await db.insert(topicDocuments).values({
      documentId: document.id,
      topicId: documentTopic.topic.id,
      userId: creator,
      workspaceId,
    });
    for (const { message, topic } of [grouped, documentTopic]) {
      expect(await caller(member).getTopicDetail({ id: topic.id })).toMatchObject({ id: topic.id });
      expect(await caller(member).getTopicTranscript({ topicId: topic.id })).toMatchObject({
        items: [{ id: message.id }],
        total: 1,
      });
    }
  });

  it('preserves topicless shared group messages while hiding private group messages', async () => {
    const [sharedGroup, privateGroup] = await db
      .insert(chatGroups)
      .values([
        { userId: creator, visibility: 'public', workspaceId },
        { userId: creator, visibility: 'private', workspaceId },
      ])
      .returning();
    const groupMessages = await db
      .insert(messages)
      .values(
        [sharedGroup, privateGroup].map((group) => ({
          content: `group content for ${group.id}`,
          groupId: group.id,
          role: 'user' as const,
          userId: creator,
          workspaceId,
        })),
      )
      .returning();
    const model = messageModel(member);
    expect(await model.query({ groupId: sharedGroup.id })).toEqual([
      expect.objectContaining({ id: groupMessages[0].id }),
    ]);
    expect(await model.query({ groupId: privateGroup.id })).toEqual([]);
    expect(await model.queryByIds([groupMessages[1].id])).toEqual([]);
  });

  it('preserves creator builder history without sharing it through editing metadata', async () => {
    const { topic } = await createTopic({
      metadata: { editingAgentId: agentId },
      trigger: 'agent-builder',
    });
    expect((await caller(creator).getTopics({ agentId, editingAgentId: agentId })).items).toEqual([
      expect.objectContaining({ id: topic.id }),
    ]);
    expect((await caller(member).getTopics({ agentId, editingAgentId: agentId })).items).toEqual(
      [],
    );
  });

  it('keeps visitor sharing scoped to its sender while excluding it from creator reads', async () => {
    const senderId = 'privacy-share-visitor';
    const { message, topic } = await createTopic({ senderId, trigger: 'share' });
    expect(await caller(creator).getTopicDetail({ id: topic.id })).toBeNull();
    expect(await messageModel(creator).queryByIds([message.id])).toEqual([]);
    expect(
      await new TopicModel(db, creator, workspaceId).queryBySender({ agentId, senderId }),
    ).toEqual([expect.objectContaining({ id: topic.id })]);
    expect(
      await new TopicModel(db, creator, workspaceId).queryBySender({
        agentId,
        senderId: 'other-visitor',
      }),
    ).toEqual([]);
  });
});
