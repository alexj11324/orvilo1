// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { finalizeAbandoned } from '../finalizeAbandoned';

const mockFinalizeAbandoned = vi.hoisted(() => vi.fn());
const mockCompleteSubAgentBridge = vi.hoisted(() => vi.fn());
const aiAgentServiceCtor = vi.hoisted(() => vi.fn());

vi.mock('@/database/core/db-adaptor', () => ({
  getServerDB: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/server/services/agentExecution/AbandonOperationService', () => ({
  AbandonOperationService: vi.fn().mockImplementation(function () {
    return { finalizeAbandoned: mockFinalizeAbandoned };
  }),
}));

vi.mock('@/server/services/aiAgent', () => ({
  AiAgentService: aiAgentServiceCtor.mockImplementation(function () {
    return { completeSubAgentBridge: mockCompleteSubAgentBridge };
  }),
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
    mockCompleteSubAgentBridge.mockReset().mockResolvedValue(true);
    aiAgentServiceCtor.mockClear();
    mockFinalizeAbandoned.mockResolvedValue({
      assistantMessageUpdated: false,
      finalized: false,
      found: true,
      subAgentResume,
    });
  });

  it('resumes the parked parent inline through the CAS-guarded bridge', async () => {
    const response = await finalizeAbandoned(buildContext());

    expect(response.status).toBe(200);
    expect(aiAgentServiceCtor).toHaveBeenCalledWith(
      {},
      'user-1',
      expect.objectContaining({ includeShareVisitor: false, workspaceId: 'workspace-1' }),
    );
    expect(mockCompleteSubAgentBridge).toHaveBeenCalledWith({
      operationId: 'child-1',
      parentOperationId: 'parent-1',
      reason: 'error',
      threadId: 'thread-1',
      toolMessageId: 'tool-1',
    });
  });

  it('skips the bridge when the abandoned op has no parked parent', async () => {
    mockFinalizeAbandoned.mockResolvedValue({
      assistantMessageUpdated: false,
      finalized: true,
      found: true,
    });

    const response = await finalizeAbandoned(buildContext());

    expect(response.status).toBe(200);
    expect(mockCompleteSubAgentBridge).not.toHaveBeenCalled();
  });
});
