import type * as ModelBankModule from 'model-bank';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AiAgentService } from '../index';

// The three-state plugin config (legacy string = pinned, { mode: 'pinned' },
// { mode: 'disabled' }) used to feed Mecha's tools engine; under ACP it feeds
// `resolveRunToolSurface`, whose output rides the dispatch input as
// builtinToolSpecs/capabilityContext. Non-builtin plugins (market, composio,
// custom, DB skills) have no server executor to mount, so the boundary sees
// only builtin identifiers — the matrix itself is covered in
// runToolSurface.test.ts; these tests pin the execAgent → surface plumbing.
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

const baseAgentConfig = (plugins: unknown[], overrides: Record<string, unknown> = {}) => ({
  chatConfig: {},
  id: 'agent-1',
  model: 'gpt-4',
  plugins,
  provider: 'openai',
  systemRole: 'You are a helper',
  ...overrides,
});

const builtinSpecIds = () =>
  mockDispatchHeteroAgent.mock.calls[0][2].builtinToolSpecs.map(
    (spec: { identifier: string }) => spec.identifier,
  );

describe('AiAgentService.execAgent - three-state plugin config (pinned/auto/disabled)', () => {
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

  it('excludes a disabled builtin from builtinToolSpecs in a mixed-shape array', async () => {
    mockGetAgentConfig.mockResolvedValue(
      baseAgentConfig(['orvilo-task', { identifier: 'orvilo-agent', mode: 'disabled' }]),
    );

    await service.execAgent({ agentId: 'agent-1', prompt: 'Hello' } as any);

    expect(builtinSpecIds()).toContain('orvilo-task');
    expect(builtinSpecIds()).not.toContain('orvilo-agent');
  });

  it('behaves identically to a pure string array when no entry is disabled', async () => {
    mockGetAgentConfig.mockResolvedValue(baseAgentConfig(['orvilo-task', 'orvilo-agent']));

    await service.execAgent({ agentId: 'agent-1', prompt: 'Hello' } as any);

    expect(builtinSpecIds()).toEqual(expect.arrayContaining(['orvilo-task', 'orvilo-agent']));
  });

  it('restricts an orchestration turn to the exclusive plugin set', async () => {
    mockGetAgentConfig.mockResolvedValue(baseAgentConfig(['orvilo-task']));

    await service.execAgent({
      agentId: 'agent-1',
      exclusivePluginIds: ['orvilo-goal'],
      prompt: 'Submit evidence',
    } as any);

    expect(builtinSpecIds()).toEqual(['orvilo-goal']);
  });

  it('mounts nothing for non-builtin identifiers regardless of mode', async () => {
    mockGetAgentConfig.mockResolvedValue(
      baseAgentConfig(['custom-plugin-xyz', { identifier: 'composio-disabled', mode: 'disabled' }]),
    );

    await service.execAgent({ agentId: 'agent-1', prompt: 'Hello' } as any);

    expect(builtinSpecIds()).toHaveLength(0);
  });
});
