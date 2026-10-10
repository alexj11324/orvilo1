import { DeviceTransportErrorCode } from '@orvilo/device-gateway-client';
import { TRPCError } from '@trpc/server';
import type * as ModelBankModule from 'model-bank';
import type { MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentOperationModel } from '@/database/models/agentOperation';
import type * as FeatureFlagsModule from '@/server/featureFlags';
import { assertCanUseWorkspaceAgent } from '@/server/routers/lambda/_helpers/workspaceAgentGuard';
import { CompletionLifecycle } from '@/server/services/agentExecution/CompletionLifecycle';
import { resolveDeviceDispatchAuthorizationFailure } from '@/server/services/deviceGateway/dispatchAuthorization';

import { AiAgentService } from '../index';
import type { dispatchHeteroAgent } from '../pipeline/heteroDispatch';
import { createDispatchTestDb } from './dispatchAdmission.test-utils';

const { mockSandboxFeatureFlags } = vi.hoisted(() => ({
  mockSandboxFeatureFlags: vi.fn(),
}));

vi.mock('@/server/routers/lambda/_helpers/workspaceAgentGuard', () => ({
  assertCanUseWorkspaceAgent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/server/featureFlags', async (importOriginal) => ({
  ...(await importOriginal<typeof FeatureFlagsModule>()),
  getServerFeatureFlagsStateFromRuntimeConfig: mockSandboxFeatureFlags,
}));

