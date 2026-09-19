import { AuvManifest } from '@orvilo/builtin-tool-auv';
import { LocalSystemManifest } from '@orvilo/builtin-tool-local-system';
import { RemoteDeviceManifest } from '@orvilo/builtin-tool-remote-device';
import type * as ModelBankModule from 'model-bank';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AiAgentService } from '../index';

const { mockDispatchHeteroAgent, mockGetAgentConfig, mockMessageCreate, mockPluginQuery } =
  vi.hoisted(() => ({
    mockDispatchHeteroAgent: vi.fn(),
    mockGetAgentConfig: vi.fn(),
    mockMessageCreate: vi.fn(),
    mockPluginQuery: vi.fn(),
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
      getAgentConfig: mockGetAgentConfig,
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
      query: mockPluginQuery,
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

// Every execAgent run dispatches through ACP — stub the dispatch boundary and
// assert on the tool surface carried into it (`builtinToolSpecs` /
// `extraSystemContext`).
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
    ],
  };
});

// Helper to create a base agent config
const createBaseAgentConfig = (overrides: Record<string, any> = {}) => ({
  chatConfig: {},
  id: 'agent-1',
  model: 'gpt-4',
  plugins: [],
  provider: 'openai',
  systemRole: '',
  ...overrides,
});

const dispatchInput = () => mockDispatchHeteroAgent.mock.calls[0][2];
const builtinSpecIds = () =>
  dispatchInput().builtinToolSpecs.map((spec: { identifier: string }) => spec.identifier);

/**
 * Under ACP the retired Mecha tool pipeline (toolSet / manifestMap /
 * executorMap / deviceContext) is gone. Builtin tools — including the
 * device-proxy ones (local-system / remote-device / computer-use) whose
 * server runtimes route calls back to the bound device via the gateway —
 * mount on the execution host's per-run MCP server as `builtinToolSpecs`,
 * and their manifest guidance rides `extraSystemContext`. These tests pin
 * that boundary; the surface resolution matrix itself lives in
 * `runToolSurface.test.ts`.
 */
describe('AiAgentService.execAgent - device tools on the ACP surface', () => {
  let service: AiAgentService;
  const mockDb = {} as any;
  const userId = 'test-user-id';

  beforeEach(() => {
    vi.clearAllMocks();
    mockMessageCreate.mockResolvedValue({ id: 'msg-1' });
    mockPluginQuery.mockResolvedValue([]);
    mockDispatchHeteroAgent.mockResolvedValue({
      autoStarted: true,
      operationId: 'op-123',
      success: true,
      topicId: 'topic-1',
    });
    service = new AiAgentService(mockDb, userId);
  });

  it('mounts device-proxy builtin tools requested by the agent', async () => {
    mockGetAgentConfig.mockResolvedValue(
      createBaseAgentConfig({
        plugins: [LocalSystemManifest.identifier, RemoteDeviceManifest.identifier],
      }),
    );

    await service.execAgent({ agentId: 'agent-1', prompt: 'Hello' });

    expect(builtinSpecIds()).toContain(LocalSystemManifest.identifier);
    expect(builtinSpecIds()).toContain(RemoteDeviceManifest.identifier);
    // Their usage guidance ships in the system context channel.
    expect(dispatchInput().extraSystemContext ?? '').toContain(
      LocalSystemManifest.systemRole!.trim().slice(0, 40),
    );
  });

  it('mounts Computer Use when the agent requests it', async () => {
    mockGetAgentConfig.mockResolvedValue(
      createBaseAgentConfig({ plugins: [AuvManifest.identifier] }),
    );

    await service.execAgent({ agentId: 'agent-1', prompt: 'Hello' });

    expect(builtinSpecIds()).toContain(AuvManifest.identifier);
  });

  it('drops builtin tools for a harness that cannot mount MCP servers', async () => {
    // Remote platform agents (openclaw / hermes) are not ACP runtimes — no
    // `builtinToolSpecs` may reach them, so they never advertise uncallable
    // tools.
    mockGetAgentConfig.mockResolvedValue(
      createBaseAgentConfig({
        agencyConfig: { heterogeneousProvider: { type: 'openclaw' } },
        plugins: [LocalSystemManifest.identifier],
      }),
    );

    await service.execAgent({ agentId: 'agent-1', prompt: 'Hello' });

    expect(dispatchInput().builtinToolSpecs).toEqual([]);
  });

  it('gates device tools out in chat mode (enableAgentMode: false)', async () => {
    mockGetAgentConfig.mockResolvedValue(
      createBaseAgentConfig({
        chatConfig: { enableAgentMode: false },
        plugins: [LocalSystemManifest.identifier],
      }),
    );

    await service.execAgent({ agentId: 'agent-1', prompt: 'Hello' });

    expect(builtinSpecIds()).not.toContain(LocalSystemManifest.identifier);
  });

  it('never mounts connector/MCP plugins on the builtin surface', async () => {
    mockGetAgentConfig.mockResolvedValue(createBaseAgentConfig({ plugins: ['my-mcp-plugin'] }));

    await service.execAgent({ agentId: 'agent-1', prompt: 'Hello' });

    expect(builtinSpecIds()).not.toContain('my-mcp-plugin');
  });
});
