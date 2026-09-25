// @vitest-environment node
/**
 * Integration tests for execAgent router
 *
 * Note: AgentStateManager and StreamEventManager will automatically use
 * InMemory implementations when Redis is not available (test environment).
 */
import { type OrviloDatabase } from '@orvilo/database';
import { agents, chatGroups, messages, threads, topics } from '@orvilo/database/schemas';
import { getTestDB } from '@orvilo/database/test-utils';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { aiAgentRouter } from '../../../aiAgent';
import { cleanupTestUser, createTestUser } from '../setup';

// Every execAgent run hands off to ACP via dispatchHeteroAgent — stub that
// boundary so these tests cover the router → service path (topic/message
// persistence, context wiring) without spawning a host.
const { mockDispatchHeteroAgent } = vi.hoisted(() => ({
  mockDispatchHeteroAgent: vi.fn(),
}));
vi.mock('../../../../../services/aiAgent/pipeline/heteroDispatch', () => ({
  dispatchHeteroAgent: mockDispatchHeteroAgent,
}));

// Mock getServerDB to return our test database instance
let testDB: OrviloDatabase;
vi.mock('@/database/core/db-adaptor', () => ({
  getServerDB: vi.fn(function () {
    return testDB;
  }),
}));

// Mock FileService to avoid S3 environment variable requirements
vi.mock('@/server/services/file', () => ({
  FileService: vi.fn().mockImplementation(function () {
    return {
      getFullFileUrl: vi.fn().mockImplementation(function (path: string) {
        return path ? `/files${path}` : null;
      }),
    };
  }),
}));

let serverDB: OrviloDatabase;
let userId: string;
let testAgentId: string;

const createTestContext = () => ({
  jwtPayload: { userId },
  userId,
});

beforeEach(async () => {
  // Setup test database
  serverDB = await getTestDB();
  testDB = serverDB;
  userId = await createTestUser(serverDB);

  // Create test agent with gpt-5-pro (uses Responses API)
  const [agent] = await serverDB
    .insert(agents)
    .values({
      model: 'gpt-5-pro',
      provider: 'openai',
      systemRole: 'You are a helpful assistant.',
      title: 'Test Assistant',
      userId,
    })
    .returning();
  testAgentId = agent.id;

  let opCounter = 0;
  mockDispatchHeteroAgent.mockImplementation(async (_deps, ctx) => ({
    agentId: ctx.resolvedAgentId,
    assistantMessageId: ctx.assistantMessageId,
    autoStarted: true,
    createdAt: new Date().toISOString(),
    message: 'Hetero agent dispatched successfully',
    operationId: `op_${Date.now()}_${ctx.resolvedAgentId}_${ctx.topicId}_${opCounter++}`,
    status: 'created',
    success: true,
    timestamp: new Date().toISOString(),
    topicId: ctx.topicId,
    userMessageId: ctx.userMessageId ?? ctx.parentMessageId ?? '',
  }));
});

