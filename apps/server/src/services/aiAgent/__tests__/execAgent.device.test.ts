import type * as ModelBankModule from 'model-bank';
import type { MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentOperationModel } from '@/database/models/agentOperation';
import { CompletionLifecycle } from '@/server/services/agentExecution/CompletionLifecycle';

import { orviloDeviceFencedToEmbedded } from '../helpers/heteroErrors';
import { AiAgentService } from '../index';
import type { dispatchHeteroAgent } from '../pipeline/heteroDispatch';

const {
  mockDeviceFindByDeviceId,
  mockDeviceFindWorkspaceDeviceById,
  mockDispatchAgentRun,
  mockDispatchHeteroAgent,
  mockExecuteToolCall,
  mockGetHeterogeneousResumeSessionId,
  mockMessageCreate,
  mockMessageUpdate,
  mockSpawnHeteroSandbox,
  realDispatchRef,
} = vi.hoisted(() => ({
  mockDeviceFindByDeviceId: vi.fn(),
  mockDeviceFindWorkspaceDeviceById: vi.fn(),
  mockDispatchAgentRun: vi.fn(),
  mockDispatchHeteroAgent: vi.fn(),
  mockExecuteToolCall: vi.fn(),
  mockGetHeterogeneousResumeSessionId: vi.fn(),
  mockMessageCreate: vi.fn(),
  mockMessageUpdate: vi.fn(),
  mockSpawnHeteroSandbox: vi.fn(),
  // The unmocked dispatch, captured by the factory below; the mock delegates
  // to it so tests observe the call AND the real routing pipeline runs.
  realDispatchRef: (() => {
    const ref: { current: typeof dispatchHeteroAgent | null } = { current: null };
    return ref;
  })(),
}));

const topicMock = {
  appendRunningOperationChild: vi.fn().mockResolvedValue(true),
  create: vi.fn().mockResolvedValue({ id: 'topic-1', metadata: undefined }),
  findById: vi.fn().mockResolvedValue(undefined),
  findShareVisitorTopicIds: vi.fn().mockResolvedValue([]),
  patchRunningOperation: vi.fn().mockResolvedValue(true),
  releaseTaskCallbackReservation: vi.fn().mockResolvedValue(undefined),
  tryReserveTaskCallback: vi.fn().mockResolvedValue(true),
  updateMetadata: vi.fn().mockResolvedValue(undefined),
};

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
      query: vi.fn().mockResolvedValue([]),
      update: mockMessageUpdate,
    };
  }),
}));

const baseAgentConfig = {
  // An external-agent binding: device/sandbox routing is exercised on
  // claude-code — the builtin orvilo agent's harness is fixed to Prime
  // (docs/development/device-execution-contract.md); device-first routing
  // applies to it equally, so these cases pin the external CLI adapter.
  agencyConfig: { heterogeneousProvider: { type: 'claude-code' } },
  chatConfig: {},
  files: [],
  id: 'agent-1',
  knowledgeBases: [],
  model: 'gpt-4',
  plugins: [],
  provider: 'openai',
  systemRole: 'You are a helpful assistant',
};

vi.mock('@/database/models/agent', () => ({
  AgentModel: vi.fn().mockImplementation(function () {
    return {
      getAgentConfig: vi.fn().mockResolvedValue(baseAgentConfig),
      queryAgents: vi.fn().mockResolvedValue([]),
    };
  }),
}));

vi.mock('@/server/services/agent', () => ({
  AgentService: vi.fn().mockImplementation(function () {
    return {
      getAgentConfig: vi.fn().mockResolvedValue(baseAgentConfig),
    };
  }),
}));

