import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentRuntimeService } from '@/server/services/agentRuntime';

import { AiAgentService } from '../index';

vi.mock('@/libs/trusted-client', () => ({
  generateTrustedClientToken: vi.fn().mockReturnValue(undefined),
  getTrustedClientTokenForSession: vi.fn().mockResolvedValue(undefined),
  isTrustedClientEnabled: vi.fn().mockReturnValue(false),
}));

vi.mock('@/server/services/agentRuntime', () => ({
  AgentRuntimeService: vi.fn().mockImplementation(function () {
    return {};
  }),
}));

vi.mock('@/database/models/agentDocument', () => ({
  AgentDocumentsService: vi.fn().mockImplementation(function () {
    return {};
  }),
}));

vi.mock('@/database/models/agent', () => ({
  AgentModel: vi.fn().mockImplementation(function () {
    return {};
  }),
}));

vi.mock('@/database/models/agentOperation', () => ({
  AgentOperationModel: vi.fn().mockImplementation(function () {
    return {};
  }),
}));

vi.mock('@/server/services/agent', () => ({
  AgentService: vi.fn().mockImplementation(function () {
    return {};
  }),
}));

vi.mock('@/database/models/message', () => ({
  MessageModel: vi.fn().mockImplementation(function () {
    return {};
  }),
}));

vi.mock('@/database/models/connector', () => ({
  ConnectorModel: vi.fn().mockImplementation(function () {
    return {};
  }),
}));

vi.mock('@/database/models/connectorTool', () => ({
  ConnectorToolModel: vi.fn().mockImplementation(function () {
    return {};
  }),
}));

vi.mock('@/database/models/plugin', () => ({
  PluginModel: vi.fn().mockImplementation(function () {
    return {};
  }),
}));

vi.mock('@/database/models/task', () => ({
  TaskModel: vi.fn().mockImplementation(function () {
    return {};
  }),
}));

vi.mock('@/database/models/thread', () => ({
  ThreadModel: vi.fn().mockImplementation(function () {
    return {};
  }),
}));

vi.mock('@/database/models/topic', () => ({
  TopicModel: vi.fn().mockImplementation(function () {
    return {};
  }),
}));

vi.mock('@/server/services/composio', () => ({
  ComposioService: vi.fn().mockImplementation(function () {
    return {};
  }),
}));

vi.mock('@/server/services/market', () => ({
  MarketService: vi.fn().mockImplementation(function () {
    return {};
  }),
}));

const getRuntimeOptions = (callIndex = -1) =>
  vi.mocked(AgentRuntimeService).mock.calls.at(callIndex)?.[2] as any;

describe('AiAgentService.createIsolatedRuntime', () => {
  const mockDb = {} as any;
  const userId = 'test-user-id';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds the primary runtime through the same wiring', () => {
    new AiAgentService(mockDb, userId, { workspaceId: 'ws-1' });

    const options = getRuntimeOptions();
    expect(options.workspaceId).toBe('ws-1');
    expect(options.includeShareVisitor).toBe(false);
    expect(options.agentFactory).toEqual(expect.any(Function));
    expect(options.delegate.execSubAgent).toEqual(expect.any(Function));
    expect(options.delegate.execVirtualSubAgent).toEqual(expect.any(Function));
    expect(options.delegate.execGroupMember).toEqual(expect.any(Function));
    expect(options.delegate.verifyShareRunStillAuthorized).toEqual(expect.any(Function));
  });

  it('keeps delegate, workspace and share-visitor wiring on isolated runtimes', () => {
    const service = new AiAgentService(mockDb, userId, {
      includeShareVisitor: true,
      workspaceId: 'ws-1',
    });

    service.createIsolatedRuntime();

    const options = getRuntimeOptions();
    expect(options.workspaceId).toBe('ws-1');
    expect(options.includeShareVisitor).toBe(true);
    expect(options.agentFactory).toEqual(expect.any(Function));
    expect(options.delegate.execSubAgent).toEqual(expect.any(Function));
    expect(options.delegate.execVirtualSubAgent).toEqual(expect.any(Function));
    expect(options.delegate.execGroupMember).toEqual(expect.any(Function));
    expect(options.delegate.verifyShareRunStillAuthorized).toEqual(expect.any(Function));
  });

  it('applies caller overrides last without dropping the delegate', () => {
    const service = new AiAgentService(mockDb, userId);
    const streamEventManager = { publish: vi.fn() };

    service.createIsolatedRuntime({
      coordinatorOptions: { stateManager: { custom: true } },
      queueService: null,
      streamEventManager,
    } as any);

    const options = getRuntimeOptions();
    expect(options.queueService).toBeNull();
    expect(options.streamEventManager).toBe(streamEventManager);
    expect(options.coordinatorOptions).toEqual({ stateManager: { custom: true } });
    expect(options.delegate.execSubAgent).toEqual(expect.any(Function));
  });

  it('merges runtimeOptions under the caller overrides', () => {
    const snapshotStore = { kind: 'base' };
    const service = new AiAgentService(mockDb, userId, {
      runtimeOptions: {
        queueService: null,
        snapshotStore,
      },
    } as any);

    service.createIsolatedRuntime({ streamEventManager: { publish: vi.fn() } } as any);

    const options = getRuntimeOptions();
    // From runtimeOptions
    expect(options.queueService).toBeNull();
    expect(options.snapshotStore).toBe(snapshotStore);
    // From overrides
    expect(options.streamEventManager).toBeDefined();
    expect(options.delegate.execSubAgent).toEqual(expect.any(Function));
  });

  it('still wraps an overriding agentFactory with the graph-aware factory', () => {
    const service = new AiAgentService(mockDb, userId);
    const upstreamAgent = { runner: vi.fn() };
    const upstreamFactory = vi.fn(function () {
      return upstreamAgent;
    });

    service.createIsolatedRuntime({ agentFactory: upstreamFactory } as any);

    const agentFactory = getRuntimeOptions().agentFactory;
    const config = {
      agentConfig: { agencyConfig: { enableGraphMode: true, graph: {} } },
      operationId: 'op-1',
    };
    const agent = agentFactory(config);

    expect(agent).toBe(upstreamAgent);
    expect(upstreamFactory).toHaveBeenCalledWith(config);
  });
});
