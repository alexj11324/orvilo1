import type * as ModelBankModule from 'model-bank';
import type { MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentOperationModel } from '@/database/models/agentOperation';
import { CompletionLifecycle } from '@/server/services/agentExecution/CompletionLifecycle';

import { AiAgentService } from '../index';
import type { dispatchHeteroAgent } from '../pipeline/heteroDispatch';

// Under ACP a resume/regenerate run still prunes the anchor's old answer
// branch — but the pruning now happens inside `dispatchHeteroAgent` (topic
// query → pruneRegeneratedBranch → conversation history), and the surviving
// turns reach the execution host inside the `systemContext` block instead of
// a model-loop `initialMessages` array. These tests delegate to the real
// dispatch (stubs around the persistence/device/sandbox edges) and assert on
// the serialized history the host receives.
const {
  mockDispatchHeteroAgent,
  mockFindById,
  mockMessageCreate,
  mockMessageQuery,
  mockQueryTree,
  mockSpawnHeteroSandbox,
  realDispatchRef,
} = vi.hoisted(() => ({
  mockDispatchHeteroAgent: vi.fn(),
  mockFindById: vi.fn(),
  mockMessageCreate: vi.fn(),
  mockMessageQuery: vi.fn(),
  mockQueryTree: vi.fn(),
  mockSpawnHeteroSandbox: vi.fn(),
  realDispatchRef: (() => {
    const ref: { current: typeof dispatchHeteroAgent | null } = { current: null };
    return ref;
  })(),
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
      findById: mockFindById,
      query: mockMessageQuery,
      queryTopicMessageTree: mockQueryTree,
      update: vi.fn().mockResolvedValue({}),
    };
  }),
}));

vi.mock('@/database/models/agent', () => ({
  AgentModel: vi.fn().mockImplementation(function () {
    return {
      queryAgents: vi.fn().mockResolvedValue([]),
    };
  }),
}));

