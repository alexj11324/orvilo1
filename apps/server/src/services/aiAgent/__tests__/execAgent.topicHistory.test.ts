import type * as ModelBankModule from 'model-bank';
import type { MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentOperationModel } from '@/database/models/agentOperation';
import { CompletionLifecycle } from '@/server/services/agentExecution/CompletionLifecycle';

import { AiAgentService } from '../index';
import type { dispatchHeteroAgent } from '../pipeline/heteroDispatch';

// Use vi.hoisted to ensure mock functions are available before vi.mock runs
const {
  mockDispatchAgentRun,
  mockDispatchHeteroAgent,
  mockFindShareVisitorTopicIds,
  mockGetHeterogeneousResumeSessionId,
  mockMessageCreate,
  mockMessageQuery,
  mockSpawnHeteroSandbox,
  mockTopicFindById,
  realDispatchRef,
} = vi.hoisted(() => ({
  mockDispatchAgentRun: vi.fn(),
  mockDispatchHeteroAgent: vi.fn(),
  mockFindShareVisitorTopicIds: vi.fn(),
  mockGetHeterogeneousResumeSessionId: vi.fn(),
  mockMessageCreate: vi.fn(),
  mockMessageQuery: vi.fn(),
  mockSpawnHeteroSandbox: vi.fn(),
  mockTopicFindById: vi.fn(),
  // The unmocked dispatch, captured by the factory below; the mock delegates
  // to it so tests observe the call AND the real pipeline runs.
  realDispatchRef: {
    current: null | typeof dispatchHeteroAgent,
  },
}));

// Mock trusted client to avoid server-side env access
vi.mock('@/libs/trusted-client', () => ({
  generateTrustedClientToken: vi.fn().mockReturnValue(undefined),
  getTrustedClientTokenForSession: vi.fn().mockResolvedValue(undefined),
  isTrustedClientEnabled: vi.fn().mockReturnValue(false),
}));

vi.mock('@/libs/trpc/utils/internalJwt', () => ({
  signHeteroOperationJWT: vi.fn().mockResolvedValue('op-jwt'),
  signUserJWT: vi.fn().mockResolvedValue('user-jwt'),
}));

vi.mock('@/database/models/message', () => ({
  MessageModel: vi.fn().mockImplementation(function () {
    return {
      create: mockMessageCreate,
      getLatestNonToolMessageId: vi.fn().mockResolvedValue(undefined),
      getLatestSpineMessageId: vi.fn().mockResolvedValue(undefined),
      query: mockMessageQuery,
      update: vi.fn().mockResolvedValue({}),
    };
  }),
}));

