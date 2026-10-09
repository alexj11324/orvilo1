// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import {
  agents,
  agentsToSessions,
  messages,
  resourcePermissions,
  sessions,
  topics,
  users,
  workspaceMembers,
  workspaces,
} from '@/database/schemas';

import { aiChatRouter } from '../aiChat';

const db = await getTestDB();
vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: () => db }));
vi.mock('@/business/server/trpc-middlewares/workspaceAuth', async (importOriginal) => {
  const { trpc } = await import('@/libs/trpc/lambda/init');
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    wsCompatProcedure: trpc.procedure,
  };
});
vi.mock('@/server/services/file', () => ({
  FileService: vi.fn(function () {
    return { getFileAccessUrl: vi.fn(({ url }: { url: string }) => url) };
  }),
}));
vi.mock('@/server/services/aiChat', () => ({
  AiChatService: vi.fn(function () {
    return { getMessagesAndTopics: vi.fn().mockResolvedValue({ messages: [], topics: undefined }) };
  }),
}));
vi.mock('@/server/services/aiGeneration', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  AiGenerationService: vi.fn(),
}));

const owner = 'ai-chat-use-owner';
const member = 'ai-chat-use-member';
const workspaceId = 'ai-chat-use-workspace';
const agentId = 'ai-chat-use-agent';
const otherAgentId = 'ai-chat-use-other-agent';
const sessionId = 'ai-chat-use-session';
const cleanup = async () => {
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(users).where(eq(users.id, owner));
  await db.delete(users).where(eq(users.id, member));
};
beforeEach(async () => {
  await cleanup();
  await db.insert(users).values([{ id: owner }, { id: member }]);
  await db
    .insert(workspaces)
    .values({ id: workspaceId, name: 'Send Use', slug: workspaceId, primaryOwnerId: owner });
  await db.insert(workspaceMembers).values([
    { workspaceId, userId: owner, role: 'owner' },
    { workspaceId, userId: member, role: 'member' },
  ]);
  await db.insert(agents).values([
    { id: agentId, userId: owner, workspaceId, visibility: 'public' },
    { id: otherAgentId, userId: owner, workspaceId, visibility: 'public' },
  ]);
  await db.insert(sessions).values({ id: sessionId, userId: member, workspaceId, type: 'agent' });
  await db.insert(agentsToSessions).values({ agentId, sessionId, userId: member, workspaceId });
});
afterEach(cleanup);
const send = (overrides: { agentId?: string; newAssistantMessage?: { agentId: string } } = {}) =>
  aiChatRouter
    .createCaller({ serverDB: db, userId: member, workspaceId } as never)
    .sendMessageInServer({
      sessionId,
      ...overrides,
      newAssistantMessage: {
        model: 'fixture-model',
        provider: 'openai',
        ...overrides.newAssistantMessage,
      },
      newUserMessage: { content: 'Authorized message' },
      newTopic: { title: 'Fixture', topicMessageIds: [] },
    });

describe('server Send Agent Use admission', () => {
  it('preserves an explicitly authorized distinct assistant target', async () => {
    await db.insert(resourcePermissions).values(
      [agentId, otherAgentId].map((resourceId) => ({
        workspaceId,
        userId: member,
        createdBy: owner,
        resourceType: 'agent' as const,
        resourceId,
        accessLevel: 'use' as const,
      })),
    );
    await expect(
      send({ agentId, newAssistantMessage: { agentId: otherAgentId } }),
    ).resolves.toMatchObject({ isCreateNewTopic: true });
    expect(
      (await db.select().from(topics).where(eq(topics.workspaceId, workspaceId)))[0].agentId,
    ).toBe(agentId);
    expect(await db.select().from(messages).where(eq(messages.workspaceId, workspaceId))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ agentId, role: 'user' }),
        expect.objectContaining({ agentId: otherAgentId, role: 'assistant' }),
      ]),
    );
  });
  it.each(['top-level', 'assistant'] as const)(
    'rejects an unauthorized %s Agent override before writes',
    async (target) => {
      await db.insert(resourcePermissions).values({
        workspaceId,
        userId: member,
        createdBy: owner,
        resourceType: 'agent',
        resourceId: agentId,
        accessLevel: 'use',
      });
      await expect(
        send(
          target === 'top-level'
            ? { agentId: otherAgentId }
            : { newAssistantMessage: { agentId: otherAgentId } },
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(await db.select().from(topics).where(eq(topics.workspaceId, workspaceId))).toEqual([]);
      expect(await db.select().from(messages).where(eq(messages.workspaceId, workspaceId))).toEqual(
        [],
      );
    },
  );
  it('denies a session-only send without actual Agent Use before any topic or message write', async () => {
    await expect(send()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await db.select().from(topics).where(eq(topics.workspaceId, workspaceId))).toEqual([]);
    expect(await db.select().from(messages).where(eq(messages.workspaceId, workspaceId))).toEqual(
      [],
    );
  });

  it('permits the same resolved session only while the actual member Use grant exists', async () => {
    await db.insert(resourcePermissions).values({
      workspaceId,
      userId: member,
      createdBy: owner,
      resourceType: 'agent',
      resourceId: agentId,
      accessLevel: 'use',
    });
    await expect(send()).resolves.toMatchObject({ isCreateNewTopic: true });
    expect(
      (await db.select().from(topics).where(eq(topics.workspaceId, workspaceId)))[0].agentId,
    ).toBe(agentId);
    expect(
      (await db.select().from(messages).where(eq(messages.workspaceId, workspaceId))).map(
        (message) => message.agentId,
      ),
    ).toEqual([agentId, agentId]);
    await db.delete(resourcePermissions).where(eq(resourcePermissions.resourceId, agentId));
    await expect(send()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await db.select().from(topics).where(eq(topics.workspaceId, workspaceId))).toHaveLength(
      1,
    );
    expect(
      await db.select().from(messages).where(eq(messages.workspaceId, workspaceId)),
    ).toHaveLength(2);
  });
});
