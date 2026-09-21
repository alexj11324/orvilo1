// @vitest-environment node
/**
 * Integration tests for execAgents (batch execution) router
 *
 * Note: AgentStateManager and StreamEventManager will automatically use
 * InMemory implementations when Redis is not available (test environment).
 */
import { type OrviloDatabase } from '@orvilo/database';
import { agents, topics } from '@orvilo/database/schemas';
import { getTestDB } from '@orvilo/database/test-utils';
import { eq } from 'drizzle-orm';
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
let testAgent2Id: string;

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

  // Create a second test agent for batch testing
  const [agent2] = await serverDB
    .insert(agents)
    .values({
      model: 'gpt-5-pro',
      provider: 'openai',
      systemRole: 'You are a helpful coding assistant.',
      title: 'Test Assistant 2',
      userId,
    })
    .returning();
  testAgent2Id = agent2.id;

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

describe('Batch Execution (execAgents)', () => {
  it('should execute multiple agents in parallel', async () => {
    const caller = aiAgentRouter.createCaller(createTestContext());

    const result = await caller.execAgents({
      parallel: true,
      tasks: [
        { agentId: testAgentId, prompt: 'Task 1: Hello' },
        { agentId: testAgent2Id, prompt: 'Task 2: World' },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.summary).toEqual({
      failed: 0,
      succeeded: 2,
      total: 2,
    });

    expect(result.results[0]).toMatchObject({
      success: true,
      taskIndex: 0,
      operationId: expect.stringMatching(
        /^op_\d+_agt_.+_tpc_.(?:[^\n\r_\u2028\u2029]*_[^\w\n\r\u2028\u2029])*[^\n\r_\u2028\u2029]*_\w+(?:[^\w\n\r\u2028\u2029](?:[^\n\r_\u2028\u2029]*_[^\w\n\r\u2028\u2029])*[^\n\r_\u2028\u2029]*_\w+)*$/,
      ),
    });
    expect(result.results[1]).toMatchObject({
      success: true,
      taskIndex: 1,
      operationId: expect.stringMatching(
        /^op_\d+_agt_.+_tpc_.(?:[^\n\r_\u2028\u2029]*_[^\w\n\r\u2028\u2029])*[^\n\r_\u2028\u2029]*_\w+(?:[^\w\n\r\u2028\u2029](?:[^\n\r_\u2028\u2029]*_[^\w\n\r\u2028\u2029])*[^\n\r_\u2028\u2029]*_\w+)*$/,
      ),
    });

    expect(result.results[0].operationId).not.toBe(result.results[1].operationId);
  });

  it('should execute multiple agents sequentially when parallel=false', async () => {
    const caller = aiAgentRouter.createCaller(createTestContext());

    const result = await caller.execAgents({
      parallel: false,
      tasks: [
        { agentId: testAgentId, prompt: 'Sequential Task 1' },
        { agentId: testAgent2Id, prompt: 'Sequential Task 2' },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.summary.succeeded).toBe(2);
  });

  it('should handle partial failures gracefully', async () => {
    const caller = aiAgentRouter.createCaller(createTestContext());

    const result = await caller.execAgents({
      tasks: [
        { agentId: testAgentId, prompt: 'Valid task' },
        { agentId: 'non-existent-agent', prompt: 'Invalid task' },
        { agentId: testAgent2Id, prompt: 'Another valid task' },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.results).toHaveLength(3);

    expect(result.results[0].success).toBe(true);
    expect(result.results[0].taskIndex).toBe(0);

    expect(result.results[1].success).toBe(false);
    expect(result.results[1].taskIndex).toBe(1);
    expect(result.results[1].error).toBeDefined();

    expect(result.results[2].success).toBe(true);
    expect(result.results[2].taskIndex).toBe(2);

    expect(result.summary).toEqual({
      failed: 1,
      succeeded: 2,
      total: 3,
    });
  });

  it('should create separate topics for each task', async () => {
    const caller = aiAgentRouter.createCaller(createTestContext());

    await caller.execAgents({
      tasks: [
        { agentId: testAgentId, prompt: 'Topic 1 prompt' },
        { agentId: testAgentId, prompt: 'Topic 2 prompt' },
      ],
    });

    const createdTopics = await serverDB
      .select()
      .from(topics)
      .where(eq(topics.agentId, testAgentId));

    expect(createdTopics).toHaveLength(2);
    expect(createdTopics.map((t) => t.title).sort()).toEqual(['Topic 1 prompt', 'Topic 2 prompt']);
  });

  it('should preserve deviceId bindings for batch tasks', async () => {
    const caller = aiAgentRouter.createCaller(createTestContext());

    await caller.execAgents({
      tasks: [
        {
          agentId: testAgentId,
          deviceId: 'device-batch-1',
          prompt: 'Device-bound task 1',
        },
        {
          agentId: testAgentId,
          deviceId: 'device-batch-2',
          prompt: 'Device-bound task 2',
        },
      ],
    });

    const createdTopics = await serverDB
      .select()
      .from(topics)
      .where(eq(topics.agentId, testAgentId));

    expect(createdTopics).toHaveLength(2);
    expect(createdTopics.map((topic) => topic.metadata?.boundDeviceId).sort()).toEqual([
      'device-batch-1',
      'device-batch-2',
    ]);
  });

  // ACP dispatch is the run start itself — autoStart=false has no deferred
  // start to defer to, so the retired flag is rejected per-task (batch
  // semantics report it in `results` rather than throwing).
  it('should reject autoStart:false tasks while dispatching the rest', async () => {
    const caller = aiAgentRouter.createCaller(createTestContext());

    const result = await caller.execAgents({
      tasks: [
        { agentId: testAgentId, autoStart: true, prompt: 'Auto start task 1' },
        { agentId: testAgent2Id, autoStart: false, prompt: 'Manual start task 2' },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.results[0]).toMatchObject({ autoStarted: true, success: true });
    expect(result.results[1]).toMatchObject({
      error: expect.stringContaining('autoStart:false is not supported'),
      success: false,
    });
    expect(result.summary).toEqual({ failed: 1, succeeded: 1, total: 2 });
    expect(mockDispatchHeteroAgent).toHaveBeenCalledTimes(1);
  });
});