vi.mock('@/database/models/agent', () => ({
  AgentModel: vi.fn().mockImplementation(function () {
    return {
      getAgentConfig: vi.fn().mockResolvedValue({
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

vi.mock('@/server/services/agent', () => ({
  AgentService: vi.fn().mockImplementation(function () {
    return {
      getAgentConfig: vi.fn().mockResolvedValue({
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

vi.mock('@/database/models/plugin', () => ({
  PluginModel: vi.fn().mockImplementation(function () {
    return {
      query: vi.fn().mockResolvedValue([]),
    };
  }),
}));

vi.mock('@/database/models/device', () => ({
  DeviceModel: vi.fn().mockImplementation(function () {
    return {
      findByDeviceId: vi.fn().mockResolvedValue(undefined),
      findWorkspaceDeviceById: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

vi.mock('@/database/models/topic', () => ({
  TopicModel: vi.fn().mockImplementation(function () {
    return {
      releaseTaskCallbackReservation: vi.fn().mockResolvedValue(undefined),
      tryReserveTaskCallback: vi.fn().mockResolvedValue(true),
      appendRunningOperationChild: vi.fn().mockResolvedValue(true),
      create: vi.fn().mockResolvedValue({ id: 'topic-new' }),
      findById: mockTopicFindById,
      findShareVisitorTopicIds: mockFindShareVisitorTopicIds,
      patchRunningOperation: vi.fn().mockResolvedValue(true),
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

vi.mock('@/server/services/agentRuntime', () => ({
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

// Wrap the real dispatch: the mock still captures the ExecRunContext +
// dispatch input, while the real function runs far enough to reach the cloud
// sandbox spawn — where the conversation history lands.
vi.mock('../pipeline/heteroDispatch', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  realDispatchRef.current = actual.dispatchHeteroAgent as typeof dispatchHeteroAgent;
  return { ...actual, dispatchHeteroAgent: mockDispatchHeteroAgent };
});

vi.mock('@/server/services/heterogeneousAgent', () => ({
  HeterogeneousAgentService: vi.fn().mockImplementation(function () {
    return {
      getHeterogeneousResumeSessionId: mockGetHeterogeneousResumeSessionId,
    };
  }),
}));

vi.mock('@/server/services/heterogeneousAgent/sandboxRunner', () => ({
  spawnHeteroSandbox: mockSpawnHeteroSandbox,
}));

vi.mock('@/server/services/market', () => ({
  MarketService: vi.fn().mockImplementation(function () {
    return {
      getOrviloSkillManifests: vi.fn().mockResolvedValue([]),
      market: {
        creds: {
          get: vi.fn(),
          list: vi.fn().mockResolvedValue({ data: [] }),
        },
      },
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

vi.mock('@/server/modules/Mecha', () => ({
  createServerAgentToolsEngine: vi.fn().mockReturnValue({
    generateToolsDetailed: vi.fn().mockReturnValue({ enabledToolIds: [], tools: [] }),
    getEnabledPluginManifests: vi.fn().mockReturnValue(new Map()),
  }),
  serverMessagesEngine: vi.fn().mockResolvedValue([{ content: 'test', role: 'user' }]),
}));

vi.mock('@/server/services/file', () => ({
  FileService: vi.fn().mockImplementation(function () {
    return {
      uploadFromUrl: vi.fn(),
    };
  }),
}));

vi.mock('@/server/services/deviceGateway', () => ({
  deviceGateway: {
    dispatchAgentRun: mockDispatchAgentRun,
    isConfigured: false,
    queryDeviceList: vi.fn().mockResolvedValue([]),
    resolveDeviceWorkspaceId: vi.fn().mockResolvedValue(undefined),
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
    ],
  };
});

describe('AiAgentService.execAgent - topic history loading', () => {
  let service: AiAgentService;
  let recordStartSpy: MockInstance<CompletionLifecycle['recordStart']>;
  const mockDb = {} as any;
  const userId = 'test-user-id';

  beforeEach(() => {
    vi.clearAllMocks();
    // Restore the delegate-to-real implementation cleared by clearAllMocks.
    mockDispatchHeteroAgent.mockImplementation((deps, ctx, input) =>
      realDispatchRef.current!(deps, ctx, input),
    );
    vi.spyOn(AgentOperationModel.prototype, 'findById').mockResolvedValue(undefined as any);
    vi.spyOn(AgentOperationModel.prototype, 'settleRunning').mockResolvedValue(true);
    recordStartSpy = vi.spyOn(CompletionLifecycle.prototype, 'recordStart').mockResolvedValue(true);

    mockMessageCreate.mockResolvedValue({ id: 'msg-1' });
    mockDispatchAgentRun.mockResolvedValue({ success: true });
    mockSpawnHeteroSandbox.mockResolvedValue(undefined);
    mockGetHeterogeneousResumeSessionId.mockResolvedValue(undefined);
    mockTopicFindById.mockResolvedValue(undefined);
    mockFindShareVisitorTopicIds.mockResolvedValue([]);

    service = new AiAgentService(mockDb, userId);
  });

  afterEach(() => {
    recordStartSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('keeps a continued topic on its snapshotted execution target', async () => {
    mockTopicFindById.mockResolvedValue({
      id: 'topic-existing',
      metadata: { executionConfig: { executionTarget: 'none' } },
    });
    mockMessageQuery.mockResolvedValue([]);
    await service.execAgent({
      agentId: 'agent-1',
      appContext: { topicId: 'topic-existing' },
      prompt: 'Continue',
      deviceId: 'another-desktop',
    });
    expect(mockDispatchHeteroAgent).toHaveBeenCalled();
    const runContext = mockDispatchHeteroAgent.mock.calls[0][1];
    expect(runContext.agentConfig.agencyConfig).toMatchObject({
      executionTarget: 'none',
    });
  });

  describe('when topicId is provided (follow-up message in existing thread)', () => {
    it('loads topic history into the sandbox context for the run', async () => {
      // Simulate existing conversation history in the topic
      const existingMessages = [
        { content: '你看得见这个引用吗', id: 'msg-prev-1', role: 'user' },
        { content: '你好！是的，我可以看到你的消息。', id: 'msg-prev-2', role: 'assistant' },
      ];
      mockMessageQuery.mockResolvedValue(existingMessages);

      await service.execAgent({
        agentId: 'agent-1',
        appContext: { topicId: 'topic-existing' },
        prompt: '你能复述我说的第一句话吗',
      });

      // The history load moved inside dispatchHeteroAgent: it queries the run's
      // own topic directly. `allowShareVisitor` is intentionally true — the
      // topic was already resolved and authorized upstream, and an agent-share
      // visitor run executes under the creator's identity, so the
      // creator-facing default would hand the agent an empty history.
      expect(mockMessageQuery).toHaveBeenCalledWith(
        { pageSize: 200, topicId: 'topic-existing' },
        { allowShareVisitor: true },
      );

      // The spawned sandbox receives the history turns (the just-persisted
      // user turn is excluded via selfMessageIds).
      expect(mockSpawnHeteroSandbox).toHaveBeenCalled();
      const spawnArgs = mockSpawnHeteroSandbox.mock.calls[0][0];
      expect(spawnArgs.systemContext).toContain('你看得见这个引用吗');
      expect(spawnArgs.systemContext).toContain('你好！是的，我可以看到你的消息。');
    });
  });

  describe('when no topicId is provided (first message, new conversation)', () => {
    it('dispatches with an empty conversation history', async () => {
      mockMessageQuery.mockResolvedValue([]);

      await service.execAgent({
        agentId: 'agent-1',
        prompt: 'Hello',
      });

      expect(mockSpawnHeteroSandbox).toHaveBeenCalled();
      const spawnArgs = mockSpawnHeteroSandbox.mock.calls[0][0];
      expect(spawnArgs.systemContext ?? '').not.toContain('Hello');
    });
  });

  describe('share-visitor topic guard', () => {
    // Visitor topics carry the CREATOR's own userId (billing attribution) plus
    // `senderId` set to the visitor — see `packages/database/src/utils/shareVisitor.ts`.
    // No run may ever operate on one now that visitor execution is retired.
    const visitorTopic = { id: 'topic-visitor', model: null, senderId: 'visitor-1' };

    it('rejects a run whose topicId resolves to a share-visitor topic', async () => {
      mockTopicFindById.mockResolvedValue(visitorTopic);

      await expect(
        service.execAgent({
          agentId: 'agent-1',
          appContext: { topicId: 'topic-visitor' },
          prompt: 'hi',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });

      // The guard must fail BEFORE any history read reaches the visitor
      // transcript — and before anything is dispatched.
      expect(mockMessageQuery).not.toHaveBeenCalled();
      expect(mockDispatchHeteroAgent).not.toHaveBeenCalled();
    });

    it('rejects a run when the visitor topic is filtered out of the default read scope', async () => {
      // `findById` ANDs `notShareVisitorTopic` under the default scope, so a
      // creator-scoped model sees nothing at all — the case a scheduled
      // retry/continuation or a leaked topicId hits.
      // `findShareVisitorTopicIds` is the fail-closed backstop for the miss.
      mockTopicFindById.mockResolvedValue(undefined);
      mockFindShareVisitorTopicIds.mockResolvedValue(['topic-visitor']);

      await expect(
        service.execAgent({
          agentId: 'agent-1',
          appContext: { topicId: 'topic-visitor' },
          prompt: 'hi',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });

      expect(mockMessageQuery).not.toHaveBeenCalled();
      expect(mockDispatchHeteroAgent).not.toHaveBeenCalled();
    });
  });
});
