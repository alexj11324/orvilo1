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

describe('AiAgentService.execAgent - model/provider override', () => {
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

  it('keeps an explicit Prime model override ahead of its inference default', async () => {
    mockGetAgentConfig.mockResolvedValue({
      ...defaultAgentConfig,
      agencyConfig: {
        heterogeneousProvider: { model: 'fixture-prime-model', type: 'orvilo' },
      },
    });
    await service.execAgent({
      agentId: 'agent-1',
      model: 'explicit-prime-model',
      prompt: 'Explicit Prime turn',
      provider: 'orvilo',
    });
    expect(mockDispatchHeteroAgent.mock.calls[0][1].model).toBe('explicit-prime-model');
  });

  it('should use agent default model/provider when no override is provided', async () => {
    mockGetAgentConfig.mockResolvedValue({ ...defaultAgentConfig });

    await service.execAgent({
      agentId: 'agent-1',
      prompt: 'Hello',
    });

    expect(mockDispatchHeteroAgent).toHaveBeenCalledTimes(1);
    const runContext = mockDispatchHeteroAgent.mock.calls[0][1];
    expect(runContext.agentConfig.model).toBe('gpt-4');
    expect(runContext.agentConfig.provider).toBe('openai');
  });

  // Under ACP the topic pin is the execution binding (CLI family + selector
  // model), not the member's chat-model pick — the binding resolves at
  // precreate time from the member-selected config.
  it.each(['group', 'scheduled'])(
    'pins the member-selected execution binding when precreating a %s topic',
    async (kind) => {
      mockGetAgentConfig.mockResolvedValue({
        ...defaultAgentConfig,
        agencyConfig: {
          heterogeneousProvider: { type: 'claude-code' },
          modelSelectionPolicy: 'member',
        },
        userId: 'agent-author',
        visibility: 'public',
        workspaceId: 'workspace-1',
      });
      mockGetPreference.mockResolvedValue({
        agentModelOverrides: { 'agent-1': { model: 'claude-sonnet-4-6', provider: 'anthropic' } },
      });
      service = new AiAgentService(mockDb, userId, { workspaceId: 'workspace-1' });
      const runSpy = vi
        .spyOn(service, 'execAgent')
        .mockResolvedValue({} as Awaited<ReturnType<AiAgentService['execAgent']>>);
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
      runSpy.mockRestore();
    },
  );

  it('should override model when model param is provided', async () => {
    mockGetAgentConfig.mockResolvedValue({ ...defaultAgentConfig });

    await service.execAgent({
      agentId: 'agent-1',
      model: 'claude-sonnet-4-6',
      prompt: 'Hello',
    });

    expect(mockDispatchHeteroAgent).toHaveBeenCalledTimes(1);
    const runContext = mockDispatchHeteroAgent.mock.calls[0][1];
    expect(runContext.agentConfig.model).toBe('claude-sonnet-4-6');
    expect(runContext.agentConfig.provider).toBe('openai'); // provider unchanged
  });

  it('should override provider when provider param is provided', async () => {
    mockGetAgentConfig.mockResolvedValue({ ...defaultAgentConfig });

    await service.execAgent({
      agentId: 'agent-1',
      prompt: 'Hello',
      provider: 'anthropic',
    });

    expect(mockDispatchHeteroAgent).toHaveBeenCalledTimes(1);
    const runContext = mockDispatchHeteroAgent.mock.calls[0][1];
    expect(runContext.agentConfig.model).toBe('gpt-4'); // model unchanged
    expect(runContext.agentConfig.provider).toBe('anthropic');
  });

  it('should override both model and provider when both params are provided', async () => {
    mockGetAgentConfig.mockResolvedValue({ ...defaultAgentConfig });

    await service.execAgent({
      agentId: 'agent-1',
      model: 'claude-sonnet-4-6',
      prompt: 'Hello',
      provider: 'anthropic',
    });

    expect(mockDispatchHeteroAgent).toHaveBeenCalledTimes(1);
    const runContext = mockDispatchHeteroAgent.mock.calls[0][1];
    expect(runContext.agentConfig.model).toBe('claude-sonnet-4-6');
    expect(runContext.agentConfig.provider).toBe('anthropic');
  });

  it('keeps group members on their own model instead of the supervisor topic pin', async () => {
    mockGroupRoster.mockResolvedValue([
      { agentId: 'supervisor', role: 'supervisor', title: 'Coordinator' },
      { agentId: 'agent-1', role: 'participant', title: 'Reviewer' },
    ]);
    mockGetAgentConfig.mockResolvedValue({ ...defaultAgentConfig });
    mockTopicFindById.mockResolvedValue({
      agentId: 'supervisor',
      groupId: 'group-1',
      model: 'supervisor-model',
      provider: 'anthropic',
      metadata: { heteroEffort: 'high' },
    });

    await service.execAgent({
      agentId: 'agent-1',
      appContext: {
        topicId: 'topic-1',
        groupId: 'group-1',
        orchestrationRole: 'member',
        scope: 'group',
      },
      prompt: 'Hello',
    });

    expect(mockDispatchHeteroAgent.mock.calls[0][1].agentConfig).toMatchObject({
      model: 'gpt-4',
      provider: 'openai',
    });
  });

  it('keeps an explicit model override over the topic model', async () => {
    mockGetAgentConfig.mockResolvedValue({ ...defaultAgentConfig });
    mockTopicFindById.mockResolvedValue({ model: 'gpt-5.6-terra', provider: 'openai' });

    await service.execAgent({
      agentId: 'agent-1',
      appContext: { topicId: 'topic-1' },
      model: 'step-3.7-flash',
      prompt: 'Hello',
      provider: 'stepfun',
    });

    const runContext = mockDispatchHeteroAgent.mock.calls[0][1];
    expect(runContext.agentConfig.model).toBe('step-3.7-flash');
    expect(runContext.agentConfig.provider).toBe('stepfun');
    expect(runContext.model).toBe('step-3.7-flash');
    expect(runContext.provider).toBe('stepfun');
  });

  it('uses the saved Agent provider when an internal sub-agent overrides only model', async () => {
    mockGetAgentConfig.mockResolvedValue({ ...defaultAgentConfig });
    mockTopicFindById.mockResolvedValue({ model: 'gpt-5.6-terra', provider: 'stepfun' });

    await service.execAgent({
      agentId: 'agent-1',
      appContext: { topicId: 'topic-1' },
      model: 'step-3.7-flash',
      prompt: 'Hello',
    });

    const runContext = mockDispatchHeteroAgent.mock.calls[0][1];
    expect(runContext.model).toBe('step-3.7-flash');
    expect(runContext.provider).toBe('openai');
  });

  it('ignores member model overrides for a Workspace admin', async () => {
    mockIsResourceAuthorOrAdmin.mockResolvedValue(true);
    mockGetAgentConfig.mockResolvedValue({
      ...defaultAgentConfig,
      agencyConfig: { modelSelectionPolicy: 'member' },
      chatConfig: { enableAgentMode: true },
      userId: 'agent-author',
      visibility: 'public',
      workspaceId: 'workspace-1',
    });
    mockGetPreference.mockResolvedValue({
      agentModelOverrides: {
        'agent-1': { model: 'claude-sonnet-4-6', provider: 'anthropic' },
      },
      agentModeOverrides: { 'agent-1': false },
    });
    service = new AiAgentService(mockDb, userId, { workspaceId: 'workspace-1' });

    await service.execAgent({ agentId: 'agent-1', prompt: 'Hello' });

    const runContext = mockDispatchHeteroAgent.mock.calls[0][1];
    expect(runContext.agentConfig.model).toBe('gpt-4');
    expect(runContext.agentConfig.provider).toBe('openai');
    expect(runContext.agentConfig.chatConfig.enableAgentMode).toBe(true);
    expect(mockIsResourceAuthorOrAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ userId, workspaceId: 'workspace-1' }),
    );
  });

  it('ignores the caller model preference when the workspace Agent is private', async () => {
    mockGetAgentConfig.mockResolvedValue({
      ...defaultAgentConfig,
      agencyConfig: { modelSelectionPolicy: 'member' },
      visibility: 'private',
    });
    mockGetPreference.mockResolvedValue({
      agentModelOverrides: {
        'agent-1': { model: 'claude-sonnet-4-6', provider: 'anthropic' },
      },
    });
    service = new AiAgentService(mockDb, userId, { workspaceId: 'workspace-1' });

    await service.execAgent({ agentId: 'agent-1', prompt: 'Hello' });

    const runContext = mockDispatchHeteroAgent.mock.calls[0][1];
    expect(runContext.agentConfig.model).toBe('gpt-4');
    expect(runContext.agentConfig.provider).toBe('openai');
  });

  it('ignores a retained caller preference when the workspace model policy is fixed', async () => {
    mockGetAgentConfig.mockResolvedValue({
      ...defaultAgentConfig,
      agencyConfig: { modelSelectionPolicy: 'fixed' },
      visibility: 'public',
    });
    mockGetPreference.mockResolvedValue({
      agentModelOverrides: {
        'agent-1': { model: 'claude-sonnet-4-6', provider: 'anthropic' },
      },
    });
    service = new AiAgentService(mockDb, userId, { workspaceId: 'workspace-1' });

    await service.execAgent({ agentId: 'agent-1', prompt: 'Hello' });

    const runContext = mockDispatchHeteroAgent.mock.calls[0][1];
    expect(runContext.agentConfig.model).toBe('gpt-4');
    expect(runContext.agentConfig.provider).toBe('openai');
  });

  it('keeps an explicit per-run model/provider above the caller workspace preference', async () => {
    mockGetAgentConfig.mockResolvedValue({
      ...defaultAgentConfig,
      agencyConfig: { modelSelectionPolicy: 'member' },
    });
    mockGetPreference.mockResolvedValue({
      agentModelOverrides: {
        'agent-1': { model: 'gpt-4', provider: 'openai' },
      },
    });
    service = new AiAgentService(mockDb, userId, { workspaceId: 'workspace-1' });

    await service.execAgent({
      agentId: 'agent-1',
      model: 'claude-sonnet-4-6',
      prompt: 'Hello',
      provider: 'anthropic',
    });

    const runContext = mockDispatchHeteroAgent.mock.calls[0][1];
    expect(runContext.agentConfig.model).toBe('claude-sonnet-4-6');
    expect(runContext.agentConfig.provider).toBe('anthropic');
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
