import type * as ModelBankModule from 'model-bank';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AiAgentService } from '../index';

const {
  mockCreateOperation,
  mockCreateServerAgentToolsEngine,
  mockDispatchHeteroAgent,
  mockGetAgentConfig,
  mockGetComposioManifests,
  mockGetOrviloSkillManifests,
  mockMessageCreate,
  mockPluginQuery,
} = vi.hoisted(() => ({
  mockCreateOperation: vi.fn(),
  mockDispatchHeteroAgent: vi.fn(),
  mockCreateServerAgentToolsEngine: vi.fn().mockReturnValue({
    generateToolsDetailed: vi.fn().mockReturnValue({ enabledToolIds: [], tools: [] }),
    getEnabledPluginManifests: vi.fn().mockReturnValue(new Map()),
  }),
  mockGetAgentConfig: vi.fn(),
  mockGetComposioManifests: vi.fn().mockResolvedValue([]),
  mockGetOrviloSkillManifests: vi.fn().mockResolvedValue([]),
  mockMessageCreate: vi.fn(),
  mockPluginQuery: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/libs/trusted-client', () => ({
  generateTrustedClientToken: vi.fn().mockReturnValue(undefined),
  getTrustedClientTokenForSession: vi.fn().mockResolvedValue(undefined),
  isTrustedClientEnabled: vi.fn().mockReturnValue(false),
}));

vi.mock('@/database/models/message', () => ({
  MessageModel: vi.fn().mockImplementation(function () {
    return {
      create: mockMessageCreate,
      getLatestNonToolMessageId: vi.fn().mockResolvedValue(undefined),
      getLatestSpineMessageId: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    };
  }),
}));

vi.mock('@/database/models/agent', () => ({
  AgentModel: vi.fn().mockImplementation(function () {
    return {
      getAgentConfig: vi.fn(),
      queryAgents: vi.fn().mockResolvedValue([]),
    };
  }),
}));

vi.mock('@/server/services/agent', () => ({
  AgentService: vi.fn().mockImplementation(function () {
    return {
      getAgentConfig: mockGetAgentConfig,
    };
  }),
}));

vi.mock('@/database/models/plugin', () => ({
  PluginModel: vi.fn().mockImplementation(function () {
    return {
      query: mockPluginQuery,
    };
  }),
}));

vi.mock('@/database/models/connector', () => ({
  ConnectorModel: vi.fn().mockImplementation(function () {
    return {
      queryByIdentifiers: vi.fn().mockResolvedValue([]),
      resolveByIdentifiers: vi.fn().mockResolvedValue([]),
    };
  }),
}));

vi.mock('@/database/models/connectorTool', () => ({
  ConnectorToolModel: vi.fn().mockImplementation(function () {
    return {
      queryByConnector: vi.fn().mockResolvedValue([]),
      queryByConnectorIds: vi.fn().mockResolvedValue([]),
      queryAllByConnectorIds: vi.fn().mockResolvedValue([]),
    };
  }),
}));

vi.mock('@/database/models/topic', () => ({
  TopicModel: vi.fn().mockImplementation(function () {
    return {
      releaseTaskCallbackReservation: vi.fn().mockResolvedValue(undefined),
      tryReserveTaskCallback: vi.fn().mockResolvedValue(true),
      create: vi.fn().mockResolvedValue({ id: 'topic-1' }),
      findById: vi.fn().mockResolvedValue(null),
      findShareVisitorTopicIds: vi.fn().mockResolvedValue([]),
    };
  }),
}));

vi.mock('@/database/models/thread', () => ({
  ThreadModel: vi.fn().mockImplementation(function () {
    return {
      create: vi.fn(),
      findById: vi.fn(),
      update: vi.fn(),
    };
  }),
}));

vi.mock('@/server/services/agentRuntime', () => ({
  AgentRuntimeService: vi.fn().mockImplementation(function () {
    return {
      createOperation: mockCreateOperation,
    };
  }),
}));

// Every execAgent run dispatches through ACP — stub the dispatch boundary and
// assert on the tool surface carried into it (`builtinToolSpecs`).
vi.mock('../pipeline/heteroDispatch', () => ({
  dispatchHeteroAgent: mockDispatchHeteroAgent,
}));

