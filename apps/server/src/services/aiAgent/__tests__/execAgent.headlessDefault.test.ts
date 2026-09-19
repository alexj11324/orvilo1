import type * as ModelBankModule from 'model-bank';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AiAgentService } from '../index';

const { mockCreateOperation, mockDispatchHeteroAgent, mockGetAgentConfig, mockMessageCreate } =
  vi.hoisted(() => ({
    mockCreateOperation: vi.fn(),
    mockDispatchHeteroAgent: vi.fn(),
    mockGetAgentConfig: vi.fn(),
    mockMessageCreate: vi.fn(),
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
      query: vi.fn().mockResolvedValue([]),
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

// Every execAgent run dispatches through ACP — stub the dispatch boundary so
// the tests assert what execAgent threads into it.
vi.mock('../pipeline/heteroDispatch', () => ({
  dispatchHeteroAgent: mockDispatchHeteroAgent,
}));

vi.mock('@/server/services/market', () => ({
  MarketService: vi.fn().mockImplementation(function () {
    return {
      getOrviloSkillManifests: vi.fn().mockResolvedValue([]),
    };
  }),
}));

vi.mock('@/server/services/composio', () => ({
  ComposioService: vi.fn().mockImplementation(function () {
    return {
      getComposioManifests: vi.fn().mockResolvedValue([]),
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
  createServerAgentToolsEngine: vi.fn().mockReturnValue({
    generateToolsDetailed: vi.fn().mockReturnValue({ enabledToolIds: [], tools: [] }),
    getEnabledPluginManifests: vi.fn().mockReturnValue(new Map()),
  }),
  serverMessagesEngine: vi.fn().mockResolvedValue([{ content: 'test', role: 'user' }]),
}));

vi.mock('@/server/services/deviceGateway', () => ({
  deviceGateway: {
    isConfigured: false,
    queryDeviceList: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/server/modules/ModelRuntime', () => ({
  initModelRuntimeFromDB: vi.fn(),
}));

vi.mock('model-bank', async (importOriginal) => {
  const actual = await importOriginal<typeof ModelBankModule>();
  return {
    ...actual,
    ORVILO_DEFAULT_MODEL_LIST: [
      {
        abilities: { functionCall: true, video: false, vision: true },
        id: 'gpt-4',
        providerId: 'openai',
      },
    ],
  };
});

// `userInterventionConfig` (headless/manual/allow-list approval modes) was a
// knob of the retired in-process loop; under ACP the harness owns its own
// permission posture, so those cases are gone. What remains here is the
// dispatch-boundary wiring execAgent still owes callers.
describe('AiAgentService.execAgent - dispatch wiring', () => {
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
      plugins: [],
      provider: 'openai',
      systemRole: '',
    });
    mockDispatchHeteroAgent.mockResolvedValue({
      autoStarted: true,
      operationId: 'op-123',
      success: true,
      topicId: 'topic-1',
    });
    service = new AiAgentService(mockDb, userId);
  });

  it('threads beforeOperationStart into the dispatch commit window', async () => {
    const order: string[] = [];
    const beforeOperationStart = vi.fn(async () => {
      order.push('persisted');
    });
    // The dispatch boundary invokes the callback inside the operation's
    // commit window (after the id is minted, before the durable row exists);
    // emulating that here proves execAgent threads the callback through.
    mockDispatchHeteroAgent.mockImplementationOnce(async (_deps, _ctx, input) => {
      await input.beforeOperationStart?.({ operationId: 'op_minted_1', topicId: 'topic-1' });
      order.push('dispatched');
      return {
        autoStarted: true,
        operationId: 'op-123',
        success: true,
        topicId: 'topic-1',
      };
    });

    await service.execAgent({ agentId: 'agent-1', beforeOperationStart, prompt: 'Hello' });

    expect(beforeOperationStart).toHaveBeenCalledWith({
      operationId: expect.stringContaining('op_'),
      topicId: 'topic-1',
    });
    expect(order).toEqual(['persisted', 'dispatched']);
  });

  it('forwards clientIp / userAgent to the dispatch input when provided', async () => {
    await service.execAgent({
      agentId: 'agent-1',
      clientIp: '203.0.113.7',
      prompt: 'Hello',
      userAgent: 'Mozilla/5.0 (Test)',
    });

    expect(mockDispatchHeteroAgent).toHaveBeenCalledTimes(1);
    const dispatchInput = mockDispatchHeteroAgent.mock.calls[0][2];
    expect(dispatchInput).toMatchObject({
      clientIp: '203.0.113.7',
      userAgent: 'Mozilla/5.0 (Test)',
    });
  });

  it('leaves clientIp / userAgent undefined on the dispatch input when not provided', async () => {
    await service.execAgent({
      agentId: 'agent-1',
      prompt: 'Hello',
    });

    expect(mockDispatchHeteroAgent).toHaveBeenCalledTimes(1);
    const dispatchInput = mockDispatchHeteroAgent.mock.calls[0][2];
    expect(dispatchInput.clientIp).toBeUndefined();
    expect(dispatchInput.userAgent).toBeUndefined();
  });
});
