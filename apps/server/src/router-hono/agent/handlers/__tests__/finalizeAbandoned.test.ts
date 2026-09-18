// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { finalizeAbandoned } from '../finalizeAbandoned';

const mockFinalizeAbandoned = vi.hoisted(() => vi.fn());
const mockDeliverWebhook = vi.hoisted(() => vi.fn());
const mockIsQueueAgentRuntimeEnabled = vi.hoisted(() => vi.fn());
const mockCompleteSubAgentBridge = vi.hoisted(() => vi.fn());

vi.mock('@/database/core/db-adaptor', () => ({
  getServerDB: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/server/services/agentRuntime', () => ({
  AbandonOperationService: vi.fn().mockImplementation(function () {
    return { finalizeAbandoned: mockFinalizeAbandoned };
  }),
}));

vi.mock('@/server/services/agentRuntime/hooks/HookDispatcher', () => ({
  deliverWebhook: mockDeliverWebhook,
}));

vi.mock('@/server/services/aiAgent', () => ({
  AiAgentService: vi.fn().mockImplementation(function () {
    return { completeSubAgentBridge: mockCompleteSubAgentBridge };
  }),
}));

vi.mock('@/server/services/queue/impls', () => ({
  isQueueAgentRuntimeEnabled: mockIsQueueAgentRuntimeEnabled,
}));

const subAgentResume = {
  parentOperationId: 'parent-1',
  threadId: 'thread-1',
  toolMessageId: 'tool-1',
  userId: 'user-1',
  workspaceId: 'workspace-1',
};

function buildContext() {
  return {
    json: (body: unknown, status = 200) => Response.json(body, { status }),
    req: {
      json: async () => ({ operationId: 'child-1', reason: 'watchdog' }),
    },
  } as any;
}

describe('finalizeAbandoned handler', () => {
  beforeEach(() => {
    mockFinalizeAbandoned.mockReset();
    mockDeliverWebhook.mockReset().mockResolvedValue(undefined);
    mockCompleteSubAgentBridge.mockReset().mockResolvedValue(true);
    mockIsQueueAgentRuntimeEnabled.mockReset();
    mockFinalizeAbandoned.mockResolvedValue({
      assistantMessageUpdated: false,
      finalized: false,
      found: true,
      subAgentResume,
    });
    process.env.HATCHET_CLIENT_TOKEN = 'token-present';
  });

  afterEach(() => {
    delete process.env.HATCHET_CLIENT_TOKEN;
  });

  it('does not queue a Hatchet callback in local mode even when a token is present', async () => {
    mockIsQueueAgentRuntimeEnabled.mockReturnValue(false);

    const response = await finalizeAbandoned(buildContext());

    expect(response.status).toBe(200);
    expect(mockDeliverWebhook).not.toHaveBeenCalled();
    expect(mockCompleteSubAgentBridge).toHaveBeenCalledWith({
      operationId: 'child-1',
      parentOperationId: 'parent-1',
      reason: 'error',
      threadId: 'thread-1',
      toolMessageId: 'tool-1',
    });
  });

  it('queues the durable callback when the queue runtime is enabled', async () => {
    mockIsQueueAgentRuntimeEnabled.mockReturnValue(true);

    const response = await finalizeAbandoned(buildContext());

    expect(response.status).toBe(200);
    expect(mockDeliverWebhook).toHaveBeenCalledWith(
      { delivery: 'hatchet', fallback: 'none', url: '/api/agent/webhooks/subagent-callback' },
      {
        operationId: 'child-1',
        parentOperationId: 'parent-1',
        reason: 'error',
        threadId: 'thread-1',
        toolMessageId: 'tool-1',
      },
    );
    expect(mockCompleteSubAgentBridge).not.toHaveBeenCalled();
  });
});