vi.mock('@/database/models/device', () => ({
  DeviceModel: vi.fn().mockImplementation(function () {
    return {
      findByDeviceId: mockDeviceFindByDeviceId,
      findWorkspaceDeviceById: mockDeviceFindWorkspaceDeviceById,
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
    return topicMock;
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

vi.mock('@/server/services/file', () => ({
  FileService: vi.fn().mockImplementation(function () {
    return {
      uploadFromUrl: vi.fn(),
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

// Wrap the real dispatch: the mock still captures the ExecRunContext +
// dispatch input, while the real function resolves the device execution plan
// and reaches the gateway / sandbox spawn — the boundary these tests assert.
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

vi.mock('@/server/services/providerBinding/execution', () => ({
  issueBindingExecution: vi.fn(),
  resolveOrviloProviderBinding: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/server/services/deviceGateway', () => ({
  deviceGateway: {
    dispatchAgentRun: mockDispatchAgentRun,
    executeToolCall: mockExecuteToolCall,
    isConfigured: false,
    queryDeviceList: vi.fn().mockResolvedValue([]),
    resolveDeviceWorkspaceId: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/server/services/deviceGateway/dispatchAuthorization', () => ({
  resolveDeviceDispatchAuthorizationFailure: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/server/services/heterogeneousAgent/remoteDeviceHeteroContext', () => ({
  buildRemoteDeviceHeteroContext: vi.fn().mockReturnValue('device context'),
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

/**
 * Device routing under ACP dispatch. The resolved plan lives inside
 * `dispatchHeteroAgent` (`resolveExecutionPlan` over agencyConfig /
 * requestedDeviceId / canUseDevice); the observable boundaries are
 * `deviceGateway.dispatchAgentRun` (device route), `spawnHeteroSandbox`
 * (cloud-sandbox route) and the returned error result (unrouted device
 * target). Hetero dispatch intentionally trusts the binding — it does NOT
 * consult the online device list, so single-device auto-activation and
 * offline prechecks no longer exist server-side; the gateway errors loudly
 * if the bound device is unreachable.
 */
describe('AiAgentService.execAgent - device routing over ACP dispatch', () => {
  let service: AiAgentService;
  let recordStartSpy: MockInstance<CompletionLifecycle['recordStart']>;
  const mockDb = {} as any;
  const userId = 'test-user-id';

  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatchHeteroAgent.mockImplementation((deps, ctx, input) =>
      realDispatchRef.current!(deps, ctx, input),
    );
    vi.spyOn(AgentOperationModel.prototype, 'findById').mockResolvedValue(undefined as any);
    vi.spyOn(AgentOperationModel.prototype, 'settleRunning').mockResolvedValue(true);
    recordStartSpy = vi.spyOn(CompletionLifecycle.prototype, 'recordStart').mockResolvedValue(true);
    topicMock.create.mockResolvedValue({ id: 'topic-1', metadata: undefined });
    topicMock.findById.mockResolvedValue(undefined);
    mockMessageCreate.mockResolvedValue({ id: 'msg-1' });
    mockMessageUpdate.mockResolvedValue({});
    mockDispatchAgentRun.mockResolvedValue({ success: true });
    mockExecuteToolCall.mockResolvedValue({ success: true });
    mockSpawnHeteroSandbox.mockResolvedValue(undefined);
    mockGetHeterogeneousResumeSessionId.mockResolvedValue(undefined);
    mockDeviceFindByDeviceId.mockResolvedValue(undefined);
    mockDeviceFindWorkspaceDeviceById.mockResolvedValue(undefined);

    service = new AiAgentService(mockDb, userId);
  });

  afterEach(() => {
    recordStartSpy.mockRestore();
    vi.restoreAllMocks();
  });

  // Override the agent's agencyConfig and rebuild the service.
  const useAgencyConfig = async (agencyConfig: Record<string, unknown>) => {
    const { AgentService } = await import('@/server/services/agent');
    vi.mocked(AgentService).mockImplementation(function () {
      return {
        getAgentConfig: vi.fn().mockResolvedValue({
          ...baseAgentConfig,
          agencyConfig: {
            heterogeneousProvider: { type: 'claude-code' },
            ...agencyConfig,
          },
        }),
      } as any;
    });
    service = new AiAgentService(mockDb, userId);
  };

  describe('default and sandbox targets', () => {
    it('fails a default (unset-target) run loudly — no silent cloud-sandbox fallback', async () => {
      // No agencyConfig → the synthesized binding resolves `none` — a pending
      // selection under the unified execution-target contract. Dispatch must
      // surface it instead of silently routing to whichever host is handy.
      const result = await service.execAgent({ agentId: 'agent-1', prompt: 'List my files' });

      expect(mockSpawnHeteroSandbox).not.toHaveBeenCalled();
      expect(mockDispatchAgentRun).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        autoStarted: false,
        error: 'No bound device',
        success: false,
      });
    });

    it('routes an explicit sandbox target to the cloud sandbox', async () => {
      await useAgencyConfig({ boundDeviceId: 'device-001', executionTarget: 'sandbox' });

      await service.execAgent({ agentId: 'agent-1', prompt: 'List my files' });

      expect(mockSpawnHeteroSandbox).toHaveBeenCalled();
      expect(mockDispatchAgentRun).not.toHaveBeenCalled();
    });

    it('leaves an explicit `none` target pending instead of falling back to the sandbox', async () => {
      await useAgencyConfig({ executionTarget: 'none' });

      const result = await service.execAgent({ agentId: 'agent-1', prompt: 'List my files' });

      expect(mockSpawnHeteroSandbox).not.toHaveBeenCalled();
      expect(mockDispatchAgentRun).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        autoStarted: false,
        error: 'No bound device',
        success: false,
      });
    });

    it('keeps a bound device unrouted when the fixed target is sandbox', async () => {
      await useAgencyConfig({
        boundDeviceId: 'device-001',
        executionTarget: 'sandbox',
        executionTargetSelectionPolicy: 'fixed',
      });
      // `fixed` only engages for workspace-shared agents — the policy strips
      // the request's deviceId override entirely.
      service = new AiAgentService(mockDb, userId, { workspaceId: 'workspace-1' });

      await service.execAgent({
        agentId: 'agent-1',
        deviceId: 'device-001',
        prompt: 'Run a command',
      });

      expect(mockDispatchAgentRun).not.toHaveBeenCalled();
      expect(mockSpawnHeteroSandbox).toHaveBeenCalled();
      expect(topicMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            executionConfig: expect.objectContaining({ executionTarget: 'sandbox' }),
          }),
        }),
        undefined,
      );
    });
  });

  describe('device targets route through the gateway', () => {
    it('dispatches to the bound device under executionTarget: device', async () => {
      await useAgencyConfig({ boundDeviceId: 'device-001', executionTarget: 'device' });

      await service.execAgent({ agentId: 'agent-1', prompt: 'Run a command' });

      expect(mockDispatchAgentRun).toHaveBeenCalledWith(
        expect.objectContaining({ deviceId: 'device-001' }),
      );
      expect(mockSpawnHeteroSandbox).not.toHaveBeenCalled();
    });

    it('upgrades a bound `local` target to the bound device (server-side run)', async () => {
      await useAgencyConfig({ boundDeviceId: 'device-001', executionTarget: 'local' });

      await service.execAgent({ agentId: 'agent-1', prompt: 'Run a command' });

      expect(mockDispatchAgentRun).toHaveBeenCalledWith(
        expect.objectContaining({ deviceId: 'device-001' }),
      );
    });

    it('routes a `local` run to its bound device instead of auto-picking', async () => {
      await useAgencyConfig({ boundDeviceId: 'device-001', executionTarget: 'local' });

      await service.execAgent({ agentId: 'agent-1', prompt: 'Run a command' });

      expect(mockDispatchAgentRun).toHaveBeenCalledWith(
        expect.objectContaining({ deviceId: 'device-001' }),
      );
    });

    it('fails an unbound `local` run loudly (auto has no online-device visibility)', async () => {
      // An unbound `local` target upgrades to `auto`, but hetero dispatch
      // carries no onlineDeviceIds — auto can never resolve, so the run stays
      // unrouted rather than silently landing on the cloud sandbox.
      await useAgencyConfig({ executionTarget: 'local' });

      const result = await service.execAgent({
        agentId: 'agent-1',
        prompt: 'Run a command',
      });

      expect(mockDispatchAgentRun).not.toHaveBeenCalled();
      expect(mockSpawnHeteroSandbox).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        autoStarted: false,
        error: 'No bound device',
        success: false,
      });
    });

    it('honours an explicit deviceId request over the stored sandbox target', async () => {
      await useAgencyConfig({ executionTarget: 'sandbox' });

      await service.execAgent({
        agentId: 'agent-1',
        deviceId: 'device-001',
        prompt: 'Run a command',
      });

      // requestedDeviceId forces device routing regardless of the stored
      // target (the shared policy isn't `fixed`).
      expect(mockDispatchAgentRun).toHaveBeenCalledWith(
        expect.objectContaining({ deviceId: 'device-001' }),
      );
      expect(topicMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ boundDeviceId: 'device-001' }),
        }),
        undefined,
      );
    });

    it('keeps the shared fixed device even when the request asks for another', async () => {
      await useAgencyConfig({
        boundDeviceId: 'device-001',
        executionTarget: 'device',
        executionTargetSelectionPolicy: 'fixed',
      });
      service = new AiAgentService(mockDb, userId, { workspaceId: 'workspace-1' });

      await service.execAgent({
        agentId: 'agent-1',
        deviceId: 'device-002',
        prompt: 'Run a command',
      });

      expect(mockDispatchAgentRun).toHaveBeenCalledWith(
        expect.objectContaining({ deviceId: 'device-001' }),
      );
      expect(topicMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ boundDeviceId: 'device-001' }),
        }),
        undefined,
      );
    });

    it('does not reuse topic metadata boundDeviceId as the runtime binding', async () => {
      // A stale `metadata.boundDeviceId` on the topic is a display record, not
      // a routing input: with an explicit request the run goes to the
      // requested device; the topic binding is not consulted.
      topicMock.findById.mockResolvedValue({ metadata: { boundDeviceId: 'device-002' } });
      await useAgencyConfig({ executionTarget: 'sandbox' });

      await service.execAgent({
        agentId: 'agent-1',
        appContext: { topicId: 'topic-1' },
        deviceId: 'device-001',
        prompt: 'Run a command',
      });

      expect(mockDispatchAgentRun).toHaveBeenCalledWith(
        expect.objectContaining({ deviceId: 'device-001' }),
      );
    });

    it('does not update topic metadata when a new deviceId is provided for an existing topic', async () => {
      topicMock.findById.mockResolvedValue({
        id: 'topic-1',
        metadata: { boundDeviceId: 'device-old' },
      });
      await useAgencyConfig({ boundDeviceId: 'device-002', executionTarget: 'device' });

      await service.execAgent({
        agentId: 'agent-1',
        appContext: { topicId: 'topic-1' },
        deviceId: 'device-002',
        prompt: 'Switch device',
      });

      // updateMetadata is called for working-directory persistence, but not
      // for device binding — the request param is not written back.
      expect(topicMock.updateMetadata).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ boundDeviceId: expect.anything() }),
      );
      expect(mockDispatchAgentRun).toHaveBeenCalledWith(
        expect.objectContaining({ deviceId: 'device-002' }),
      );
    });
  });

  describe('device-capable targets without a bound device fail before dispatch', () => {
    it.each(['auto', 'device'] as const)(
      'reports the bound-device error for an unbound %s target',
      async (executionTarget) => {
        // `auto` can't pick without online visibility (hetero dispatch never
        // queries the online list) and `device` has no binding — both stay
        // unrouted and surface the bound-device error instead of grabbing a
        // device or silently falling back to the sandbox.
        await useAgencyConfig({ executionTarget });

        const result = await service.execAgent({
          agentId: 'agent-1',
          prompt: 'Run a command',
        });

        expect(mockDispatchAgentRun).not.toHaveBeenCalled();
        expect(mockSpawnHeteroSandbox).not.toHaveBeenCalled();
        expect(result).toMatchObject({ error: 'No bound device', success: false });
      },
    );

    it('surfaces the gateway DEVICE_NOT_FOUND when the trusted binding is unreachable', async () => {
      // The dispatch trusts the bound device; the gateway is where an offline
      // device fails loudly. The failure lands on the assistant message and the
      // returned result — it does not reject the call.
      await useAgencyConfig({ boundDeviceId: 'device-001', executionTarget: 'device' });
      mockDispatchAgentRun.mockResolvedValue({
        error: 'DEVICE_NOT_FOUND',
        errorData: {
          code: 'DEVICE_NOT_FOUND',
          deviceId: 'device-001',
          retryable: true,
          scope: 'personal',
        },
        success: false,
      });

      const result = await service.execAgent({
        agentId: 'agent-1',
        prompt: 'Run a command',
      });

      expect(mockDispatchAgentRun).toHaveBeenCalledWith(
        expect.objectContaining({ deviceId: 'device-001' }),
      );
      expect(result).toMatchObject({ error: 'DEVICE_NOT_FOUND', success: false });
    });
  });

  describe('aegis method-pack opt-in', () => {
    it('stamps the env bit + op metadata on an enabled device run', async () => {
      await useAgencyConfig({
        boundDeviceId: 'device-001',
        executionTarget: 'device',
        heterogeneousProvider: { methodPacks: { aegis: true }, type: 'claude-code' },
      });

      await service.execAgent({ agentId: 'agent-1', prompt: 'Run a command' });

      expect(mockDispatchAgentRun).toHaveBeenCalledWith(
        expect.objectContaining({
          env: expect.objectContaining({ ORVILO_AEGIS_PACK: '1' }),
        }),
      );
      expect(recordStartSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ aegis: { enabled: true } }),
        }),
      );
    });

    it('injects the .aegis/ completion contract + env bit on an enabled sandbox run', async () => {
      await useAgencyConfig({
        executionTarget: 'sandbox',
        heterogeneousProvider: { methodPacks: { aegis: true }, type: 'claude-code' },
      });

      await service.execAgent({ agentId: 'agent-1', prompt: 'Run a command' });

      expect(mockSpawnHeteroSandbox).toHaveBeenCalledWith(
        expect.objectContaining({
          env: expect.objectContaining({ ORVILO_AEGIS_PACK: '1' }),
        }),
      );
      // The deterministic contract rides the cloud system context verbatim —
      // the agent gets the exact `.aegis/closeout.json` shape the gate reads.
      expect(mockSpawnHeteroSandbox.mock.calls[0]?.[0]?.systemContext).toContain(
        '.aegis/closeout.json',
      );
    });

    it('does not set the env bit when the pack is not configured', async () => {
      await useAgencyConfig({
        boundDeviceId: 'device-001',
        executionTarget: 'device',
        heterogeneousProvider: { type: 'claude-code' },
      });

      await service.execAgent({ agentId: 'agent-1', prompt: 'Run a command' });

      expect(mockDispatchAgentRun).toHaveBeenCalledWith(
        expect.objectContaining({ deviceId: 'device-001' }),
      );
      expect(mockDispatchAgentRun.mock.calls[0]?.[0]?.env?.ORVILO_AEGIS_PACK).toBeUndefined();
      expect(recordStartSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.not.objectContaining({ aegis: expect.anything() }),
        }),
      );
    });
  });

  // TRANSITIONAL — device-execution-contract.md §transitional-fence. The
  // device-side Prime adapter ships in a follow-up; until it does, builtin
  // orvilo plans that resolve to a device stay fenced to the embedded fork
  // (pre-cutover they ran that path silently — refusing them outright would
  // break normal chat mid-cutover). The package that admits the adapter
  // must DELETE this describe and the `orviloDeviceFencedToEmbedded`
  // predicate: these assertions are the flip pin and fail as soon as the
  // fence comes down.
  describe('transitional embedded fence (orvilo device plans → embedded fork)', () => {
    it('pins the fence predicate — orvilo fenced, external types unfenced', () => {
      expect(orviloDeviceFencedToEmbedded('orvilo')).toBe(true);
      expect(orviloDeviceFencedToEmbedded('claude-code')).toBe(false);
      expect(orviloDeviceFencedToEmbedded('codex')).toBe(false);
    });

    it('keeps a device-resolved orvilo run off the device gateway', async () => {
      await useAgencyConfig({
        boundDeviceId: 'device-001',
        executionTarget: 'device',
        heterogeneousProvider: { type: 'orvilo' },
      });

      const result = await service.execAgent({ agentId: 'agent-1', prompt: 'Run a command' });

      // Fenced: the resolved deviceId never reaches the device gateway, and
      // no engine CLI is spawned either (orvilo wraps no CLI anymore).
      expect(mockDispatchAgentRun).not.toHaveBeenCalled();
      expect(mockSpawnHeteroSandbox).not.toHaveBeenCalled();
      // The run surfaces the embedded-admission boundary for a context the
      // embedded host does not admit yet — identical to a sandbox-plan run.
      expect(result).toMatchObject({ error: 'EMBEDDED_CHAT_NOT_ADMITTED' });
    });
  });
});
