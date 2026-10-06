import type * as ModelBankModule from 'model-bank';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AiAgentService } from '../index';

// Use vi.hoisted to ensure mock functions are available before vi.mock runs
const { mockDispatchHeteroAgent, mockMessageCreate, mockTopicCreate, mockTopicFindById } =
  vi.hoisted(() => ({
    mockDispatchHeteroAgent: vi.fn(),
    mockMessageCreate: vi.fn(),
    mockTopicCreate: vi.fn(),
    mockTopicFindById: vi.fn(),
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

// Mock AgentModel
vi.mock('@/database/models/agent', () => ({
  AgentModel: vi.fn().mockImplementation(function () {
    return {
      getAgentConfig: vi.fn().mockResolvedValue({
        // An external mount-capable binding keeps this agent on the ACP
        // surface the pin assertions below exercise (builtin orvilo = Prime
        // mounts nothing).
        agencyConfig: { heterogeneousProvider: { type: 'claude-code' } },
        chatConfig: {},
        files: [],
        id: 'agent-1',
        knowledgeBases: [],
        model: 'gpt-4',
        plugins: [],
        provider: 'openai',
        systemRole: 'You are a helpful assistant',
      }),
      queryAgents: vi.fn().mockResolvedValue([]),
    };
  }),
}));

// Mock AgentService
vi.mock('@/server/services/agent', () => ({
  AgentService: vi.fn().mockImplementation(function () {
    return {
      getAgentConfig: vi.fn().mockResolvedValue({
        agencyConfig: { heterogeneousProvider: { type: 'claude-code' } },
        chatConfig: {},
        files: [],
        id: 'agent-1',
        knowledgeBases: [],
        model: 'gpt-4',
        plugins: [],
        provider: 'openai',
        systemRole: 'You are a helpful assistant',
      }),
    };
  }),
}));

// Mock PluginModel
vi.mock('@/database/models/plugin', () => ({
  PluginModel: vi.fn().mockImplementation(function () {
    return {
      query: vi.fn().mockResolvedValue([]),
    };
  }),
}));

// Mock TopicModel
vi.mock('@/database/models/topic', () => ({
  TopicModel: vi.fn().mockImplementation(function () {
    return {
      findShareVisitorTopicIds: vi.fn().mockResolvedValue([]),
      armScheduledRun: vi.fn().mockResolvedValue(undefined),
      create: mockTopicCreate,
      findById: mockTopicFindById,
      releaseTaskCallbackReservation: vi.fn().mockResolvedValue(undefined),
      tryReserveTaskCallback: vi.fn().mockResolvedValue(true),
      updateMetadata: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

// Mock ThreadModel
vi.mock('@/database/models/thread', () => ({
  ThreadModel: vi.fn().mockImplementation(function () {
    return {
      create: vi.fn(),
      findById: vi.fn(),
      update: vi.fn(),
    };
  }),
}));

// Mock ChatGroupModel — execAgent resolves the operation's group context when
// appContext.groupId is set (SubAgent task scenario). An empty roster makes
// buildGroupAgentContext return undefined, so the run proceeds without a group.
vi.mock('@/database/models/chatGroup', () => ({
  ChatGroupModel: vi.fn().mockImplementation(function () {
    return {
      findById: vi
        .fn()
        .mockResolvedValue({ id: 'group-1', title: 'Review team', content: 'Coordinate review.' }),
      getGroupAgentsWithMeta: vi.fn().mockResolvedValue([
        { agentId: 'agent-1', role: 'supervisor', title: 'Coordinator' },
        { agentId: 'agent-2', role: 'participant', title: 'Reviewer' },
      ]),
    };
  }),
}));

// Mock AgentRuntimeService
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
// these tests exercise id minting without touching the gateway/sandbox.
vi.mock('../pipeline/heteroDispatch', () => ({
  dispatchHeteroAgent: mockDispatchHeteroAgent,
}));

// Mock MarketService (for getOrviloSkillManifests)
vi.mock('@/server/services/market', () => ({
  MarketService: vi.fn().mockImplementation(function () {
    return {
      getOrviloSkillManifests: vi.fn().mockResolvedValue([]),
    };
  }),
}));

// Mock ComposioService (for getComposioManifests)
vi.mock('@/server/services/composio', () => ({
  ComposioService: vi.fn().mockImplementation(function () {
    return {
      getComposioManifests: vi.fn().mockResolvedValue([]),
    };
  }),
}));

// Mock FileService
vi.mock('@/server/services/file', () => ({
  FileService: vi.fn().mockImplementation(function () {
    return {
      uploadFromUrl: vi.fn(),
    };
  }),
}));

// Mock Mecha modules
vi.mock('@/server/modules/Mecha', () => ({
  createServerAgentToolsEngine: vi.fn().mockReturnValue({
    generateToolsDetailed: vi.fn().mockReturnValue({ enabledToolIds: [], tools: [] }),
    getEnabledPluginManifests: vi.fn().mockReturnValue(new Map()),
  }),
  serverMessagesEngine: vi.fn().mockResolvedValue([{ content: 'test', role: 'user' }]),
}));

// Mock deviceGateway
vi.mock('@/server/services/deviceGateway', () => ({
  deviceGateway: {
    isConfigured: false,
    queryDeviceList: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/server/modules/ModelRuntime', () => ({
  initModelRuntimeFromDeploymentConfig: vi.fn(),
}));

// Mock model-bank
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

describe('AiAgentService.execAgent - client-minted ids', () => {
  let service: AiAgentService;
  const mockDb = {} as any;
  const userId = 'test-user-id';

  const clientIds = {
    assistantMessageId: 'msg_clientAsst01',
    topicId: 'tpc_clientMinted1',
    userMessageId: 'msg_clientUser01',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockTopicFindById.mockResolvedValue(undefined);
    mockMessageCreate.mockClear();
    mockMessageCreate.mockResolvedValue({ id: 'msg-1' });
    mockTopicCreate.mockClear();
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
    mockMessageCreate.mockClear();
    mockTopicCreate.mockClear();
  });

  // Precreated topics pin the run's ACP execution binding (CLI family +
  // selector model), not the member's chat model — the Lobe model loop that
  // consumed chat-model pins is retired. `reasoningConfig`/`heteroEffort` are
  // stamped only when the binding carries an effort; the default 'orvilo'
  // binding has none.
  it.each(['scheduled', 'group'] as const)(
    'pins the ACP execution binding for a precreated %s topic',
    async (kind) => {
      const runSpy = vi
        .spyOn(service, 'execAgent')
        .mockResolvedValue({} as Awaited<ReturnType<AiAgentService['execAgent']>>);
      if (kind === 'scheduled') {
        await service.scheduleAgentRun({
          agentId: 'agent-1',
          prompt: 'Scheduled',
          runAt: new Date(Date.now() + 60000).toISOString(),
        });
      } else {
        await service.execGroupAgent({ agentId: 'agent-1', groupId: 'group-1', message: 'Group' });
      }
      expect(mockTopicCreate.mock.calls[0][0]).toMatchObject({
        model: 'default',
        provider: 'claude-code',
      });
      runSpy.mockRestore();
    },
  );

  it.each([undefined, 'topic-1'])(
    'keeps group directory authority for topic %s',
    async (topicId) => {
      const runSpy = vi
        .spyOn(service, 'execAgent')
        .mockResolvedValue({} as Awaited<ReturnType<AiAgentService['execAgent']>>);
      const initialTopicMetadata = {
        workingDirectory: '/repo/worktree',
        workingDirectoryConfig: { path: '/repo', git: { activeWorktree: '/repo/worktree' } },
      };
      await service.execGroupAgent({
        agentId: 'agent-1',
        groupId: 'group-1',
        message: 'Group',
        topicId,
        initialTopicMetadata,
      });
      if (!topicId)
        expect(mockTopicCreate).toHaveBeenCalledWith(
          expect.objectContaining({ metadata: expect.objectContaining(initialTopicMetadata) }),
        );
      else expect(mockTopicCreate).not.toHaveBeenCalled();
      expect(runSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          appContext: expect.objectContaining({
            groupId: 'group-1',
            topicId: topicId || 'topic-server-minted',
          }),
        }),
      );
      expect(runSpy.mock.calls[0][0].appContext?.initialTopicMetadata).toBeUndefined();
      runSpy.mockRestore();
    },
  );

  it('keeps the execution-binding pin when a chat-model override is scheduled', async () => {
    // 'override-model' is not a heterogeneous model id, so the run falls back
    // to the deployment's default 'orvilo' binding.
    await service.scheduleAgentRun({
      agentId: 'agent-1',
      model: 'override-model',
      provider: 'override-provider',
      prompt: 'Scheduled',
      runAt: new Date(Date.now() + 60000).toISOString(),
    });
    expect(mockTopicCreate.mock.calls[0][0]).toMatchObject({
      model: 'default',
      provider: 'claude-code',
    });
  });

  it('admits real group tools and ACP role context for the verified supervisor', async () => {
    await service.execAgent({
      agentId: 'agent-1',
      prompt: 'Ask the Reviewer to inspect this change.',
      appContext: { groupId: 'group-1', orchestrationRole: 'supervisor' },
    });
    const [, run, dispatch] = mockDispatchHeteroAgent.mock.calls[0];
    expect(run.appContext).toMatchObject({
      groupId: 'group-1',
      scope: 'group',
      orchestrationRole: 'supervisor',
    });
    expect(
      dispatch.builtinToolSpecs.find(
        (spec: { identifier: string }) => spec.identifier === 'orvilo-group-management',
      ),
    ).toBeDefined();
    expect(dispatch.extraSystemContext).toContain('supervisor');
    expect(dispatch.extraSystemContext).toContain('agent-2');
    expect(dispatch.extraSystemContext).toContain('Reviewer');
  });

  it('rejects routing a group supervisor into another group topic', async () => {
    mockTopicFindById.mockResolvedValue({
      id: 'topic-other',
      groupId: 'group-other',
      agentId: 'agent-1',
    });
    await expect(
      service.execAgent({
        agentId: 'agent-1',
        prompt: 'Write in another group',
        appContext: { groupId: 'group-1', topicId: 'topic-other', orchestrationRole: 'supervisor' },
      }),
    ).rejects.toThrow('Topic does not belong to this group');
    expect(mockMessageCreate).not.toHaveBeenCalled();
    expect(mockDispatchHeteroAgent).not.toHaveBeenCalled();
  });

  it('rejects a spoofed supervisor before creating a group topic', async () => {
    await expect(
      service.execGroupAgent({ agentId: 'agent-2', groupId: 'group-1', message: 'Claim control' }),
    ).rejects.toThrow('Only the group supervisor');
    expect(mockTopicCreate).not.toHaveBeenCalled();
    expect(mockDispatchHeteroAgent).not.toHaveBeenCalled();
  });

  it('does not recreate or snapshot an existing group topic', async () => {
    const runSpy = vi
      .spyOn(service, 'execAgent')
      .mockResolvedValue({} as Awaited<ReturnType<AiAgentService['execAgent']>>);
    await service.execGroupAgent({
      agentId: 'agent-1',
      groupId: 'group-1',
      topicId: 'legacy-topic',
      message: 'Continue',
    });
    expect(mockTopicCreate).not.toHaveBeenCalled();
    runSpy.mockRestore();
  });

  it('should forward client-minted ids to topic and message creation on a fresh send', async () => {
    await service.execAgent({
      agentId: 'agent-1',
      clientIds,
      prompt: 'Fresh send',
    });

    // Topic created under the client id — the sidebar row the client already
    // renders never has to change id.
    expect(mockTopicCreate).toHaveBeenCalledWith(expect.any(Object), 'tpc_clientMinted1');

    const userCall = mockMessageCreate.mock.calls.find((call) => call[0].role === 'user');
    const assistantCall = mockMessageCreate.mock.calls.find((call) => call[0].role === 'assistant');
    expect(userCall?.[1]).toBe('msg_clientUser01');
    expect(assistantCall?.[1]).toBe('msg_clientAsst01');
  });

  it('should mint server ids when no client ids are supplied', async () => {
    await service.execAgent({
      agentId: 'agent-1',
      prompt: 'Old client shape',
    });

    expect(mockTopicCreate).toHaveBeenCalledWith(expect.any(Object), undefined);
    const userCall = mockMessageCreate.mock.calls.find((call) => call[0].role === 'user');
    const assistantCall = mockMessageCreate.mock.calls.find((call) => call[0].role === 'assistant');
    expect(userCall?.[1]).toBeUndefined();
    expect(assistantCall?.[1]).toBeUndefined();
  });

  it('should drop client ids on a resume-like replay', async () => {
    // A regeneration/resume reaches execAgent with parentMessageId set. If the
    // replay carried the original send's ids, honouring them would collide
    // with the rows that send already created — the service must drop them
    // rather than trust every caller to omit them.
    await service.execAgent({
      agentId: 'agent-1',
      appContext: { topicId: 'topic-1' },
      clientIds,
      parentMessageId: 'msg_parent00001',
      prompt: 'Regenerate',
      resume: true,
    });

    const assistantCall = mockMessageCreate.mock.calls.find((call) => call[0].role === 'assistant');
    expect(assistantCall).toBeDefined();
    expect(assistantCall?.[1]).toBeUndefined();
  });
});
