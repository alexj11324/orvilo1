import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentRuntimeService } from '@/server/services/agentExecution';

import { AiAgentService } from '../index';

vi.mock('@/libs/trusted-client', () => ({
  generateTrustedClientToken: vi.fn().mockReturnValue(undefined),
  getTrustedClientTokenForSession: vi.fn().mockResolvedValue(undefined),
  isTrustedClientEnabled: vi.fn().mockReturnValue(false),
}));

vi.mock('@/server/services/agentExecution', () => ({
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

  it('builds the primary runtime with workspace + share-visitor scoping', () => {
    new AiAgentService(mockDb, userId, { workspaceId: 'ws-1' });

    const options = getRuntimeOptions();
    expect(options.workspaceId).toBe('ws-1');
    expect(options.includeShareVisitor).toBe(false);
  });

  it('pins workspaceId and includeShareVisitor on isolated runtimes', () => {
    const service = new AiAgentService(mockDb, userId, {
      includeShareVisitor: true,
      workspaceId: 'ws-1',
    });

    service.createIsolatedRuntime();

    const options = getRuntimeOptions();
    expect(options.workspaceId).toBe('ws-1');
    expect(options.includeShareVisitor).toBe(true);
  });

  it('merges runtimeOptions under caller overrides', () => {
    const stateManager = { kind: 'base' };
    const streamEventManager = { publish: vi.fn() };
    const service = new AiAgentService(mockDb, userId, {
      runtimeOptions: { stateManager },
    } as any);

    service.createIsolatedRuntime({ streamEventManager } as any);

    const options = getRuntimeOptions();
    expect(options.stateManager).toBe(stateManager);
    expect(options.streamEventManager).toBe(streamEventManager);
  });

  it('pins workspaceId/includeShareVisitor even when overridden', () => {
    const service = new AiAgentService(mockDb, userId, { workspaceId: 'ws-1' });

    service.createIsolatedRuntime({
      includeShareVisitor: true,
      workspaceId: 'other-ws',
    } as any);

    const options = getRuntimeOptions();
    expect(options.workspaceId).toBe('ws-1');
    expect(options.includeShareVisitor).toBe(false);
  });
});
