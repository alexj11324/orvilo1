// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { threadRunCallback } from '../threadRunCallback';

const mocks = vi.hoisted(() => ({
  completeThreadRun: vi.fn(),
  findOperation: vi.fn(),
  loadAgentState: vi.fn(),
  messageModel: {
    countByThreadId: vi.fn(),
    findLatestAssistantByOperationId: vi.fn(),
  },
  threadModel: { findById: vi.fn() },
  updateThreadRunProgress: vi.fn(),
}));

vi.mock('@/server/modules/AgentRuntime', () => ({
  AgentRuntimeCoordinator: vi.fn().mockImplementation(function () {
    return {
      loadAgentState: mocks.loadAgentState,
    };
  }),
}));

vi.mock('@/database/models/agentOperation', () => ({
  AgentOperationModel: vi.fn().mockImplementation(function () {
    return { findById: mocks.findOperation };
  }),
}));

vi.mock('@/database/core/db-adaptor', () => ({
  getServerDB: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/database/models/thread', () => ({
  ThreadModel: vi.fn().mockImplementation(function () {
    return mocks.threadModel;
  }),
}));

vi.mock('@/database/models/message', () => ({
  MessageModel: vi.fn().mockImplementation(function () {
    return mocks.messageModel;
  }),
}));

vi.mock('@/server/services/aiAgent/hooks/threadRunHooks', () => ({
  completeThreadRun: mocks.completeThreadRun,
  updateThreadRunProgress: mocks.updateThreadRunProgress,
}));

const buildContext = (body: unknown) =>
  ({
    json: (value: unknown, status = 200) => Response.json(value, { status }),
    req: { json: async () => body },
  }) as any;

const state = {
  messages: [{ content: 'finished answer', role: 'assistant' }],
  operationId: 'op-1',
  session: { toolCalls: 2 },
};

describe('threadRunCallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findOperation.mockResolvedValue({
      completionReason: 'error',
      cost: { total: 0.04 },
      error: { message: 'failed' },
      threadId: 'thread-1',
      toolCalls: 2,
      topicId: 'topic-1',
      usage: { llm: { tokens: { total: 17 } } },
    });
    mocks.threadModel.findById.mockResolvedValue({ sourceMessageId: 'message-1' });
    mocks.messageModel.countByThreadId.mockResolvedValue(3);
    mocks.messageModel.findLatestAssistantByOperationId.mockResolvedValue({
      content: 'finished answer',
      role: 'assistant',
    });
    mocks.loadAgentState.mockResolvedValue(state);
  });

  it('reloads durable state and persists step progress', async () => {
    const response = await threadRunCallback(
      buildContext({
        callbackType: 'step',
        operationId: 'op-1',
        startedAt: '2026-09-16T00:00:00.000Z',
        stepIndex: 2,
        threadId: 'thread-1',
        userId: 'user-1',
        workspaceId: 'workspace-1',
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.loadAgentState).toHaveBeenCalledWith('op-1');
    expect(mocks.updateThreadRunProgress).toHaveBeenCalledWith(
      mocks.threadModel,
      'thread-1',
      '2026-09-16T00:00:00.000Z',
      expect.objectContaining(state),
    );
  });

  it('reloads durable state and persists the terminal summary and thread status', async () => {
    const response = await threadRunCallback(
      buildContext({
        callbackType: 'completion',
        operationId: 'op-1',
        reason: 'error',
        sourceMessageId: 'message-1',
        startedAt: '2026-09-16T00:00:00.000Z',
        threadId: 'thread-1',
        userId: 'user-1',
        workspaceId: 'workspace-1',
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.completeThreadRun).toHaveBeenCalledWith(mocks.threadModel, mocks.messageModel, {
      finalState: expect.objectContaining({
        messages: [{ content: 'finished answer', role: 'assistant' }],
        operationId: 'op-1',
      }),
      reason: 'error',
      sourceMessageId: 'message-1',
      startedAt: '2026-09-16T00:00:00.000Z',
      threadId: 'thread-1',
      totalMessages: 3,
    });
  });

  it('uses the durable operation summary when Redis state has expired', async () => {
    mocks.loadAgentState.mockResolvedValue(null);

    const response = await threadRunCallback(
      buildContext({
        callbackType: 'step',
        operationId: 'op-1',
        startedAt: '2026-09-16T00:00:00.000Z',
        threadId: 'thread-1',
        userId: 'user-1',
        workspaceId: 'workspace-1',
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.updateThreadRunProgress).toHaveBeenCalledWith(
      mocks.threadModel,
      'thread-1',
      '2026-09-16T00:00:00.000Z',
      expect.objectContaining({
        cost: { total: 0.04 },
        error: { message: 'failed' },
        operationId: 'op-1',
        session: { toolCalls: 2 },
      }),
    );
  });
});
