import type { ChatTopicMetadata } from '@orvilo/types';
import type * as ModelBankModule from 'model-bank';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AiAgentService } from '../index';

const {
  mockIsResourceAuthorOrAdmin,
  mockCreateOperation,
  mockDispatchHeteroAgent,
  mockGetAgentConfig,
  mockGroupRoster,
  mockGetPreference,
  mockMessageCreate,
  mockTopicCreate,
  mockTopicFindById,
} = vi.hoisted(() => ({
  mockIsResourceAuthorOrAdmin: vi.fn(),
  mockCreateOperation: vi.fn(),
  mockDispatchHeteroAgent: vi.fn(),
  mockGetAgentConfig: vi.fn(),
  mockGroupRoster: vi.fn(),
  mockGetPreference: vi.fn(),
  mockMessageCreate: vi.fn(),
  mockTopicCreate: vi.fn().mockResolvedValue({ id: 'topic-1' }),
  mockTopicFindById: vi.fn(),
}));

vi.mock('@/server/services/resourcePermission', () => ({
  isResourceAuthorOrAdmin: mockIsResourceAuthorOrAdmin,
}));

vi.mock('@/libs/trusted-client', () => ({
  generateTrustedClientToken: vi.fn().mockReturnValue(undefined),
  getTrustedClientTokenForSession: vi.fn().mockResolvedValue(undefined),
  isTrustedClientEnabled: vi.fn().mockReturnValue(false),
}));

