import type { OrviloDatabase } from '@orvilo/database';
import type * as ModelBankModule from 'model-bank';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AiAgentService } from '../index';

const {
  mockDispatchHeteroAgent,
  mockFindById,
  mockFindMessagePlugin,
  mockMessageCreate,
  mockMessageQuery,
  mockLoadInterventionContinuationState,
  mockResolveHumanApproval,
  mockRestoreHumanApproval,
  mockUpdateMessagePlugin,
  mockUpdatePluginState,
  mockUpdateToolMessage,
} = vi.hoisted(() => ({
  mockDispatchHeteroAgent: vi.fn(),
  mockFindById: vi.fn(),
  mockFindMessagePlugin: vi.fn(),
  mockMessageCreate: vi.fn(),
  mockMessageQuery: vi.fn(),
  mockLoadInterventionContinuationState: vi.fn(),
  mockResolveHumanApproval: vi.fn(),
  mockRestoreHumanApproval: vi.fn(),
  mockUpdateMessagePlugin: vi.fn(),
  mockUpdatePluginState: vi.fn(),
  mockUpdateToolMessage: vi.fn(),
}));

vi.mock('@/libs/trusted-client', () => ({
  generateTrustedClientToken: vi.fn().mockReturnValue(undefined),
  getTrustedClientTokenForSession: vi.fn().mockResolvedValue(undefined),
  isTrustedClientEnabled: vi.fn().mockReturnValue(false),
}));

vi.mock('@/database/models/message', () => ({
  HumanApprovalAlreadyResolvedError: class HumanApprovalAlreadyResolvedError extends Error {},
  MessageModel: vi.fn().mockImplementation(function () {
    return {
      create: mockMessageCreate,
      getLatestNonToolMessageId: vi.fn().mockResolvedValue(undefined),
      getLatestSpineMessageId: vi.fn().mockResolvedValue(undefined),
      findById: mockFindById,
      findMessagePlugin: mockFindMessagePlugin,
      query: mockMessageQuery,
      resolveHumanApproval: mockResolveHumanApproval,
      restoreHumanApproval: mockRestoreHumanApproval,
      update: vi.fn().mockResolvedValue({}),
      updateMessagePlugin: mockUpdateMessagePlugin,
      updatePluginState: mockUpdatePluginState,
      updateToolMessage: mockUpdateToolMessage,
    };
  }),
}));

vi.mock('@/database/models/agent', () => ({
  AgentModel: vi.fn().mockImplementation(function () {
    return { queryAgents: vi.fn().mockResolvedValue([]) };
  }),
}));