vi.mock('@/server/services/agent', () => ({
  AgentService: vi.fn().mockImplementation(function () {
    return {
      getAgentConfig: vi.fn().mockResolvedValue({
        agencyConfig: { executionTarget: 'sandbox' },
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
    return {
      query: vi.fn().mockResolvedValue([]),
    };
  }),
}));

vi.mock('@/database/models/topic', () => ({
  TopicModel: vi.fn().mockImplementation(function () {
    return {
      appendRunningOperationChild: vi.fn().mockResolvedValue(true),
      releaseTaskCallbackReservation: vi.fn().mockResolvedValue(undefined),
      tryReserveTaskCallback: vi.fn().mockResolvedValue(true),
      create: vi.fn().mockResolvedValue({ id: 'topic-1' }),
      findById: vi.fn().mockResolvedValue(null),
      findShareVisitorTopicIds: vi.fn().mockResolvedValue([]),
      patchRunningOperation: vi.fn().mockResolvedValue(true),
      settleRunningOperation: vi.fn().mockResolvedValue(true),
      updateMetadata: vi.fn().mockResolvedValue({}),
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
      createOperation: vi.fn().mockResolvedValue({
        autoStarted: true,
        messageId: 'queue-msg-1',
        operationId: 'op-123',
        success: true,
      }),
    };
  }),
}));

vi.mock('@/server/modules/AgentExecution/factory', () => ({
  createAgentStateManager: vi.fn(function () {
    return {
      createOperationMetadata: vi.fn().mockResolvedValue(undefined),
    };
  }),
  createStreamEventManager: () => ({
    publishAgentRuntimeEnd: vi.fn().mockResolvedValue('end-event-id'),
    publishAgentRuntimeInit: vi.fn().mockResolvedValue('init-event-id'),
  }),
  isRedisAvailable: vi.fn(function () {
    return false;
  }),
}));

vi.mock('@/libs/trpc/utils/internalJwt', () => ({
  signHeteroOperationJWT: vi.fn().mockResolvedValue('op-jwt'),
  signUserJWT: vi.fn().mockResolvedValue('user-jwt'),
}));

vi.mock('@/server/services/heterogeneousAgent', () => ({
  HeterogeneousAgentService: vi.fn().mockImplementation(function () {
    return {
      getHeterogeneousResumeSessionId: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

vi.mock('@/server/services/heterogeneousAgent/sandboxRunner', () => ({
  spawnHeteroSandbox: mockSpawnHeteroSandbox,
}));

vi.mock('@/server/services/deviceGateway/dispatchAuthorization', () => ({
  resolveDeviceDispatchAuthorizationFailure: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/server/services/heterogeneousAgent/remoteDeviceHeteroContext', () => ({
  buildRemoteDeviceHeteroContext: vi.fn().mockReturnValue('device context'),
}));

// Runs the real dispatchHeteroAgent so the resume pruning inside it actually
// executes; the mock lets us intercept if needed and keeps the harness
// hermetic.
vi.mock('../pipeline/heteroDispatch', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  realDispatchRef.current = actual.dispatchHeteroAgent as typeof dispatchHeteroAgent;
  return { ...actual, dispatchHeteroAgent: mockDispatchHeteroAgent };
});

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
        abilities: { functionCall: true, vision: true },
        id: 'gpt-4',
        providerId: 'openai',
      },
    ],
  };
});

const resumeParams = (overrides: Record<string, unknown> = {}) => ({
  agentId: 'agent-1',
  appContext: {
    sessionId: 'session-1',
    threadId: 'thread-1',
    topicId: 'topic-1',
  },
  parentMessageId: 'parent-msg-1',
  prompt: 'caller prompt is ignored for runtime payload messages',
  resume: true,
  ...overrides,
});

/** The serialized prior turns the execution host receives for this run. */
const dispatchedSystemContext = () =>
  mockSpawnHeteroSandbox.mock.calls[0]?.[0]?.systemContext as string | undefined;

describe('AiAgentService.execAgent - resume mode', () => {
  let service: AiAgentService;
  let recordStartSpy: MockInstance<CompletionLifecycle['recordStart']>;

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(AgentOperationModel.prototype, 'findById').mockResolvedValue(undefined as any);
    vi.spyOn(AgentOperationModel.prototype, 'settleRunning').mockResolvedValue(true);
    recordStartSpy = vi.spyOn(CompletionLifecycle.prototype, 'recordStart').mockResolvedValue(true);
    mockDispatchHeteroAgent.mockImplementation((deps, ctx, input) =>
      realDispatchRef.current!(deps, ctx, input),
    );
    mockSpawnHeteroSandbox.mockResolvedValue(undefined);

    mockFindById.mockResolvedValue({
      id: 'parent-msg-1',
      sessionId: 'session-1',
      threadId: 'thread-1',
      topicId: 'topic-1',
    });

    mockMessageQuery.mockResolvedValue([
      { content: 'history user', id: 'history-1', role: 'user' },
      { content: 'history assistant', id: 'history-2', role: 'assistant' },
    ]);

    mockMessageCreate.mockResolvedValue({ id: 'assistant-msg-new' });
    mockQueryTree.mockResolvedValue([]);

    service = new AiAgentService({} as any, 'user-1');
  });

  afterEach(() => {
    recordStartSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('should create only a new assistant message in resume mode and use caller appContext', async () => {
    await service.execAgent(resumeParams());

    expect(mockFindById).toHaveBeenCalledWith('parent-msg-1');
    // The topic history loads inside dispatch, bounded + share-visitor-allowed.
    expect(mockMessageQuery).toHaveBeenCalledWith(
      { pageSize: 200, topicId: 'topic-1' },
      { allowShareVisitor: true },
    );
    expect(mockMessageCreate).toHaveBeenCalledTimes(1);
    expect(mockMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.any(String),
        parentId: 'parent-msg-1',
        role: 'assistant',
        threadId: 'thread-1',
        topicId: 'topic-1',
      }),
      undefined,
    );

    // The run context carries the caller's appContext, and the surviving
    // history reaches the host serialized inside systemContext.
    const ctx = mockDispatchHeteroAgent.mock.calls[0][1];
    expect(ctx.appContext).toEqual(
      expect.objectContaining({ threadId: 'thread-1', topicId: 'topic-1' }),
    );
    expect(ctx.parentMessageId).toBe('parent-msg-1');
    const systemContext = dispatchedSystemContext();
    expect(systemContext).toContain('<previous_conversation>');
    expect(systemContext).toContain('history user');
    expect(systemContext).toContain('history assistant');
  });

  it('should reject missing appContext in resume mode', async () => {
    await expect(
      service.execAgent({
        agentId: 'agent-1',
        parentMessageId: 'parent-msg-1',
        prompt: '',
        resume: true,
      }),
    ).rejects.toThrow('appContext is required when resume is true');
  });

  it('should reject appContext.topicId mismatch in resume mode', async () => {
    await expect(
      service.execAgent(
        resumeParams({
          appContext: {
            sessionId: 'session-1',
            threadId: 'thread-1',
            topicId: 'topic-other',
          },
        }),
      ),
    ).rejects.toThrow('appContext.topicId does not match parent message');
  });

  it('should require parentMessageId when resume is true', async () => {
    await expect(
      service.execAgent({
        agentId: 'agent-1',
        prompt: '',
        resume: true,
      }),
    ).rejects.toThrow('parentMessageId is required when resume is true');
  });

  // Regression: gateway/server-runtime regenerate must replace, not continue.
  // The flat topic query returns the anchor user message's existing answer
  // branch; feeding it back makes the agent continue the old answer
  // ([U1, A1] -> continue) instead of producing a fresh one ([U1] -> A2).
  it('regenerate: drops the anchor user message existing answer branch from history', async () => {
    mockFindById.mockResolvedValue({
      id: 'u1',
      role: 'user',
      sessionId: 'session-1',
      threadId: 'thread-1',
      topicId: 'topic-1',
    });

    mockMessageQuery.mockResolvedValue([
      { content: 'prior question', id: 'prior-u', role: 'user' },
      { content: 'prior answer', id: 'prior-a', parentId: 'prior-u', role: 'assistant' },
      { content: 'the question', id: 'u1', parentId: 'prior-a', role: 'user' },
      // Old answer being regenerated — must NOT be fed back as context.
      { content: 'OLD answer', id: 'a1', parentId: 'u1', role: 'assistant' },
    ]);
    mockQueryTree.mockResolvedValue([
      { id: 'prior-u', messageGroupId: null, parentId: null },
      { id: 'prior-a', messageGroupId: null, parentId: 'prior-u' },
      { id: 'u1', messageGroupId: null, parentId: 'prior-a' },
      { id: 'a1', messageGroupId: null, parentId: 'u1' },
    ]);

    await service.execAgent(resumeParams({ parentMessageId: 'u1', prompt: 'ignored' }));

    const systemContext = dispatchedSystemContext();
    expect(systemContext).toContain('prior question');
    expect(systemContext).toContain('prior answer');
    expect(systemContext).toContain('the question');
    expect(systemContext).not.toContain('OLD answer');
  });

  // Regression: regenerating a MIDDLE turn must also drop the turns that
  // continued from it (they live on the old branch), so history ends at U1.
  it('regenerate: drops later turns that continued from the anchor (middle-turn regenerate)', async () => {
    mockFindById.mockResolvedValue({
      id: 'u1',
      role: 'user',
      sessionId: 'session-1',
      threadId: 'thread-1',
      topicId: 'topic-1',
    });

    mockMessageQuery.mockResolvedValue([
      { content: 'the question', id: 'u1', role: 'user' },
      { content: 'OLD answer', id: 'a1', parentId: 'u1', role: 'assistant' },
      { content: 'follow-up question', id: 'u2', parentId: 'a1', role: 'user' },
      { content: 'follow-up answer', id: 'a2', parentId: 'u2', role: 'assistant' },
    ]);
    mockQueryTree.mockResolvedValue([
      { id: 'u1', messageGroupId: null, parentId: null },
      { id: 'a1', messageGroupId: null, parentId: 'u1' },
      { id: 'u2', messageGroupId: null, parentId: 'a1' },
      { id: 'a2', messageGroupId: null, parentId: 'u2' },
    ]);

    await service.execAgent(resumeParams({ parentMessageId: 'u1', prompt: 'ignored' }));

    const systemContext = dispatchedSystemContext();
    expect(systemContext).toContain('the question');
    expect(systemContext).not.toContain('OLD answer');
    expect(systemContext).not.toContain('follow-up question');
    expect(systemContext).not.toContain('follow-up answer');
  });

  // Regression: after /compact, the old branch is hidden inside a compression
  // group and `query` returns a synthetic `compressedGroup` node that carries no
  // `parentId`. Pruning must use the raw message tree so the group (whose members
  // descend from the anchor) is dropped instead of being fed back as a summary.
  // (The role filter also excludes `compressedGroup` from conversationHistory,
  // so the summary never reaches the host either way — the prune is what keeps
  // the flat-query members of the group out.)
  it('regenerate: drops a compressedGroup node whose compacted members descend from the anchor', async () => {
    mockFindById.mockResolvedValue({
      id: 'u1',
      role: 'user',
      sessionId: 'session-1',
      threadId: 'thread-1',
      topicId: 'topic-1',
    });

    // `query` hides the grouped messages and injects a synthetic group node
    // (id = group id, role = 'compressedGroup', no parentId).
    mockMessageQuery.mockResolvedValue([
      { content: 'prior question', id: 'prior-u', role: 'user' },
      { content: 'prior answer', id: 'prior-a', parentId: 'prior-u', role: 'assistant' },
      { content: 'the question', id: 'u1', parentId: 'prior-a', role: 'user' },
      { content: 'summary of old branch', id: 'grp-1', role: 'compressedGroup' },
    ]);
    // Raw tree still has the hidden members linked to the anchor via parentId.
    mockQueryTree.mockResolvedValue([
      { id: 'prior-u', messageGroupId: null, parentId: null },
      { id: 'prior-a', messageGroupId: null, parentId: 'prior-u' },
      { id: 'u1', messageGroupId: null, parentId: 'prior-a' },
      { id: 'a1', messageGroupId: 'grp-1', parentId: 'u1' },
      { id: 'u2', messageGroupId: 'grp-1', parentId: 'a1' },
      { id: 'a2', messageGroupId: 'grp-1', parentId: 'u2' },
    ]);

    await service.execAgent(resumeParams({ parentMessageId: 'u1', prompt: 'ignored' }));

    const systemContext = dispatchedSystemContext();
    expect(systemContext).toContain('prior question');
    expect(systemContext).toContain('prior answer');
    expect(systemContext).toContain('the question');
    expect(systemContext).not.toContain('summary of old branch');
  });

  // Guard: a compression group of PRIOR turns (not descended from the anchor)
  // must not prune the anchor turn itself — it is legitimate earlier context.
  // (As above, `compressedGroup` nodes are not user/assistant turns, so only
  // the anchor's own content reaches the host.)
  it('regenerate: keeps the anchor when an earlier compression group precedes it', async () => {
    mockFindById.mockResolvedValue({
      id: 'u1',
      role: 'user',
      sessionId: 'session-1',
      threadId: 'thread-1',
      topicId: 'topic-1',
    });

    mockMessageQuery.mockResolvedValue([
      { content: 'summary of early turns', id: 'grp-0', role: 'compressedGroup' },
      { content: 'the question', id: 'u1', parentId: 'old-a', role: 'user' },
      { content: 'OLD answer', id: 'a1', parentId: 'u1', role: 'assistant' },
    ]);
    mockQueryTree.mockResolvedValue([
      { id: 'old-u', messageGroupId: 'grp-0', parentId: null },
      { id: 'old-a', messageGroupId: 'grp-0', parentId: 'old-u' },
      { id: 'u1', messageGroupId: null, parentId: 'old-a' },
      { id: 'a1', messageGroupId: null, parentId: 'u1' },
    ]);

    await service.execAgent(resumeParams({ parentMessageId: 'u1', prompt: 'ignored' }));

    const systemContext = dispatchedSystemContext();
    expect(systemContext).toContain('the question');
    expect(systemContext).not.toContain('OLD answer');
    expect(systemContext).not.toContain('summary of early turns');
  });

  // Guard: the human-approval resume path anchors on a tool message and must
  // keep the in-flight turn — tool-role rows never enter conversationHistory,
  // but pruning must not drop the user/assistant turns around them.
  it('resume on a non-user anchor (tool message) keeps the surrounding turn', async () => {
    mockFindById.mockResolvedValue({
      id: 'tool-1',
      role: 'tool',
      sessionId: 'session-1',
      threadId: 'thread-1',
      topicId: 'topic-1',
    });

    mockMessageQuery.mockResolvedValue([
      { content: 'q', id: 'u1', role: 'user' },
      { content: 'a with tool calls', id: 'a1', parentId: 'u1', role: 'assistant' },
      { content: 'tool result A', id: 'tool-1', parentId: 'a1', role: 'tool' },
      { content: 'tool result B', id: 'tool-2', parentId: 'a1', role: 'tool' },
    ]);

    await service.execAgent(resumeParams({ parentMessageId: 'tool-1', prompt: '' }));

    const systemContext = dispatchedSystemContext();
    expect(systemContext).toContain('q');
    expect(systemContext).toContain('a with tool calls');
    expect(systemContext).not.toContain('tool result A');
    expect(systemContext).not.toContain('tool result B');
  });
});
