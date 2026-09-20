import type * as ModelBankModule from 'model-bank';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AiAgentService } from '../index';
import type { ExternalToolSurfaceEntry } from '../pipeline/runToolSurface';

const {
  mockConnectorQueryByIdentifiers,
  mockConnectorToolQueryAll,
  mockCreateOperation,
  mockCreateServerAgentToolsEngine,
  mockDispatchHeteroAgent,
  mockGetAgentConfig,
  mockMessageCreate,
  mockPluginQuery,
} = vi.hoisted(() => ({
  mockConnectorQueryByIdentifiers: vi.fn().mockResolvedValue([]),
  mockConnectorToolQueryAll: vi.fn().mockResolvedValue([]),
  mockCreateOperation: vi.fn(),
  mockCreateServerAgentToolsEngine: vi.fn().mockReturnValue({
    generateToolsDetailed: vi.fn().mockReturnValue({ enabledToolIds: [], tools: [] }),
    getEnabledPluginManifests: vi.fn().mockReturnValue(new Map()),
  }),
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

vi.mock('@/server/modules/KeyVaultsEncrypt', () => ({
  KeyVaultsGateKeeper: {
    initWithEnvKey: vi.fn().mockResolvedValue({ decrypt: vi.fn(), encrypt: vi.fn() }),
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

vi.mock('@/database/models/connector', () => ({
  ConnectorModel: vi.fn().mockImplementation(function () {
    return {
      queryByIdentifiers: mockConnectorQueryByIdentifiers,
      resolveByIdentifiers: mockConnectorQueryByIdentifiers,
    };
  }),
}));

vi.mock('@/database/models/connectorTool', () => ({
  ConnectorToolModel: vi.fn().mockImplementation(function () {
    return {
      queryAllByConnectorIds: vi.fn().mockResolvedValue([]),
      queryByConnector: vi.fn().mockResolvedValue([]),
      queryByConnectorIds: mockConnectorToolQueryAll,
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

vi.mock('@/server/services/agentExecution', () => ({
  AgentRuntimeService: vi.fn().mockImplementation(function () {
    return { createOperation: mockCreateOperation };
  }),
}));

// Every execAgent run dispatches through ACP — stub the dispatch boundary and
// assert on the tool surface carried into it (`builtinToolSpecs`).
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
  createServerAgentToolsEngine: mockCreateServerAgentToolsEngine,
  serverMessagesEngine: vi.fn().mockResolvedValue([{ content: 'test', role: 'user' }]),
}));

vi.mock('@/server/services/deviceGateway', () => ({
  deviceGateway: { isConfigured: false, queryDeviceList: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/server/services/deviceGateway', () => ({
  deviceGateway: { isConfigured: false, queryDeviceList: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/server/modules/ModelRuntime', () => ({ initModelRuntimeFromDeploymentConfig: vi.fn() }));

vi.mock('model-bank', async (importOriginal) => {
  const actual = await importOriginal<typeof ModelBankModule>();
  return {
    ...actual,
    ORVILO_DEFAULT_MODEL_LIST: [
      { abilities: { functionCall: true }, id: 'gpt-4', providerId: 'openai' },
    ],
  };
});

const pluginA = {
  customParams: {},
  identifier: 'plugin-a',
  manifest: { api: [{ description: 'x', name: 'x', parameters: {} }], identifier: 'plugin-a' },
} as any;

const connectorOf = (over: Record<string, unknown>) => ({
  credentials: null,
  id: 'c1',
  identifier: 'plugin-a',
  isEnabled: true,
  mcpConnectionType: 'http',
  mcpServerUrl: 'https://mcp.example.com',
  mcpStdioConfig: null,
  name: 'Plugin A connector',
  ...over,
});

// Under ACP the run's tool surface is `builtinToolSpecs` on the dispatch
// input; connector-backed plugins are no longer resolved into it at all.
const builtinSpecIds = () =>
  (mockDispatchHeteroAgent.mock.calls[0][2].builtinToolSpecs as any[]).map(
    (spec) => spec.identifier,
  );

// Connector/MCP-resolved tools ride a separate `externalToolMounts` record
// keyed by candidate identifier — disjoint from `builtinToolSpecs`.
const externalMounts = () =>
  (mockDispatchHeteroAgent.mock.calls[0][2].externalToolMounts ?? {}) as Record<
    string,
    Pick<ExternalToolSurfaceEntry, 'apis' | 'source'>
  >;
const externalMountIds = () => Object.keys(externalMounts());
const externalMountToolNames = () =>
  Object.values(externalMounts()).flatMap((entry) => entry.apis.map((api) => api.name));

describe('AiAgentService.execAgent - connector/plugin overlap', () => {
  let service: AiAgentService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMessageCreate.mockResolvedValue({ id: 'msg-1' });
    mockCreateOperation.mockResolvedValue({
      autoStarted: true,
      messageId: 'queue-msg-1',
      operationId: 'op-123',
      success: true,
    });
    mockGetAgentConfig.mockResolvedValue({
      chatConfig: {},
      id: 'agent-1',
      model: 'gpt-4',
      plugins: ['plugin-a'],
      provider: 'openai',
      systemRole: 'You are a helper',
    });
    mockPluginQuery.mockResolvedValue([pluginA]);
    mockDispatchHeteroAgent.mockResolvedValue({
      autoStarted: true,
      operationId: 'op-123',
      success: true,
      topicId: 'topic-1',
    });
    service = new AiAgentService({} as any, 'test-user-id');
  });

  it('ignores a same-named connector that is disabled', async () => {
    mockConnectorQueryByIdentifiers.mockResolvedValue([connectorOf({ isEnabled: false })]);
    mockConnectorToolQueryAll.mockResolvedValue([
      { permission: 'auto', toolName: 'x', userConnectorId: 'c1' },
    ]);

    await service.execAgent({ agentId: 'agent-1', prompt: 'Hello' } as any);

    // 'plugin-a' is not a builtin tool — nothing mounts on the ACP surface.
    // The connector store IS consulted now (external-tool discovery is the
    // contract); a disabled connector stops before its tools are fetched.
    expect(mockDispatchHeteroAgent).toHaveBeenCalledTimes(1);
    expect(builtinSpecIds()).not.toContain('plugin-a');
    expect(mockConnectorQueryByIdentifiers).toHaveBeenCalledWith(['plugin-a'], 'agent-1');
    expect(mockConnectorToolQueryAll).not.toHaveBeenCalled();
    expect(externalMountIds()).not.toContain('plugin-a');
  });

  it('ignores a same-named connector with no synced tools', async () => {
    mockConnectorQueryByIdentifiers.mockResolvedValue([connectorOf({ isEnabled: true })]);
    mockConnectorToolQueryAll.mockResolvedValue([]);

    await service.execAgent({ agentId: 'agent-1', prompt: 'Hello' } as any);

    expect(builtinSpecIds()).not.toContain('plugin-a');
    expect(mockConnectorQueryByIdentifiers).toHaveBeenCalledWith(['plugin-a'], 'agent-1');
    // Enabled → the tool inventory is fetched and finds nothing to mount.
    expect(mockConnectorToolQueryAll).toHaveBeenCalledWith(['c1']);
    expect(externalMountIds()).not.toContain('plugin-a');
  });

  it('mounts a same-named connector tool as external, never as builtin', async () => {
    mockConnectorQueryByIdentifiers.mockResolvedValue([connectorOf({ isEnabled: true })]);
    mockConnectorToolQueryAll.mockResolvedValue([
      { permission: 'auto', toolName: 'connector-tool-x', userConnectorId: 'c1' },
    ]);

    await service.execAgent({ agentId: 'agent-1', prompt: 'Hello' } as any);

    // The connector's synced tools DO mount — under the connector identifier —
    // but only through the external surface (per-run MCP wire), and the
    // installed-plugin path (empty manifest map) contributes nothing, so a
    // connector row can no longer shadow or replace the plugin entry.
    expect(mockConnectorQueryByIdentifiers).toHaveBeenCalledWith(['plugin-a'], 'agent-1');
    expect(mockConnectorToolQueryAll).toHaveBeenCalledWith(['c1']);
    expect(externalMounts()['plugin-a']?.source).toBe('connector');
    expect(externalMountToolNames()).toEqual(['connector-tool-x']);
    const pluginASpec = (mockDispatchHeteroAgent.mock.calls[0][2].builtinToolSpecs as any[]).find(
      (spec) => spec.identifier === 'plugin-a',
    );
    expect(pluginASpec?.apis.map((api: { name: string }) => api.name)).toEqual([
      'connector-tool-x',
    ]);
  });
});
