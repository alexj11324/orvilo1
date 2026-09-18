import { describe, expect, it, vi } from 'vitest';

import { ResponsesService } from '../responses.service';

// A delegated run (callAgent / callSubAgent) parks the parent at
// waiting_for_async_tool and resumes it out-of-band. ResponsesService must
// wait for the durable state to turn terminal instead of reporting a
// truncated 'completed' response.
const parkedState = {
  interruption: { reason: 'async_tool' },
  messages: [{ content: 'partial', role: 'assistant' }],
  status: 'waiting_for_async_tool' as const,
};
const doneState = {
  messages: [{ content: 'final answer', role: 'assistant' }],
  status: 'done' as const,
};

const makeService = (loadAgentState: (opId: string) => Promise<any>) => {
  const runtime = {
    executeSync: vi.fn(async () => parkedState),
    getCoordinator: () => ({ loadAgentState }),
  };
  const svc = new (ResponsesService as any)(null, 'user_1');
  return { runtime, svc };
};

vi.mock('@/server/modules/AgentExecution/InMemoryStreamEventManager', () => ({
  InMemoryStreamEventManager: class {},
}));
vi.mock('@/server/modules/AgentExecution/StreamEventManager', () => ({}));
vi.mock('@/server/services/agentRuntime', () => ({ AgentRuntimeService: class {} }));

const lastRuntime: { current?: ReturnType<typeof makeService>['runtime'] } = {};
vi.mock('@/server/services/aiAgent', () => ({
  AiAgentService: class {
    createIsolatedRuntime = vi.fn(() => lastRuntime.current);
    execAgent = vi.fn(async () => ({
      operationId: 'op_1',
      success: true,
      topicId: 'tpc_1',
    }));
  },
}));
vi.mock('../../common/base.service', () => ({
  BaseService: class {
    db: any;
    userId = '';
    constructor() {}
    log() {}
  },
}));

const createResponse = (svc: ResponsesService) =>
  svc.createResponse({ input: 'hi', model: 'agent_1' } as any);

describe('ResponsesService delegated-run handling', () => {
  it('waits for a delegated child to resume the parent and reports completed', async () => {
    vi.useFakeTimers();
    try {
      const loadAgentState = vi.fn(async () => doneState);
      const { runtime, svc } = makeService(loadAgentState);
      lastRuntime.current = runtime;

      const promise = createResponse(svc);
      await vi.runAllTimersAsync();
      const res = await promise;

      expect(loadAgentState).toHaveBeenCalledWith('op_1');
      expect(res.status).toBe('completed');
      expect(res.output_text).toBe('final answer');
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports incomplete (not completed) while still parked on a delegated run', async () => {
    vi.useFakeTimers();
    try {
      const loadAgentState = vi.fn(async () => parkedState);
      const { runtime, svc } = makeService(loadAgentState);
      lastRuntime.current = runtime;

      const promise = createResponse(svc);
      await vi.runAllTimersAsync();
      const res = await promise;

      expect(res.status).toBe('incomplete');
      expect(res.completed_at).toBeNull();
      expect(res.incomplete_details).toEqual({ reason: 'async_tool' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns incomplete immediately for client_tool_execution without polling', async () => {
    const clientToolParked = {
      ...parkedState,
      interruption: { reason: 'client_tool_execution' },
    };
    const loadAgentState = vi.fn(async () => doneState);
    const runtime = {
      executeSync: vi.fn(async () => clientToolParked),
      getCoordinator: () => ({ loadAgentState }),
    };
    const svc = new (ResponsesService as any)(null, 'user_1');
    lastRuntime.current = runtime;

    const res = await createResponse(svc);

    expect(loadAgentState).not.toHaveBeenCalled();
    expect(res.status).toBe('incomplete');
    expect(res.incomplete_details).toEqual({ reason: 'client_tool_execution' });
  });
});