vi.mock('@/server/services/agent', () => ({
  AgentService: vi.fn().mockImplementation(function () {
    return {
      getAgentConfig: vi.fn().mockResolvedValue({
        chatConfig: {},
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
    return { query: vi.fn().mockResolvedValue([]) };
  }),
}));

vi.mock('@/database/models/topic', () => ({
  TopicModel: vi.fn().mockImplementation(function () {
    return {
      releaseTaskCallbackReservation: vi.fn().mockResolvedValue(undefined),
      tryReserveTaskCallback: vi.fn().mockResolvedValue(true),
      create: vi.fn().mockResolvedValue({ id: 'topic-1' }),
      findById: vi.fn().mockResolvedValue(null),
      // `findById` returns null, so turnSetup probes the visitor guard next —
      // these topics are not share-visitor rows.
      findShareVisitorTopicIds: vi.fn().mockResolvedValue([]),
      updateMetadata: vi.fn(),
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

vi.mock('@/database/models/user', () => ({
  UserModel: vi.fn().mockImplementation(function () {
    return {
      getUserSettings: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

vi.mock('@/database/models/userMemory/persona', () => ({
  UserPersonaModel: vi.fn().mockImplementation(function () {
    return {
      getLatestPersonaDocument: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

vi.mock('@/server/services/agentExecution', () => ({
  AgentRuntimeService: vi.fn().mockImplementation(function () {
    return {
      createOperation: vi.fn(),
      ensureInterventionContinuationStarted: vi.fn().mockResolvedValue('scheduled'),
      loadInterventionContinuationState: mockLoadInterventionContinuationState,
    };
  }),
}));

// Under ACP the continuation re-dispatches through `dispatchHeteroAgent` — the
// retired `tool_result`/`human_approved_tool` phases were model-loop internals.
// What survives at the boundary: the row-locking approval resolution happens
// before dispatch, and the run carries `parentMessageId` (no re-execution of
// the answered tool call, which already holds the human's content).
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
    return { uploadFromUrl: vi.fn() };
  }),
}));

vi.mock('@/server/modules/Mecha', () => ({
  createServerAgentToolsEngine: vi.fn().mockReturnValue({
    generateToolsDetailed: vi.fn().mockReturnValue({ enabledToolIds: [], tools: [] }),
    getEnabledPluginManifests: vi.fn().mockReturnValue(new Map()),
  }),
}));

vi.mock('@/server/services/deviceGateway', () => ({
  deviceGateway: { isConfigured: false, queryDeviceList: vi.fn().mockResolvedValue([]) },
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
        abilities: { functionCall: true, vision: true },
        id: 'gpt-4',
        providerId: 'openai',
      },
    ],
  };
});

describe('AiAgentService.execAgent - resumeToolResult', () => {
  let service: AiAgentService;

  // `messages` row — `findById` returns this.
  const pendingToolMessage = {
    id: 'tool-msg-1',
    role: 'tool',
    sessionId: 'session-1',
    threadId: 'thread-1',
    topicId: 'topic-1',
  };
  // `message_plugins` row — fetched via findMessagePlugin.
  const pendingToolPlugin = {
    apiName: 'askUserQuestion',
    arguments: '{"question":"favorite color?"}',
    identifier: 'orvilo-agent',
    intervention: { status: 'pending' },
    toolCallId: 'call_ask',
    type: 'builtin',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatchHeteroAgent.mockResolvedValue({
      autoStarted: true,
      operationId: 'op-123',
      success: true,
      topicId: 'topic-1',
    });
    mockFindById.mockImplementation(async (id: string) =>
      id === pendingToolMessage.id ? pendingToolMessage : undefined,
    );
    mockFindMessagePlugin.mockResolvedValue(pendingToolPlugin);
    mockMessageQuery.mockResolvedValue([{ content: 'hi', id: 'history-1', role: 'user' }]);
    mockMessageCreate.mockResolvedValue({ id: 'assistant-msg-new' });
    mockResolveHumanApproval.mockResolvedValue('applied');
    mockLoadInterventionContinuationState.mockResolvedValue(null);
    mockRestoreHumanApproval.mockResolvedValue(undefined);
    mockUpdateMessagePlugin.mockResolvedValue(undefined);
    mockUpdatePluginState.mockResolvedValue(undefined);
    mockUpdateToolMessage.mockResolvedValue(undefined);
    service = new AiAgentService({} as unknown as OrviloDatabase, 'user-1');
  });

  const baseParams = {
    agentId: 'agent-1',
    appContext: { sessionId: 'session-1', threadId: 'thread-1', topicId: 'topic-1' },
    parentMessageId: 'tool-msg-1',
    prompt: '',
  };

  it('writes the human answer as tool content, marks approved, and re-dispatches anchored on the tool row (no re-execution)', async () => {
    await service.execAgent({
      ...baseParams,
      resumeToolResult: {
        content: 'My favorite color is blue',
        parentMessageId: 'tool-msg-1',
        toolCallId: 'call_ask',
      },
    });

    // Content, intervention, and optional form state share one row-locking
    // first-winner boundary.
    expect(mockResolveHumanApproval).toHaveBeenCalledWith([
      expect.objectContaining({
        content: 'My favorite color is blue',
        id: 'tool-msg-1',
        intervention: {
          resolutionRequestId: expect.stringMatching(/^legacy_/),
          status: 'approved',
        },
      }),
    ]);

    // The continuation re-dispatches with the tool row as its anchor — the
    // host resumes from history rather than re-running the answered call.
    expect(mockDispatchHeteroAgent).toHaveBeenCalledTimes(1);
    const ctx = mockDispatchHeteroAgent.mock.calls[0][1];
    expect(ctx.parentMessageId).toBe('tool-msg-1');
    expect(ctx.assistantMessageId).toBe('assistant-msg-new');
  });

  it('persists pluginState when provided', async () => {
    await service.execAgent({
      ...baseParams,
      resumeToolResult: {
        content: 'blue',
        parentMessageId: 'tool-msg-1',
        pluginState: { askUserAnswers: { 'favorite color?': 'blue' } },
        toolCallId: 'call_ask',
      },
    });

    expect(mockResolveHumanApproval).toHaveBeenCalledWith([
      expect.objectContaining({
        pluginState: { askUserAnswers: { 'favorite color?': 'blue' } },
      }),
    ]);
  });

  it('does not persist pluginState when omitted', async () => {
    await service.execAgent({
      ...baseParams,
      resumeToolResult: {
        content: 'blue',
        parentMessageId: 'tool-msg-1',
        toolCallId: 'call_ask',
      },
    });

    expect(mockResolveHumanApproval).toHaveBeenCalledWith([
      expect.objectContaining({ pluginState: undefined }),
    ]);
  });

  describe('validation guards', () => {
    it('throws when the parent message is not role=tool', async () => {
      mockFindById.mockResolvedValue({ ...pendingToolMessage, role: 'user' });

      await expect(
        service.execAgent({
          ...baseParams,
          resumeToolResult: {
            content: 'blue',
            parentMessageId: 'tool-msg-1',
            toolCallId: 'call_ask',
          },
        }),
      ).rejects.toThrow(/role='tool'/);
    });

    it('throws when the stored tool_call_id does not match the resume request', async () => {
      mockFindMessagePlugin.mockResolvedValue({ ...pendingToolPlugin, toolCallId: 'call_other' });

      await expect(
        service.execAgent({
          ...baseParams,
          resumeToolResult: {
            content: 'blue',
            parentMessageId: 'tool-msg-1',
            toolCallId: 'call_ask',
          },
        }),
      ).rejects.toThrow(/toolCallId mismatch/);
    });

    it('throws when no plugin row exists for the target message', async () => {
      mockFindMessagePlugin.mockResolvedValue(undefined);

      await expect(
        service.execAgent({
          ...baseParams,
          resumeToolResult: {
            content: 'blue',
            parentMessageId: 'tool-msg-1',
            toolCallId: 'call_ask',
          },
        }),
      ).rejects.toThrow(/no plugin row/);
    });
  });
});