vi.mock('@/database/models/chatGroup', () => ({
  ChatGroupModel: class {
    findById = vi.fn().mockResolvedValue({ id: 'group-1', title: 'Review team' });
    getGroupAgentsWithMeta = mockGroupRoster;
  },
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

vi.mock('@/database/models/workspaceUserSettings', () => ({
  WorkspaceUserSettingsModel: vi.fn().mockImplementation(function () {
    return {
      getPreference: mockGetPreference,
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

// Builtin agents inject their own tools, so a run under a builtin slug reaches
// connector resolution that the plain-agent cases never do.
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
      queryAllByConnectorIds: vi.fn().mockResolvedValue([]),
      queryByConnector: vi.fn().mockResolvedValue([]),
      queryByConnectorIds: vi.fn().mockResolvedValue([]),
    };
  }),
}));

vi.mock('@/database/models/topic', () => ({
  TopicModel: vi.fn().mockImplementation(function () {
    return {
      findShareVisitorTopicIds: vi.fn().mockResolvedValue([]),
      releaseTaskCallbackReservation: vi.fn().mockResolvedValue(undefined),
      tryReserveTaskCallback: vi.fn().mockResolvedValue(true),
      create: mockTopicCreate,
      armScheduledRun: vi.fn().mockResolvedValue(undefined),
      findById: mockTopicFindById,
      updateMetadata: vi.fn(async (_id: string, metadata: ChatTopicMetadata) => [{ metadata }]),
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

vi.mock('@/server/services/agentExecution', () => ({
  AgentRuntimeService: vi.fn().mockImplementation(function () {
    return {
      createOperation: mockCreateOperation,
    };
  }),
}));

// Every execAgent run dispatches through ACP — the dispatch mock's second
// argument is the ExecRunContext (resolved agentConfig + effective
// model/provider), so model/mode resolution is asserted at that boundary.
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
      {
        abilities: { functionCall: true, video: false, vision: true },
        id: 'claude-sonnet-4-6',
        providerId: 'anthropic',
      },
    ],
  };
});

describe('AiAgentService.execAgent - saved model/provider', () => {
  let service: AiAgentService;
  const mockDb = {} as any;
  const userId = 'test-user-id';

  const defaultAgentConfig = {
    chatConfig: {},
    id: 'agent-1',
    model: 'gpt-4',
    plugins: [],
    provider: 'openai',
    slug: 'my-agent',
    systemRole: 'You are a helpful assistant.',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockMessageCreate.mockResolvedValue({ id: 'msg-1' });
    mockDispatchHeteroAgent.mockResolvedValue({
      autoStarted: true,
      operationId: 'op-123',
      success: true,
      topicId: 'topic-1',
    });
    mockGroupRoster.mockResolvedValue([
      { agentId: 'agent-1', role: 'supervisor', title: 'Coordinator' },
    ]);
    mockGetPreference.mockResolvedValue({});
    mockIsResourceAuthorOrAdmin.mockResolvedValue(false);
    mockTopicFindById.mockResolvedValue(null);
    service = new AiAgentService(mockDb, userId);
  });

  it('ignores legacy per-run model and provider values', async () => {
    mockGetAgentConfig.mockResolvedValue({ ...defaultAgentConfig });
    const request = {
      agentId: 'agent-1',
      model: 'other-model',
      provider: 'anthropic',
      prompt: 'Hello',
    };
    await service.execAgent(request);
    const run = mockDispatchHeteroAgent.mock.calls[0][1];
    expect(run.agentConfig).toMatchObject({ model: 'gpt-4', provider: 'openai' });
    expect(run.model).toBe('gpt-4');
  });

  it('ignores member model and device preferences while preserving member mode', async () => {
    mockGetAgentConfig.mockResolvedValue({
      ...defaultAgentConfig,
      agencyConfig: { executionTarget: 'device', boundDeviceId: 'saved-device' },
      chatConfig: { enableAgentMode: true },
      visibility: 'public',
      userId: 'agent-author',
    });
    mockGetPreference.mockResolvedValue({
      agentModelOverrides: { 'agent-1': { model: 'other-model', provider: 'anthropic' } },
      agentDeviceOverrides: {
        'agent-1': { executionTarget: 'local', boundDeviceId: 'member-device' },
      },
      agentModeOverrides: { 'agent-1': false },
    });
    service = new AiAgentService(mockDb, userId, { workspaceId: 'workspace-1' });
    await service.execAgent({ agentId: 'agent-1', prompt: 'Hello' });
    expect(mockDispatchHeteroAgent.mock.calls[0][1].agentConfig).toMatchObject({
      model: 'gpt-4',
      provider: 'openai',
      agencyConfig: { executionTarget: 'device', boundDeviceId: 'saved-device' },
      chatConfig: { enableAgentMode: false },
    });
  });

  it.each(['group', 'scheduled'])('precreates a %s topic without model snapshots', async (kind) => {
    mockGetAgentConfig.mockResolvedValue({ ...defaultAgentConfig });
    const runSpy = vi
      .spyOn(service, 'execAgent')
      .mockResolvedValue({} as Awaited<ReturnType<AiAgentService['execAgent']>>);
    try {
      if (kind === 'group') {
        await service.execGroupAgent({ agentId: 'agent-1', groupId: 'group-1', message: 'Group' });
      } else {
        await service.scheduleAgentRun({
          agentId: 'agent-1',
          prompt: 'Scheduled',
          runAt: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      expect(mockTopicCreate.mock.calls[0][0]).not.toHaveProperty('model');
      expect(mockTopicCreate.mock.calls[0][0]).not.toHaveProperty('provider');
    } finally {
      runSpy.mockRestore();
    }
  });
});

describe('AiAgentService.execAgent - toolModeOverride (/mode command)', () => {
  let service: AiAgentService;
  const mockDb = {} as any;
  const userId = 'test-user-id';

  const defaultAgentConfig = {
    chatConfig: {},
    id: 'agent-1',
    model: 'gpt-4',
    plugins: [],
    provider: 'openai',
    slug: 'my-agent',
    systemRole: 'You are a helpful assistant.',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockMessageCreate.mockResolvedValue({ id: 'msg-1' });
    mockDispatchHeteroAgent.mockResolvedValue({
      autoStarted: true,
      operationId: 'op-123',
      success: true,
      topicId: 'topic-1',
    });
    mockGetPreference.mockResolvedValue({});
    mockIsResourceAuthorOrAdmin.mockResolvedValue(false);
    mockTopicFindById.mockResolvedValue(null);
    service = new AiAgentService(mockDb, userId);
  });

  it('/mode chat on an agent-mode agent also disables enableAgentMode for context injection', async () => {
    mockGetAgentConfig.mockResolvedValue({
      ...defaultAgentConfig,
      chatConfig: { enableAgentMode: true },
    });

    await service.execAgent({ agentId: 'agent-1', prompt: 'Hello', toolModeOverride: 'chat' });

    const runContext = mockDispatchHeteroAgent.mock.calls[0][1];
    expect(runContext.agentConfig.chatConfig.toolMode).toBe('chat');
    // The context engine gates agentic-only injectors on enableAgentMode, so
    // the override must flip it too — not just toolMode.
    expect(runContext.agentConfig.chatConfig.enableAgentMode).toBe(false);
  });

  it('/mode agent on a chat-default agent enables agent mode and its context', async () => {
    mockGetAgentConfig.mockResolvedValue({
      ...defaultAgentConfig,
      chatConfig: { enableAgentMode: false },
    });

    await service.execAgent({ agentId: 'agent-1', prompt: 'Hello', toolModeOverride: 'agent' });

    const runContext = mockDispatchHeteroAgent.mock.calls[0][1];
    expect(runContext.agentConfig.chatConfig.toolMode).toBe('agent');
    expect(runContext.agentConfig.chatConfig.enableAgentMode).toBe(true);
  });

  it('/mode agent preserves a custom toolMode (hand-picked toolset stays)', async () => {
    mockGetAgentConfig.mockResolvedValue({
      ...defaultAgentConfig,
      chatConfig: { toolMode: 'custom' },
    });

    await service.execAgent({ agentId: 'agent-1', prompt: 'Hello', toolModeOverride: 'agent' });

    const runContext = mockDispatchHeteroAgent.mock.calls[0][1];
    // `custom` is agent-side; widening it to `agent` would silently grant
    // tools the agent deliberately excluded.
    expect(runContext.agentConfig.chatConfig.toolMode).toBe('custom');
    expect(runContext.agentConfig.chatConfig.enableAgentMode).toBe(true);
  });

  it('/mode chat still disables tools on a custom-toolMode agent', async () => {
    mockGetAgentConfig.mockResolvedValue({
      ...defaultAgentConfig,
      chatConfig: { toolMode: 'custom' },
    });

    await service.execAgent({ agentId: 'agent-1', prompt: 'Hello', toolModeOverride: 'chat' });

    const runContext = mockDispatchHeteroAgent.mock.calls[0][1];
    expect(runContext.agentConfig.chatConfig.toolMode).toBe('chat');
    expect(runContext.agentConfig.chatConfig.enableAgentMode).toBe(false);
  });

  it('wins over the workspace member-mode override', async () => {
    mockGetAgentConfig.mockResolvedValue({
      ...defaultAgentConfig,
      chatConfig: { enableAgentMode: true },
      visibility: 'public',
    });
    mockGetPreference.mockResolvedValue({ agentModeOverrides: { 'agent-1': false } });
    service = new AiAgentService(mockDb, userId, { workspaceId: 'workspace-1' });

    await service.execAgent({ agentId: 'agent-1', prompt: 'Hello', toolModeOverride: 'agent' });

    const runContext = mockDispatchHeteroAgent.mock.calls[0][1];
    expect(runContext.agentConfig.chatConfig.toolMode).toBe('agent');
    expect(runContext.agentConfig.chatConfig.enableAgentMode).toBe(true);
  });
});
