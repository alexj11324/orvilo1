import { buildHeteroExecArgs } from '@orvilo/types';
import type * as ModelBankModule from 'model-bank';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AiAgentService } from '../index';

// Use vi.hoisted to ensure mock functions are available before vi.mock runs
const {
  mockDispatchHeteroAgent,
  mockMessageCreate,
  mockTopicCreate,
  mockTopicFind,
  mockAgentConfig,
} = vi.hoisted(() => ({
  mockDispatchHeteroAgent: vi.fn(),
  mockMessageCreate: vi.fn(),
  mockTopicCreate: vi.fn(),
  mockTopicFind: vi.fn(),
  mockAgentConfig: vi.fn(),
}));

// Mock trusted client to avoid server-side env access
vi.mock('@/libs/trusted-client', () => ({
  generateTrustedClientToken: vi.fn().mockReturnValue(undefined),
  getTrustedClientTokenForSession: vi.fn().mockResolvedValue(undefined),
  isTrustedClientEnabled: vi.fn().mockReturnValue(false),
}));

vi.mock('@/database/models/message', () => ({
  MessageModel: vi.fn().mockImplementation(function () {
    return {
      create: mockMessageCreate,
      // Resume validation reads the parent message and asserts topic ownership.
      findById: vi.fn().mockResolvedValue({
        id: 'msg_parent00001',
        role: 'assistant',
        topicId: 'topic-1',
      }),
      getLatestNonToolMessageId: vi.fn().mockResolvedValue(undefined),
      getLatestSpineMessageId: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    };
  }),
}));

// A CLI binding keeps the run on the ACP surface the pin assertions below
// exercise (builtin orvilo = Prime resolves no selector model at all).
const agentRow = {
  agencyConfig: { heterogeneousProvider: { type: 'claude-code' } },
  chatConfig: {},
  files: [],
  id: 'agent-1',
  knowledgeBases: [],
  model: 'gpt-4',
  plugins: [],
  provider: 'openai',
  systemRole: 'You are a helpful assistant',
};

vi.mock('@/database/models/agent', () => ({
  AgentModel: vi.fn().mockImplementation(function () {
    return {
      getAgentConfig: mockAgentConfig,
      queryAgents: vi.fn().mockResolvedValue([]),
    };
  }),
}));

