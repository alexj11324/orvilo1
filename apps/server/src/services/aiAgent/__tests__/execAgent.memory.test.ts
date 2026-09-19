import type * as ModelBankModule from 'model-bank';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AiAgentService } from '../index';

// Under the retired model loop `memory.enabled` (agent chatConfig over
// userSettings) decided whether the `orvilo-user-memory` tool list reached the
// model. Under ACP the tool mounts iff the agent pins it — the dispatch input
// carries the spec — and `memory.enabled` now gates only background memory
// EXTRACTION (`memory/userMemory/gate.ts`), not the per-run tool surface.
// These tests pin that contract so the semantic change is explicit.
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

vi.mock('../pipeline/heteroDispatch', () => ({
  dispatchHeteroAgent: mockDispatchHeteroAgent,
}));

vi.mock('@/server/services/deviceGateway', () => ({
  deviceGateway: { isConfigured: false, queryDeviceList: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/server/services/file', () => ({
  FileService: vi.fn().mockImplementation(function () {
    return { uploadFromUrl: vi.fn() };
  }),
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
  plugins: ['orvilo-user-memory'],
  provider: 'openai',
  systemRole: 'You are a helper',
  ...overrides,
});

const builtinSpecIds = () =>
  mockDispatchHeteroAgent.mock.calls[0][2].builtinToolSpecs.map(
    (spec: { identifier: string }) => spec.identifier,
  );

describe('execAgent - memory tool surface', () => {
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

  it('mounts the memory tool when the agent pins orvilo-user-memory', async () => {
    mockGetAgentConfig.mockResolvedValue(baseAgentConfig());

    await service.execAgent({ agentId: 'agent-1', prompt: 'Hello' } as any);

    expect(builtinSpecIds()).toContain('orvilo-user-memory');
  });

  it('still mounts when chatConfig.memory.enabled is false — the toggle gates extraction, not mounting', async () => {
    mockGetAgentConfig.mockResolvedValue(
      baseAgentConfig({ chatConfig: { memory: { enabled: false } } }),
    );

    await service.execAgent({ agentId: 'agent-1', prompt: 'Hello' } as any);

    expect(builtinSpecIds()).toContain('orvilo-user-memory');
  });

  it('mounts nothing when the agent does not pin the memory tool', async () => {
    mockGetAgentConfig.mockResolvedValue(baseAgentConfig({ plugins: [] }));

    await service.execAgent({ agentId: 'agent-1', prompt: 'Hello' } as any);

    expect(builtinSpecIds()).not.toContain('orvilo-user-memory');
  });

  it('honours a disabled entry for the pinned memory tool', async () => {
    mockGetAgentConfig.mockResolvedValue(
      baseAgentConfig({ plugins: [{ identifier: 'orvilo-user-memory', mode: 'disabled' }] }),
    );

    await service.execAgent({ agentId: 'agent-1', prompt: 'Hello' } as any);

    expect(builtinSpecIds()).not.toContain('orvilo-user-memory');
  });
});
