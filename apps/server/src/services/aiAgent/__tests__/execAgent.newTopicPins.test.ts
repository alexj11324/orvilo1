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

describe('AiAgentService.execAgent - saved Agent runtime and conversation controls', () => {
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

  it('does not persist model or device snapshots on new topics', async () => {
    await service.execAgent({ agentId: 'agent-1', prompt: 'Fresh send' });
    const topic = mockTopicCreate.mock.calls[0][0];
    expect(topic).not.toHaveProperty('model');
    expect(topic).not.toHaveProperty('provider');
    expect(topic.metadata).not.toHaveProperty('boundDeviceId');
    expect(topic.metadata).not.toHaveProperty('executionConfig');
  });

  it('ignores legacy request and topic routing while retaining conversation effort', async () => {
    mockAgentConfig.mockResolvedValue({
      ...agentRow,
      agencyConfig: {
        boundDeviceId: 'saved-device',
        executionTarget: 'device',
        heterogeneousProvider: { type: 'claude-code', model: 'saved-model', effort: 'low' },
      },
    });
    mockTopicFind.mockResolvedValue({
      id: 'topic-1',
      model: 'legacy-topic-model',
      provider: 'codex',
      metadata: {
        heteroEffort: 'high',
        executionConfig: { executionTarget: 'sandbox', boundDeviceId: 'legacy-device' },
      },
    });
    const legacyRequest = {
      agentId: 'agent-1',
      appContext: { topicId: 'topic-1' },
      deviceId: 'request-device',
      model: 'request-model',
      provider: 'codex',
      newTopicPins: { model: 'new-topic-model' },
      prompt: 'Continue',
    };
    await service.execAgent(legacyRequest);
    const [, run, options] = mockDispatchHeteroAgent.mock.calls[0];
    expect(run.model).toBe('saved-model');
    expect(run.agentConfig.agencyConfig).toMatchObject({
      boundDeviceId: 'saved-device',
      executionTarget: 'device',
    });
    expect(options.heterogeneousProvider).toMatchObject({ model: 'saved-model', effort: 'high' });
  });

  it('keeps reasoning effort and working directory selected before first send', async () => {
    await service.execAgent({
      agentId: 'agent-1',
      appContext: { initialTopicMetadata: { heteroEffort: 'high', workingDirectory: '/project' } },
      prompt: 'Fresh send',
    });
    expect(mockTopicCreate.mock.calls[0][0].metadata).toMatchObject({
      heteroEffort: 'high',
      workingDirectory: '/project',
    });
    expect(mockDispatchHeteroAgent.mock.calls[0][2].heterogeneousProvider.effort).toBe('high');
  });

  it('keeps a group member on its own reasoning effort', async () => {
    mockAgentConfig.mockResolvedValue({
      ...agentRow,
      agencyConfig: { heterogeneousProvider: { type: 'claude-code', effort: 'low' } },
    });
    mockTopicFind.mockResolvedValue({
      id: 'topic-1',
      groupId: 'group-1',
      agentId: 'supervisor',
      metadata: { heteroEffort: 'high' },
    });
    await service.execAgent({
      agentId: 'agent-1',
      appContext: { topicId: 'topic-1' },
      prompt: 'Continue',
    });
    expect(mockDispatchHeteroAgent.mock.calls[0][2].heterogeneousProvider.effort).toBe('low');
  });

  it('dispatches the existing conversation ACP permission', async () => {
    mockTopicFind.mockResolvedValue({
      id: 'topic-1',
      metadata: {
        executionConfig: {
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
});