afterEach(async () => {
  await cleanupTestUser(serverDB, userId);
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('execAgent', () => {
  describe('Basic execAgent Flow', () => {
    it('should create operation successfully with prompt', async () => {
      const caller = aiAgentRouter.createCaller(createTestContext());
      const prompt = "What's the weather of Hangzhou?";

      const result = await caller.execAgent({ agentId: testAgentId, prompt });

      expect(result.success).toBe(true);
      expect(result.operationId).toBeDefined();
      expect(result.operationId).toMatch(
        /^op_\d+_agt_.+_tpc_.(?:[^\n\r_\u2028\u2029]*_[^\w\n\r\u2028\u2029])*[^\n\r_\u2028\u2029]*_\w+(?:[^\w\n\r\u2028\u2029](?:[^\n\r_\u2028\u2029]*_[^\w\n\r\u2028\u2029])*[^\n\r_\u2028\u2029]*_\w+)*$/,
      );

      // Verify topic was created
      const createdTopics = await serverDB
        .select()
        .from(topics)
        .where(eq(topics.agentId, testAgentId));
      expect(createdTopics).toHaveLength(1);
      expect(createdTopics[0].title).toBe(prompt);

      // Verify user message and assistant message placeholder were created
      const createdMessages = await serverDB
        .select()
        .from(messages)
        .where(and(eq(messages.agentId, testAgentId), eq(messages.topicId, createdTopics[0].id)));

      expect(createdMessages).toHaveLength(2);

      const userMessage = createdMessages.find((m) => m.role === 'user');
      expect(userMessage).toBeDefined();
      expect(userMessage?.content).toBe(prompt);

      const assistantMessage = createdMessages.find((m) => m.role === 'assistant');
      expect(assistantMessage).toBeDefined();
      expect(assistantMessage?.parentId).toBe(userMessage?.id);
    });

    it('should create a new topic when topicId is not provided', async () => {
      const caller = aiAgentRouter.createCaller(createTestContext());

      const result = await caller.execAgent({
        agentId: testAgentId,
        prompt: 'Hello, how are you?',
      });

      expect(result.success).toBe(true);

      const createdTopics = await serverDB
        .select()
        .from(topics)
        .where(eq(topics.agentId, testAgentId));

      expect(createdTopics).toHaveLength(1);
      expect(createdTopics[0].title).toBe('Hello, how are you?');
    });

    it('should truncate long prompt for topic title', async () => {
      const caller = aiAgentRouter.createCaller(createTestContext());
      const longPrompt =
        'This is a very long prompt that exceeds fifty characters and should be truncated for the topic title';

      await caller.execAgent({
        agentId: testAgentId,
        prompt: longPrompt,
      });

      const createdTopics = await serverDB
        .select()
        .from(topics)
        .where(eq(topics.agentId, testAgentId));

      expect(createdTopics).toHaveLength(1);
      expect(createdTopics[0].title).toBe(longPrompt.slice(0, 50) + '...');
    });

    it('should reuse existing topic when topicId is provided', async () => {
      const caller = aiAgentRouter.createCaller(createTestContext());

      const [existingTopic] = await serverDB
        .insert(topics)
        .values({ agentId: testAgentId, title: 'Existing Topic', userId })
        .returning();
      const [seedUserMessage] = (await serverDB
        .insert(messages)
        .values({
          agentId: testAgentId,
          content: 'Initial question',
          createdAt: new Date('2024-01-01T00:00:00Z'),
          role: 'user',
          topicId: existingTopic.id,
          userId,
        })
        .returning()) as any[];
      const [latestAssistantMessage] = (await serverDB
        .insert(messages)
        .values({
          agentId: testAgentId,
          content: 'Initial answer',
          createdAt: new Date('2024-01-01T00:00:01Z'),
          parentId: seedUserMessage.id,
          role: 'assistant',
          topicId: existingTopic.id,
          userId,
        })
        .returning()) as any[];

      const result = await caller.execAgent({
        agentId: testAgentId,
        appContext: { topicId: existingTopic.id },
        prompt: 'Follow up question',
      });

      expect(result.success).toBe(true);

      const allTopics = await serverDB.select().from(topics).where(eq(topics.agentId, testAgentId));
      expect(allTopics).toHaveLength(1);
      expect(allTopics[0].id).toBe(existingTopic.id);

      const allMessages = await serverDB
        .select()
        .from(messages)
        .where(eq(messages.topicId, existingTopic.id));
      const followUpUserMessage = allMessages.find(
        (message) => message.role === 'user' && message.content === 'Follow up question',
      );
      expect(followUpUserMessage?.parentId).toBe(latestAssistantMessage.id);

      const followUpAssistantMessage = allMessages.find(
        (message) => message.role === 'assistant' && message.parentId === followUpUserMessage?.id,
      );
      expect(followUpAssistantMessage).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should throw error when agent does not exist', async () => {
      const caller = aiAgentRouter.createCaller(createTestContext());

      await expect(
        caller.execAgent({
          agentId: 'non-existent-agent-id',
          prompt: 'Hello',
        }),
      ).rejects.toThrow();
    });
  });

  describe('autoStart behavior', () => {
    it('should have autoStarted=true by default', async () => {
      const caller = aiAgentRouter.createCaller(createTestContext());

      const result = await caller.execAgent({
        agentId: testAgentId,
        prompt: 'Hello',
      });

      expect(result.autoStarted).toBe(true);
    });

    // ACP dispatch is the run start itself — there is no deferred start to
    // honor, so the retired flag is rejected BEFORE any run side effects.
    it('should reject autoStart=false without dispatching or persisting', async () => {
      const caller = aiAgentRouter.createCaller(createTestContext());

      await expect(
        caller.execAgent({
          agentId: testAgentId,
          autoStart: false,
          prompt: 'Hello',
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

      expect(mockDispatchHeteroAgent).not.toHaveBeenCalled();
      expect(await serverDB.select().from(topics).where(eq(topics.agentId, testAgentId))).toEqual(
        [],
      );
    });
  });

  describe('appContext handling', () => {
    it('should include threadId in operation when provided', async () => {
      // First create a topic and thread
      const [topic] = await serverDB
        .insert(topics)
        .values({
          title: 'Test Topic',
          userId,
        })
        .returning();

      const threadResult = (await serverDB
        .insert(threads)
        .values({
          topicId: topic.id,
          type: 'standalone',
          userId,
        })
        .returning()) as { id: string }[];
      const thread = threadResult[0];

      const caller = aiAgentRouter.createCaller(createTestContext());

      const result = await caller.execAgent({
        agentId: testAgentId,
        appContext: {
          threadId: thread.id,
        },
        prompt: 'Test prompt',
      });

      expect(result.success).toBe(true);
      expect(result.operationId).toBeDefined();
    });

    // Regression: group conversation that reaches
    // execAgent without a pre-created topicId must persist groupId on BOTH the
    // new topic AND the user/assistant messages. Otherwise:
    //   - the topic is group-less and never appears in the group sidebar
    //     (which queries `topics.groupId`), and
    //   - the messages are group-less, so reopening the topic returns an empty
    //     conversation (the group read filters on `messages.groupId`).
    it('should persist groupId on the topic and messages when running in a group context', async () => {
      const [group] = await serverDB
        .insert(chatGroups)
        .values({ title: 'Regression Group', userId })
        .returning();

      const caller = aiAgentRouter.createCaller(createTestContext());

      const result = await caller.execAgent({
        agentId: testAgentId,
        appContext: { groupId: group.id },
        prompt: 'Hello, group via execAgent',
      });

      expect(result.success).toBe(true);

      const createdTopics = await serverDB
        .select()
        .from(topics)
        .where(eq(topics.agentId, testAgentId));

      expect(createdTopics).toHaveLength(1);
      expect(createdTopics[0].groupId).toBe(group.id);

      // The user + assistant turn must also carry groupId, or the group read
      // path (messageModel.query filters messages.groupId) returns nothing.
      const createdMessages = await serverDB
        .select()
        .from(messages)
        .where(eq(messages.topicId, createdTopics[0].id));

      expect(createdMessages.length).toBeGreaterThanOrEqual(2);
      expect(createdMessages.every((m) => m.groupId === group.id)).toBe(true);
    });
  });
});