const {
  mockComposeDevicePrimeRun,
  mockDeviceFindByDeviceId,
  mockDeviceFindWorkspaceDeviceById,
  mockDispatchAgentRun,
  mockDispatchHeteroAgent,
  mockExecuteToolCall,
  mockGetHeterogeneousResumeSessionId,
  mockMessageCreate,
  mockMessageUpdate,
  mockOpenEmbeddedChatDispatchHost,
  mockSpawnHeteroSandbox,
  realDispatchRef,
} = vi.hoisted(() => ({
  mockComposeDevicePrimeRun: vi.fn(),
  mockDeviceFindByDeviceId: vi.fn(),
  mockDeviceFindWorkspaceDeviceById: vi.fn(),
  mockDispatchAgentRun: vi.fn(),
  mockDispatchHeteroAgent: vi.fn(),
  mockExecuteToolCall: vi.fn(),
  mockGetHeterogeneousResumeSessionId: vi.fn(),
  mockMessageCreate: vi.fn(),
  mockMessageUpdate: vi.fn(),
  mockOpenEmbeddedChatDispatchHost: vi.fn(),
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

const mockPrimeDescriptor = {
  artifact: {
    bytes: 1234,
    commit: '7d442aafa985f9342134fac16c2ef41f03fb45c1',
    license: 'MIT',
    sha256: '0'.repeat(64),
    version: '0.9.8',
  },
  broker: { credential: 'op-jwt' },
  lease: { ttlMs: 300_000 },
  model: { id: 'gpt-4', maxOutputTokens: 4096 },
  subject: { kind: 'conversation', topicId: 'topic-1' },
};

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
      // Unified admission's authorized candidate set — the devices this suite
      // routes to are registered in both scopes (workspace runs query the
      // workspace list, personal runs the personal one).
      queryPersonal: vi
        .fn()
        .mockResolvedValue([{ deviceId: 'device-001' }, { deviceId: 'device-002' }]),
      queryWorkspaceDevices: vi
        .fn()
        .mockResolvedValue([{ deviceId: 'device-001' }, { deviceId: 'device-002' }]),
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

// The host-open is stubbed (its admission re-proof needs a real `deps.db`);
// `resolveEmbeddedChatDispatchRoute` stays real so routing into the embedded
// chat host is genuinely exercised.
vi.mock('@/server/services/controlPlane/embeddedChatDispatch', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, openEmbeddedChatDispatchHost: mockOpenEmbeddedChatDispatchHost };
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

// Composition is the control-plane half of the device-Prime contract — these
// tests pin ROUTING (a device-resolved orvilo plan reaches the gateway with a
// prime descriptor), not the descriptor's contents, so composition is stubbed
// at its module seam.
vi.mock('@/server/services/controlPlane/devicePrimeDispatch', () => ({
  composeDevicePrimeRun: mockComposeDevicePrimeRun,
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
  const mockDb = createDispatchTestDb() as any;
  const userId = 'test-user-id';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertCanUseWorkspaceAgent).mockReset().mockResolvedValue(undefined);
    mockSandboxFeatureFlags.mockResolvedValue({ enableCloudSandbox: false });
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
    // Deny with a sentinel — proves the run reached embedded chat admission
    // without driving `openEmbeddedChatDispatchHost`'s `deps.db` re-proof.
    mockOpenEmbeddedChatDispatchHost.mockResolvedValue({
      error: { code: 'stale_fence', message: 'chat host stubbed by fence test', retryable: false },
      ok: false,
    });
    mockGetHeterogeneousResumeSessionId.mockResolvedValue(undefined);
    mockDeviceFindByDeviceId.mockResolvedValue(undefined);
    mockDeviceFindWorkspaceDeviceById.mockResolvedValue(undefined);
    // `clearAllMocks` keeps the last-set implementation — re-establish the
    // auth-pass default so a test that stubs BINDING_INVALID can't leak it
    // into later tests.
    vi.mocked(resolveDeviceDispatchAuthorizationFailure).mockResolvedValue(undefined);
    mockComposeDevicePrimeRun.mockResolvedValue({
      ok: true,
      value: { descriptor: mockPrimeDescriptor },
    });

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

    it('blocks an explicit sandbox target when cloud execution is disabled', async () => {
      await useAgencyConfig({ executionTarget: 'sandbox' });

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
      mockSandboxFeatureFlags.mockResolvedValue({ enableCloudSandbox: true });
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
      mockSandboxFeatureFlags.mockResolvedValue({ enableCloudSandbox: true });
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

    it('does not start a queued workspace run after Agent Use is revoked at admission', async () => {
      await useAgencyConfig({
        boundDeviceId: 'device-001',
        executionTarget: 'device',
        executionTargetSelectionPolicy: 'fixed',
      });
      service = new AiAgentService(mockDb, userId, { workspaceId: 'workspace-1' });
      vi.mocked(assertCanUseWorkspaceAgent).mockRejectedValue(new TRPCError({ code: 'FORBIDDEN' }));
      await expect(
        service.execAgent({ agentId: 'agent-1', prompt: 'Run a command' }),
      ).resolves.toMatchObject({ success: false, error: 'AGENT_USE_FORBIDDEN' });
      expect(mockDispatchAgentRun).not.toHaveBeenCalled();
      expect(mockSpawnHeteroSandbox).not.toHaveBeenCalled();
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
        // Every admission refusal carries the structured contract surface —
        // the repair UI branches on errorData.code, never the prose.
        expect(result.errorData?.code).toMatch(/^DEVICE_/);
        expect(result.errorData?.retryable).toBe(true);
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

    it('surfaces DEVICE_NOT_CONNECTED when the bound device is unreachable', async () => {
      // DEVICE_CHANNEL_UNAVAILABLE = the gateway addressed the device but it
      // is offline/asleep/mid-reconnect — the honest surface code is
      // DEVICE_NOT_CONNECTED, not the registration-gone DEVICE_NOT_FOUND.
      await useAgencyConfig({ boundDeviceId: 'device-001', executionTarget: 'device' });
      mockDispatchAgentRun.mockResolvedValue({
        error: 'DEVICE_CHANNEL_UNAVAILABLE',
        errorCode: DeviceTransportErrorCode.DeviceChannelUnavailable,
        success: false,
      });

      const result = await service.execAgent({
        agentId: 'agent-1',
        prompt: 'Run a command',
      });

      expect(result).toMatchObject({ error: 'DEVICE_NOT_CONNECTED', success: false });
      expect(result.errorData).toMatchObject({
        code: 'DEVICE_NOT_CONNECTED',
        deviceId: 'device-001',
        retryable: true,
        scope: 'personal',
      });
    });

    it('surfaces DEVICE_BINDING_INVALID when the bound device row is gone', async () => {
      // The bound pin resolves at admission, then the registry re-check on the
      // NOT_FOUND failure finds the row already deleted — the surface names
      // the explicit-repair code and offers candidates in the same scope.
      await useAgencyConfig({ boundDeviceId: 'device-001', executionTarget: 'device' });
      mockDispatchAgentRun.mockResolvedValue({
        error: 'DEVICE_NOT_FOUND',
        errorCode: DeviceTransportErrorCode.DeviceNotFound,
        success: false,
      });
      vi.mocked(resolveDeviceDispatchAuthorizationFailure).mockResolvedValue({
        code: 'DEVICE_BINDING_INVALID',
        deviceId: 'device-001',
        repairCandidates: ['device-002'],
        retryable: true,
        scope: 'personal',
      });

      const result = await service.execAgent({
        agentId: 'agent-1',
        prompt: 'Run a command',
      });

      expect(result).toMatchObject({ error: 'DEVICE_BINDING_INVALID', success: false });
      expect(result.errorData).toMatchObject({
        code: 'DEVICE_BINDING_INVALID',
        deviceId: 'device-001',
        repairCandidates: ['device-002'],
      });
    });

    it('surfaces DEVICE_NOT_CONNECTED when the registry still holds the device row', async () => {
      // The gateway reported NOT_FOUND but the registry still knows the
      // device — the gateway simply lost reachability, so the surface names
      // DEVICE_NOT_CONNECTED (retryable), never the repair-only NOT_FOUND.
      await useAgencyConfig({ boundDeviceId: 'device-001', executionTarget: 'device' });
      mockDispatchAgentRun.mockResolvedValue({
        error: 'DEVICE_NOT_FOUND',
        errorCode: DeviceTransportErrorCode.DeviceNotFound,
        success: false,
      });

      const result = await service.execAgent({
        agentId: 'agent-1',
        prompt: 'Run a command',
      });

      expect(resolveDeviceDispatchAuthorizationFailure).toHaveBeenCalledWith(
        mockDb,
        userId,
        'device-001',
        undefined,
      );
      expect(result).toMatchObject({ error: 'DEVICE_NOT_CONNECTED', success: false });
      expect(result.errorData).toMatchObject({
        code: 'DEVICE_NOT_CONNECTED',
        deviceId: 'device-001',
      });
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
      mockSandboxFeatureFlags.mockResolvedValue({ enableCloudSandbox: true });
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

  // The transitional embedded fence (device-execution-contract.md
  // §transitional-fence) is down: a builtin orvilo plan that resolves to a
  // device now composes a Prime descriptor and dispatches to the bound device
  // like every other adapter — the device runs the Prime harness itself.
  describe('device-resolved orvilo runs dispatch Prime (fence removed)', () => {
    it('sends the composed prime descriptor to the bound device', async () => {
      await useAgencyConfig({
        boundDeviceId: 'device-001',
        executionTarget: 'device',
        heterogeneousProvider: { type: 'orvilo' },
      });

      const result = await service.execAgent({ agentId: 'agent-1', prompt: 'Run a command' });

      expect(mockComposeDevicePrimeRun).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ deviceId: 'device-001' }),
      );
      expect(mockDispatchAgentRun).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceId: 'device-001',
          prime: mockPrimeDescriptor,
        }),
      );
      // No embedded fork, no engine CLI spawn.
      expect(mockSpawnHeteroSandbox).not.toHaveBeenCalled();
      expect(result).toMatchObject({ autoStarted: true, success: true });
    });

    it('surfaces the compose failure instead of routing embedded', async () => {
      await useAgencyConfig({
        boundDeviceId: 'device-001',
        executionTarget: 'device',
        heterogeneousProvider: { type: 'orvilo' },
      });
      mockComposeDevicePrimeRun.mockResolvedValueOnce({
        error: { code: 'provider_disabled', message: 'no backend' },
        ok: false,
      });

      const result = await service.execAgent({ agentId: 'agent-1', prompt: 'Run a command' });

      expect(mockDispatchAgentRun).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        error: 'provider_disabled',
        success: false,
      });
    });
  });
});