vi.mock('@/server/services/market', () => ({
  MarketService: vi.fn().mockImplementation(function () {
    return {
      getOrviloSkillManifests: mockGetOrviloSkillManifests,
    };
  }),
}));

vi.mock('@/server/services/composio', () => ({
  ComposioService: vi.fn().mockImplementation(function () {
    return {
      getComposioManifests: mockGetComposioManifests,
    };
  }),
}));

vi.mock('@/server/services/file', () => ({
  FileService: vi.fn().mockImplementation(function () {
    return {
      uploadFromUrl: vi.fn(),
    };
  }),
}));

vi.mock('@/server/modules/Mecha', () => ({
  createServerAgentToolsEngine: mockCreateServerAgentToolsEngine,
  serverMessagesEngine: vi.fn().mockResolvedValue([{ content: 'test', role: 'user' }]),
}));

vi.mock('@/server/services/deviceGateway', () => ({
  deviceGateway: {
    isConfigured: false,
    queryDeviceList: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/server/modules/ModelRuntime', () => ({
  initModelRuntimeFromDeploymentConfig: vi.fn(),
}));

vi.mock('model-bank', async (importOriginal) => {
  const actual = await importOriginal<typeof ModelBankModule>();
  return {
    ...actual,
    ORVILO_DEFAULT_MODEL_LIST: [
      {
        abilities: { functionCall: true },
        id: 'gpt-4',
        providerId: 'openai',
      },
    ],
  };
});

describe('AiAgentService.execAgent - disableTools', () => {
  let service: AiAgentService;
  const mockDb = {} as any;
  const userId = 'test-user-id';

  beforeEach(() => {
    vi.clearAllMocks();
    mockMessageCreate.mockResolvedValue({ id: 'msg-1' });
    mockCreateOperation.mockResolvedValue({
      autoStarted: true,
      messageId: 'queue-msg-1',
      operationId: 'op-123',
      success: true,
    });
    mockGetAgentConfig.mockResolvedValue({
      chatConfig: {},
      id: 'agent-1',
      model: 'gpt-4',
      plugins: ['orvilo-task'],
      provider: 'openai',
      systemRole: 'You are a helper',
    });
    mockDispatchHeteroAgent.mockResolvedValue({
      autoStarted: true,
      operationId: 'op-123',
      success: true,
      topicId: 'topic-1',
    });
    service = new AiAgentService(mockDb, userId);
  });

  it('should skip all tool discovery when disableTools is true', async () => {
    await service.execAgent({
      agentId: 'agent-1',
      disableTools: true,
      prompt: 'Hello',
    } as any);

    // Plugin DB query should NOT be called
    expect(mockPluginQuery).not.toHaveBeenCalled();

    // Manifest fetches should NOT be called
    expect(mockGetOrviloSkillManifests).not.toHaveBeenCalled();
    expect(mockGetComposioManifests).not.toHaveBeenCalled();

    // ToolsEngine should NOT be created
    expect(mockCreateServerAgentToolsEngine).not.toHaveBeenCalled();

    // The run still dispatches, with an empty builtin tool surface.
    expect(mockDispatchHeteroAgent).toHaveBeenCalledTimes(1);
    const dispatchInput = mockDispatchHeteroAgent.mock.calls[0][2];
    expect(dispatchInput.builtinToolSpecs).toEqual([]);
  });

  it('should mount server-runnable builtin tools when disableTools is not set', async () => {
    await service.execAgent({
      agentId: 'agent-1',
      prompt: 'Hello',
    });

    // ACP runs carry the builtin tool surface on the dispatch input — no
    // server-side tools engine / manifest fetch runs in the exec path.
    expect(mockDispatchHeteroAgent).toHaveBeenCalledTimes(1);
    const dispatchInput = mockDispatchHeteroAgent.mock.calls[0][2];
    expect(
      dispatchInput.builtinToolSpecs.map((spec: { identifier: string }) => spec.identifier),
    ).toContain('orvilo-task');
  });
});