vi.mock('@/server/services/agent', () => ({
  AgentService: vi.fn().mockImplementation(function () {
    return {
      getAgentConfig: mockAgentConfig,
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
      armScheduledRun: vi.fn().mockResolvedValue(undefined),
      create: mockTopicCreate,
      findById: mockTopicFind,
      findShareVisitorTopicIds: vi.fn().mockResolvedValue([]),
      releaseTaskCallbackReservation: vi.fn().mockResolvedValue(undefined),
      tryReserveTaskCallback: vi.fn().mockResolvedValue(true),
      updateMetadata: vi.fn().mockResolvedValue(undefined),
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

vi.mock('@/database/models/chatGroup', () => ({
  ChatGroupModel: vi.fn().mockImplementation(function () {
    return {
      findById: vi.fn().mockResolvedValue(undefined),
      getGroupAgentsWithMeta: vi.fn().mockResolvedValue([]),
    };
  }),
}));

vi.mock('@/server/services/agentExecution', () => ({
  AgentRuntimeService: vi.fn().mockImplementation(function () {
    return {
      createOperation: vi.fn().mockResolvedValue({
        autoStarted: true,
        messageId: 'queue-msg-1',
        operationId: 'op-123',
        success: true,
      }),
    };
  }),
}));

// Every execAgent run dispatches through ACP — stub the dispatch boundary so
// these tests exercise topic pinning without touching the gateway/sandbox.
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
  initModelRuntimeFromDeploymentRuntime: vi.fn(),
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

/**
 * A blank composer's picks (`composerModelSelection` / `composerHeteroEffort`)
 * reach the server on `newTopicPins` — the gateway path is the one route where
 * the SERVER creates the topic, so the client has no row of its own to stamp.
 * They are a TOPIC pin (spec docs/development/chat-agent-model-ia.md §5.2): the
 * `topics.model`/`topics.provider` columns plus `metadata.heteroEffort`, never
 * an agent-row write.
 */
describe('AiAgentService.execAgent - blank-composer new-topic pins', () => {
  let service: AiAgentService;
  const mockDb = {} as any;
  const userId = 'test-user-id';

  beforeEach(() => {
    vi.clearAllMocks();
    mockTopicFind.mockResolvedValue(undefined);
    mockAgentConfig.mockImplementation(async () => ({ ...agentRow }));
    mockMessageCreate.mockResolvedValue({ id: 'msg-1' });
    mockTopicCreate.mockImplementation(async (_params: unknown, id?: string) => ({
      id: id ?? 'topic-server-minted',
    }));
    mockDispatchHeteroAgent.mockResolvedValue({
      autoStarted: true,
      operationId: 'op-123',
      success: true,
      topicId: 'topic-1',
    });

    service = new AiAgentService(mockDb, userId);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('writes the picks onto the topic this run creates and runs on them', async () => {
    await service.execAgent({
      agentId: 'agent-1',
      newTopicPins: { effort: 'high', model: 'opus', provider: 'claude-code' },
      prompt: 'Fresh send',
    });

    // The topic is born with the pick, not with the agent's selector model.
    expect(mockTopicCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ heteroEffort: 'high' }),
        model: 'opus',
        provider: 'claude-code',
      }),
      undefined,
    );

    // …and the FIRST turn executes what the row now says. Without this the
    // conversation would be labelled `opus` while running the agent default.
    const [, runContext, dispatchOptions] = mockDispatchHeteroAgent.mock.calls[0];
    expect(runContext).toMatchObject({ model: 'opus', provider: 'claude-code' });
    expect(dispatchOptions.pinnedHeterogeneousTopicModel).toEqual({
      effort: 'high',
      model: 'opus',
      provider: 'claude-code',
    });
  });

  it.each([null, 'legacy-default-model'])(
    'runs the first Prime turn on its pinned inference model with legacy model %s',
    async (legacyModel) => {
      mockAgentConfig.mockResolvedValue({
        ...agentRow,
        model: legacyModel,
        provider: null,
        agencyConfig: {
          executionTarget: 'device',
          boundDeviceId: 'device-1',
          heterogeneousProvider: { type: 'orvilo', model: 'fixture-prime-model' },
        },
      });
      await service.execAgent({ agentId: 'agent-1', prompt: 'First Prime turn' });
      const topic = mockTopicCreate.mock.calls[0][0];
      const runContext = mockDispatchHeteroAgent.mock.calls[0][1];
      expect(topic.model).toBe('fixture-prime-model');
      expect(runContext.model).toBe(topic.model);
      expect(runContext.provider).toBe('orvilo');
    },
  );

  it('keeps an explicit Prime run model override ahead of the Agent inference default', async () => {
    mockAgentConfig.mockResolvedValue({
      ...agentRow,
      agencyConfig: { heterogeneousProvider: { type: 'orvilo', model: 'fixture-prime-model' } },
    });
    await service.execAgent({
      agentId: 'agent-1',
      model: 'explicit-prime-model',
      provider: 'orvilo',
      prompt: 'Explicit Prime turn',
    });
    expect(mockDispatchHeteroAgent.mock.calls[0][1].model).toBe('explicit-prime-model');
  });

  it('leaves the agent-config snapshot untouched when the composer made no pick', async () => {
    await service.execAgent({ agentId: 'agent-1', prompt: 'Fresh send' });

    // `claude-code`'s static selector table resolves to the `default` alias —
    // the exact pre-existing value this change must not disturb.
    expect(mockTopicCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'default', provider: 'claude-code' }),
      undefined,
    );
    expect(mockTopicCreate.mock.calls[0][0].metadata?.heteroEffort).toBeUndefined();
    expect(mockDispatchHeteroAgent.mock.calls[0][2].pinnedHeterogeneousTopicModel).toBeUndefined();
  });

  it('pins an effort-only pick without moving the model', async () => {
    await service.execAgent({
      agentId: 'agent-1',
      newTopicPins: { effort: 'low' },
      prompt: 'Fresh send',
    });

    expect(mockTopicCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ heteroEffort: 'low' }),
        model: 'default',
        provider: 'claude-code',
      }),
      undefined,
    );
    expect(mockDispatchHeteroAgent.mock.calls[0][2].pinnedHeterogeneousTopicModel).toEqual({
      effort: 'low',
    });
  });

  it('ignores the picks when the run reuses an existing topic', async () => {
    await service.execAgent({
      agentId: 'agent-1',
      appContext: { topicId: 'topic-1' },
      newTopicPins: { effort: 'high', model: 'opus', provider: 'claude-code' },
      prompt: 'Continue',
    });

    // Nothing to create, and an open conversation keeps its own pins — the
    // composer pick only ever describes the topic this send starts.
    expect(mockTopicCreate).not.toHaveBeenCalled();
    expect(mockDispatchHeteroAgent.mock.calls[0][2].pinnedHeterogeneousTopicModel).toBeUndefined();
  });

  it('dispatches the existing conversation ACP permission instead of the Agent default', async () => {
    mockTopicFind.mockResolvedValue({
      id: 'topic-1',
      metadata: {
        executionConfig: {
          executionTarget: 'device',
          boundDeviceId: 'device-1',
          permission: { provider: 'claude-code', configId: 'permission_mode', value: 'plan' },
        },
      },
    });
    await service.execAgent({
      agentId: 'agent-1',
      appContext: { topicId: 'topic-1' },
      prompt: 'Continue',
    });
    const provider = mockDispatchHeteroAgent.mock.calls[0][2].heterogeneousProvider;
    expect(provider.permission).toEqual({ configId: 'permission_mode', value: 'plan' });
    expect(buildHeteroExecArgs(provider)).toEqual(
      expect.arrayContaining([
        '--acp-permission-id',
        'permission_mode',
        '--acp-permission-value',
        'plan',
      ]),
    );
  });

  it('drops the picks on a resume-like replay', async () => {
    await service.execAgent({
      agentId: 'agent-1',
      appContext: { topicId: 'topic-1' },
      newTopicPins: { effort: 'high', model: 'opus', provider: 'claude-code' },
      parentMessageId: 'msg_parent00001',
      prompt: 'Regenerate',
      resume: true,
    });

    expect(mockTopicCreate).not.toHaveBeenCalled();
    expect(mockDispatchHeteroAgent.mock.calls[0][2].pinnedHeterogeneousTopicModel).toBeUndefined();
  });
});
