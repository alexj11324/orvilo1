import type * as ModelBankModule from 'model-bank';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AiAgentService } from '../index';

// Under ACP there is no per-run operation skill set: builtin tools mount as
// `builtinToolSpecs` on the dispatch input and builtin skills ride
// `capabilityContext`/`extraSystemContext`; DB agent_skills and
// agent-document skills are lazily activated by the `skills` runtime on the
// execution host instead of being eagerly inlined here. `exclusivePluginIds`
// is the caller-driven isolation channel (e.g. a direct /goal prompt from the
// skill-management layer).
const { mockDispatchHeteroAgent, mockGetAgentConfig, mockMessageCreate, mockPluginQuery } =
  vi.hoisted(() => ({
    mockDispatchHeteroAgent: vi.fn(),
    mockGetAgentConfig: vi.fn(),
    mockMessageCreate: vi.fn(),
    mockPluginQuery: vi.fn().mockResolvedValue([]),
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
    return { getAgentConfig: mockGetAgentConfig };
  }),
}));

vi.mock('@/database/models/plugin', () => ({
  PluginModel: vi.fn().mockImplementation(function () {
    return { query: mockPluginQuery };
  }),
}));

vi.mock('@/database/models/topic', () => ({
  TopicModel: vi.fn().mockImplementation(function () {
    return {
      findShareVisitorTopicIds: vi.fn().mockResolvedValue([]),
      releaseTaskCallbackReservation: vi.fn().mockResolvedValue(undefined),
      tryReserveTaskCallback: vi.fn().mockResolvedValue(true),
      create: vi.fn().mockResolvedValue({ id: 'topic-1' }),
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
      createOperation: vi.fn().mockResolvedValue({
        autoStarted: true,
        messageId: 'queue-msg-1',
        operationId: 'op-123',
        success: true,
      }),
    };
  }),
}));

// Every execAgent run dispatches through ACP — stub the dispatch boundary and
// assert on the tool surface carried into it.
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

vi.mock('@/server/services/deviceGateway', () => ({
  deviceGateway: { isConfigured: false, queryDeviceList: vi.fn().mockResolvedValue([]) },
}));

vi.mock('model-bank', async (importOriginal) => {
  const actual = await importOriginal<typeof ModelBankModule>();
  return {
    ...actual,
    ORVILO_DEFAULT_MODEL_LIST: [
      { abilities: { functionCall: true }, id: 'gpt-4', providerId: 'openai' },
    ],
  };
});

const baseAgentConfig = (overrides: Record<string, unknown> = {}) => ({
  chatConfig: {},
  id: 'agent-1',
  model: 'gpt-4',
  plugins: [],
  provider: 'openai',
  systemRole: 'You are a helper',
  ...overrides,
});

const dispatchInput = () => mockDispatchHeteroAgent.mock.calls[0][2];
const builtinSpecIds = () =>
  dispatchInput().builtinToolSpecs.map((spec: { identifier: string }) => spec.identifier);

describe('AiAgentService.execAgent - run tool surface', () => {
  let service: AiAgentService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMessageCreate.mockResolvedValue({ id: 'msg-1' });
    mockDispatchHeteroAgent.mockResolvedValue({
      autoStarted: true,
      operationId: 'op-123',
      success: true,
      topicId: 'topic-1',
    });
    service = new AiAgentService({} as any, 'test-user-id');
  });

  it('mounts pinned builtin tools as builtinToolSpecs on the dispatch input', async () => {
    mockGetAgentConfig.mockResolvedValue(baseAgentConfig({ plugins: ['orvilo-task'] }));

    await service.execAgent({ agentId: 'agent-1', prompt: 'Hello' } as any);

    expect(builtinSpecIds()).toContain('orvilo-task');
    // The tool's usage guidance also reaches the run via extraSystemContext.
    expect(dispatchInput().extraSystemContext).toBeDefined();
  });

  it('restricts the surface to exclusivePluginIds (the /goal isolation channel)', async () => {
    mockGetAgentConfig.mockResolvedValue(
      baseAgentConfig({ plugins: ['orvilo-agent', 'orvilo-task'] }),
    );

    await service.execAgent({
      agentId: 'agent-1',
      exclusivePluginIds: ['orvilo-goal'],
      prompt: '/goal ship it',
      selectedToolIds: ['selected-tool'],
    } as any);

    expect(builtinSpecIds()).toEqual(['orvilo-goal']);
  });

  it('merges turn-scoped selectedToolIds into the surface', async () => {
    mockGetAgentConfig.mockResolvedValue(baseAgentConfig({ plugins: ['orvilo-agent'] }));

    await service.execAgent({
      agentId: 'agent-1',
      prompt: 'Hello',
      selectedToolIds: ['orvilo-task'],
    } as any);

    expect(builtinSpecIds()).toContain('orvilo-task');
    expect(builtinSpecIds()).toContain('orvilo-agent');
  });

  it('mounts no spec for DB or document skills — they activate lazily on the host', async () => {
    // 'db-skill-pinned' is not a builtin tool identifier: nothing crosses the
    // dispatch boundary for it. The `skills` runtime resolves and injects it
    // host-side when the model calls activateSkill.
    mockGetAgentConfig.mockResolvedValue(
      baseAgentConfig({ plugins: ['db-skill-pinned', 'agent-skills:foo'] }),
    );

    await service.execAgent({ agentId: 'agent-1', prompt: 'Hello' } as any);

    expect(builtinSpecIds()).not.toContain('db-skill-pinned');
    expect(builtinSpecIds()).not.toContain('agent-skills:foo');
  });
});
