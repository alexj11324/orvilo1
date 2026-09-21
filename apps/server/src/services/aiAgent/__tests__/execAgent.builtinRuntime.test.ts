import { PageAgentIdentifier } from '@orvilo/builtin-tool-page-agent';
import { SELF_FEEDBACK_INTENT_IDENTIFIER } from '@orvilo/builtin-tool-self-iteration';
import { RequestTrigger } from '@orvilo/types';
import type * as ModelBankModule from 'model-bank';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AiAgentService } from '../index';

const {
  mockDispatchHeteroAgent,
  mockGetAgentConfig,
  mockGetBuiltinAgent,
  mockGetInfoForAIGeneration,
  mockGetModelMetadata,
  mockMessageCreate,
  mockMessageQuery,
  mockResolveTask,
} = vi.hoisted(() => ({
  mockDispatchHeteroAgent: vi.fn(),
  mockGetAgentConfig: vi.fn(),
  mockGetBuiltinAgent: vi.fn(),
  mockGetInfoForAIGeneration: vi.fn(),
  mockGetModelMetadata: vi.fn(),
  mockMessageCreate: vi.fn(),
  mockMessageQuery: vi.fn(),
  mockResolveTask: vi.fn(),
}));

// P70: every run dispatches through `dispatchHeteroAgent` onto an ACP binding.
// These tests cover execAgent-level semantics (agent resolution, config merge,
// message persistence) — stub the dispatch boundary itself and assert on the
// ExecRunContext / dispatch input it receives.
vi.mock('../pipeline/heteroDispatch', () => ({
  dispatchHeteroAgent: mockDispatchHeteroAgent,
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
      query: mockMessageQuery,
      update: vi.fn().mockResolvedValue({}),
    };
  }),
}));

vi.mock('@/database/models/aiModel', () => ({
  AiModelModel: vi.fn().mockImplementation(function () {
    return {
      findByIdAndProvider: mockGetModelMetadata,
    };
  }),
}));

vi.mock('@/database/models/agent', () => ({
  AgentModel: vi.fn().mockImplementation(function () {
    return {
      getAgentConfig: vi.fn(),
      getBuiltinAgent: mockGetBuiltinAgent,
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

vi.mock('@/server/services/agentSignal', () => ({
  enqueueAgentSignalSourceEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/database/models/plugin', () => ({
  PluginModel: vi.fn().mockImplementation(function () {
    return {
      query: vi.fn().mockResolvedValue([]),
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

vi.mock('@/database/models/user', () => ({
  UserModel: {
    getInfoForAIGeneration: mockGetInfoForAIGeneration,
  },
}));

vi.mock('@/database/models/task', () => ({
  TaskModel: vi.fn().mockImplementation(function () {
    return {
      resolve: mockResolveTask,
    };
  }),
}));

vi.mock('@/server/services/agentExecution', () => ({
  AgentRuntimeService: vi.fn().mockImplementation(function () {
    return {
      createOperation: vi.fn(),
    };
  }),
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
      getFullFileUrl: (path: string | null) => Promise.resolve(path || ''),
      uploadFromUrl: vi.fn(),
    };
  }),
}));

vi.mock('@/server/modules/Mecha', () => ({
  createServerAgentToolsEngine: vi.fn().mockReturnValue({
    generateToolsDetailed: vi.fn().mockImplementation(function () {
      return { enabledToolIds: [], tools: [] };
    }),
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
        abilities: { audio: false, functionCall: true, video: false, vision: true },
        id: 'gpt-4',
        providerId: 'openai',
      },
      {
        abilities: { audio: false, functionCall: true, video: false, vision: false },
        id: 'text-only',
        providerId: 'openai',
      },
      {
        abilities: { audio: true, functionCall: true, video: true, vision: true },
        id: 'gemini-3.1-flash-lite-preview',
        providerId: 'google',
      },
    ],
  };
});

describe('AiAgentService.execAgent - builtin agent runtime config', () => {
  let service: AiAgentService;
  const mockDb = {} as any;
  const userId = 'test-user-id';

  const lastDispatchCall = () => {
    const calls = mockDispatchHeteroAgent.mock.calls;
    expect(calls).toHaveLength(1);
    return { ctx: calls[0]![1], input: calls[0]![2] } as any;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockMessageCreate.mockResolvedValue({ id: 'msg-1' });
    mockMessageQuery.mockResolvedValue([]);
    mockResolveTask.mockResolvedValue(null);
    mockGetInfoForAIGeneration.mockResolvedValue({
      responseLanguage: 'en-US',
      userName: 'Test User',
    });
    mockGetModelMetadata.mockResolvedValue(undefined);
    mockDispatchHeteroAgent.mockResolvedValue({
      autoStarted: true,
      operationId: 'op-123',
      success: true,
      topicId: 'topic-1',
    });
    mockGetBuiltinAgent.mockResolvedValue(null);
    service = new AiAgentService(mockDb, userId);
  });

  it('materializes a builtin agent addressed by slug when no row exists yet', async () => {
    // Background self-iteration runs dispatch via execAgent({ slug }) before any
    // persisted row exists. The first resolve (by slug) misses; execAgent must
    // lazily materialize the virtual builtin row (getBuiltinAgent) and re-resolve
    // — without it the run throws `Agent not found: self-reflection`.
    mockGetAgentConfig.mockResolvedValueOnce(null).mockResolvedValueOnce({
      chatConfig: {},
      id: 'agent-self-reflection',
      model: 'gpt-4',
      plugins: [],
      provider: 'openai',
      slug: 'self-reflection',
      systemRole: '',
    });
    mockGetBuiltinAgent.mockResolvedValueOnce({
      id: 'agent-self-reflection',
      slug: 'self-reflection',
    });

    await service.execAgent({ prompt: 'reflect', slug: 'self-reflection' });

    expect(mockGetBuiltinAgent).toHaveBeenCalledWith('self-reflection');
    const { ctx } = lastDispatchCall();
    expect(ctx.agentConfig.slug).toBe('self-reflection');
    expect(ctx.resolvedAgentId).toBe('agent-self-reflection');
  });

  it('throws for an unknown non-builtin identifier without materializing a row', async () => {
    mockGetAgentConfig.mockResolvedValue(null);

    await expect(service.execAgent({ agentId: 'does-not-exist', prompt: 'hi' })).rejects.toThrow(
      'Agent not found: does-not-exist',
    );
    expect(mockGetBuiltinAgent).not.toHaveBeenCalled();
    expect(mockDispatchHeteroAgent).not.toHaveBeenCalled();
  });

  it('should merge runtime systemRole for inbox agent when DB systemRole is empty', async () => {
    // Inbox agent with no user-customized systemRole in DB
    mockGetAgentConfig.mockResolvedValue({
      chatConfig: {},
      id: 'agent-inbox',
      model: 'gpt-4',
      plugins: [],
      provider: 'openai',
      slug: 'inbox',
      systemRole: '', // empty in DB
    });

    await service.execAgent({
      agentId: 'agent-inbox',
      prompt: 'Hello',
    });

    const { ctx } = lastDispatchCall();
    expect(ctx.agentConfig.systemRole).toContain('You are Orvilo');
    // Model identity is injected by ModelInfoProvider now, not the `{{model}}`
    // template placeholder; `{{date}}` still proves the runtime template merged.
    expect(ctx.agentConfig.systemRole).toContain('{{date}}');
  });

  it('should pass user response language into web onboarding runtime systemRole', async () => {
    mockGetInfoForAIGeneration.mockResolvedValue({
      responseLanguage: 'zh-CN',
      userName: 'Test User',
    });
    mockGetAgentConfig.mockResolvedValue({
      chatConfig: {},
      id: 'agent-web-onboarding',
      model: 'gpt-4',
      plugins: [],
      provider: 'openai',
      slug: 'web-onboarding',
      systemRole: '',
    });

    await service.execAgent({
      agentId: 'agent-web-onboarding',
      prompt: '你好',
    });

    const { ctx } = lastDispatchCall();
    expect(ctx.agentConfig.agencyConfig?.executionTarget).toBe('none');
    expect(ctx.agentConfig.systemRole).toContain('Preferred reply language: zh-CN');
    expect(ctx.agentConfig.systemRole).toContain(
      'Every visible reply, question, and visible choice label must be entirely in zh-CN',
    );
  });

  it('should NOT override user-customized systemRole for inbox agent', async () => {
    const customSystemRole = 'You are a custom assistant.';
    mockGetAgentConfig.mockResolvedValue({
      chatConfig: {},
      id: 'agent-inbox',
      model: 'gpt-4',
      plugins: [],
      provider: 'openai',
      slug: 'inbox',
      systemRole: customSystemRole, // user has customized
    });

    await service.execAgent({
      agentId: 'agent-inbox',
      prompt: 'Hello',
    });

    const { ctx } = lastDispatchCall();
    expect(ctx.agentConfig.systemRole).toBe(customSystemRole);
  });

  // Regular agents get no builtin runtime prompt. They do get the user's reply
  // language appended — the same rule the client runtime applies, now shared
  // through `@orvilo/mecha`.
  const REPLY_LANGUAGE_ONLY =
    'Preferred reply language: en-US. Use this language unless the user explicitly asks to switch.';

  it('should not apply runtime config for non-builtin agents', async () => {
    mockGetAgentConfig.mockResolvedValue({
      chatConfig: {},
      id: 'agent-custom',
      model: 'gpt-4',
      plugins: [],
      provider: 'openai',
      slug: 'my-custom-slug', // not a builtin slug
      systemRole: '',
    });

    await service.execAgent({
      agentId: 'agent-custom',
      prompt: 'Hello',
    });

    const { ctx } = lastDispatchCall();
    // No runtime prompt applied — only the reply-language instruction.
    expect(ctx.agentConfig.systemRole).toBe(REPLY_LANGUAGE_ONLY);
  });

  it('should not apply runtime config for agents without slug', async () => {
    mockGetAgentConfig.mockResolvedValue({
      chatConfig: {},
      id: 'agent-no-slug',
      model: 'gpt-4',
      plugins: [],
      provider: 'openai',
      systemRole: '',
    });

    await service.execAgent({
      agentId: 'agent-no-slug',
      prompt: 'Hello',
    });

    const { ctx } = lastDispatchCall();
    expect(ctx.agentConfig.systemRole).toBe(REPLY_LANGUAGE_ONLY);
  });

  it('should persist request trigger metadata on the created user message', async () => {
    mockGetAgentConfig.mockResolvedValue({
      chatConfig: {},
      id: 'agent-custom',
      model: 'gpt-4',
      plugins: [],
      provider: 'openai',
      systemRole: '',
    });

    await service.execAgent({
      agentId: 'agent-custom',
      appContext: { topicId: 'topic-1' },
      prompt: 'Hello',
      trigger: RequestTrigger.Onboarding,
    });

    expect(mockMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Hello',
        metadata: { trigger: RequestTrigger.Onboarding },
        role: 'user',
      }),
      undefined,
    );
  });

  // The self-feedback intent tool is a caller-driven mount under ACP: execAgent
  // no longer resolves the agent-signal gate itself (that moved to the
  // agentSignal workflow); it mounts whatever the caller pinned and drops the
  // tool when `disableSelfFeedbackIntentTool` is passed.
  it('mounts the self-feedback spec when the caller pins it', async () => {
    mockGetAgentConfig.mockResolvedValue({
      chatConfig: {},
      id: 'agent-inbox',
      model: 'gpt-4',
      plugins: [SELF_FEEDBACK_INTENT_IDENTIFIER],
      provider: 'openai',
      slug: 'inbox',
      systemRole: '',
    });

    await service.execAgent({
      agentId: 'agent-inbox',
      prompt: 'Hello',
    });

    const { input } = lastDispatchCall();
    expect(input.builtinToolSpecs.map((spec: any) => spec.identifier)).toContain(
      SELF_FEEDBACK_INTENT_IDENTIFIER,
    );
  });

  it('does not mount self-feedback for agents that do not declare it', async () => {
    mockGetAgentConfig.mockResolvedValue({
      chatConfig: {},
      id: 'agent-custom',
      model: 'gpt-4',
      plugins: [],
      provider: 'openai',
      slug: 'custom-agent',
      systemRole: '',
    });

    await service.execAgent({
      agentId: 'agent-custom',
      prompt: 'Hello',
    });

    const { input } = lastDispatchCall();
    expect(input.builtinToolSpecs.map((spec: any) => spec.identifier)).not.toContain(
      SELF_FEEDBACK_INTENT_IDENTIFIER,
    );
  });

  it('drops self-feedback when the caller disables it for this run', async () => {
    mockGetAgentConfig.mockResolvedValue({
      chatConfig: {},
      id: 'agent-custom',
      model: 'gpt-4',
      plugins: [SELF_FEEDBACK_INTENT_IDENTIFIER],
      provider: 'openai',
      slug: 'custom-agent',
      systemRole: '',
    });

    await service.execAgent({
      agentId: 'agent-custom',
      disableSelfFeedbackIntentTool: true,
      prompt: 'Hello',
    });

    const { input } = lastDispatchCall();
    expect(input.builtinToolSpecs.map((spec: any) => spec.identifier)).not.toContain(
      SELF_FEEDBACK_INTENT_IDENTIFIER,
    );
  });

  it('should inject page-agent runtime for regular agents in page scope', async () => {
    mockGetAgentConfig.mockResolvedValue({
      chatConfig: { enableHistoryCount: true },
      id: 'agent-custom',
      model: 'gpt-4',
      plugins: ['orvilo-agent-documents'],
      provider: 'openai',
      systemRole: 'Custom role.',
    });

    await service.execAgent({
      agentId: 'agent-custom',
      appContext: {
        documentId: 'docs-1',
        scope: 'page',
        topicId: 'topic-1',
      },
      prompt: 'Rewrite this page',
    });

    const { ctx, input } = lastDispatchCall();
    expect(ctx.appContext).toMatchObject({
      documentId: 'docs-1',
      scope: 'page',
    });
    expect(ctx.agentConfig.plugins).toEqual([PageAgentIdentifier, 'orvilo-agent-documents']);
    expect(ctx.agentConfig.chatConfig.enableHistoryCount).toBe(false);
    expect(ctx.agentConfig.systemRole).toContain('Custom role.');
    expect(ctx.agentConfig.systemRole).toContain(
      'You are a helpful document (page) editing assistant',
    );

    // The injected page-agent rides the per-run MCP surface (server runtime).
    expect(input.builtinToolSpecs.map((spec: any) => spec.identifier)).toContain(
      PageAgentIdentifier,
    );
  });

  it('should normalize task identifier from appContext into the dispatch operationTaskId', async () => {
    mockResolveTask.mockResolvedValue({ id: 'task-row-1', identifier: 'T-1' });
    mockGetAgentConfig.mockResolvedValue({
      chatConfig: {},
      id: 'agent-task',
      model: 'gpt-4',
      plugins: [],
      provider: 'openai',
      systemRole: '',
    });

    await service.execAgent({
      agentId: 'agent-task',
      appContext: {
        defaultTaskAssigneeAgentId: 'agt_inbox',
        scope: 'task',
        taskId: 'T-1',
        topicId: 'topic-1',
      },
      prompt: 'Show current task',
    });

    expect(mockResolveTask).toHaveBeenCalledWith('T-1');
    const { ctx, input } = lastDispatchCall();
    // The operation records the resolved row id; `appContext.taskId` stays the
    // caller-supplied identifier — the taskManager context prompt the retired
    // loop injected (`Default Orvilo AI agent id: …`) is no longer part of the
    // run context under ACP.
    expect(input.operationTaskId).toBe('task-row-1');
    expect(ctx.appContext).toMatchObject({
      defaultTaskAssigneeAgentId: 'agt_inbox',
      scope: 'task',
      taskId: 'T-1',
      topicId: 'topic-1',
    });
  });
});
