// @vitest-environment node
import { BriefIdentifier } from '@orvilo/builtin-tool-brief';
import { TaskIdentifier as TaskToolIdentifier } from '@orvilo/builtin-tool-task';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { checkMcpAutomationReadiness } from './readiness';

const mocks = vi.hoisted(() => ({
  agent: vi.fn(),
  source: vi.fn(),
  devices: vi.fn(),
  online: vi.fn(),
  probe: vi.fn(),
  health: vi.fn(),
  usable: vi.fn(),
  surface: vi.fn(),
  flags: vi.fn(),
  githubGrant: vi.fn(),
}));
vi.mock('@/server/services/connector/githubMcp', () => ({
  isGitHubMcpConnector: (source: { metadata?: { githubMcp?: unknown } }) =>
    !!source.metadata?.githubMcp,
  getGitHubMcpGrantIdentity: mocks.githubGrant,
}));
vi.mock('@/server/featureFlags', () => ({
  getServerFeatureFlagsFromRuntimeConfig: mocks.flags,
}));
vi.mock('@/database/models/agent', () => ({
  AgentModel: class {
    getAgentConfig = mocks.agent;
  },
}));
vi.mock('@/database/models/connector', () => ({
  ConnectorModel: class {
    findById = mocks.source;
    findPublicById = async () => {
      const row = await mocks.source();
      if (!row) return row;
      const { metadata: _metadata, credentials: _credentials, ...publicRow } = row;
      return publicRow;
    };
  },
}));
vi.mock('@/database/models/device', () => ({
  DeviceModel: class {
    queryWorkspaceDevices = mocks.devices;
    queryPersonal = async () => [];
  },
}));
vi.mock('@/database/utils/agent-access', () => ({ findUsableAgentExecutionBinding: mocks.usable }));
vi.mock('@/database/utils/automationOccurrence', () => ({
  snapshotAutomationDefinition: () => ({ definitionVersionId: 'version' }),
}));
vi.mock('@/server/services/deviceGateway', () => ({
  deviceGateway: { queryDeviceList: mocks.online, executeToolCall: mocks.probe },
}));
vi.mock('@/server/services/aiAgent/pipeline/resolveExternalToolSurface', () => ({
  resolveExternalToolSurface: async () => ({}),
}));
vi.mock('@/server/services/aiAgent/pipeline/runToolSurface', () => ({
  resolveRunToolSurface: mocks.surface,
}));
vi.mock('@/server/services/providerBinding/controlPlane', () => ({
  createProviderBindingComposition: vi.fn(),
}));
vi.mock('@/server/services/providerBinding/execution', () => ({
  selectOrviloProviderBinding: vi.fn(),
}));
vi.mock('./workerHealth', () => ({ getMcpEventWorkerHealth: mocks.health }));

const input = () => ({
  db: {} as any,
  task: {
    id: 'task',
    workspaceId: 'workspace',
    instruction: 'Analyze the event',
    automationMode: 'event',
    assigneeAgentId: 'agent',
    config: {},
  } as any,
  trigger: {
    id: 'trigger',
    taskId: 'task',
    revision: 2,
    userId: 'user',
    tenantId: 'workspace',
    workspaceId: 'workspace',
    sourceId: 'source',
    subscriptionId: 'subscription',
  } as any,
  binding: {
    id: 'subscription',
    tenantId: 'workspace',
    connectorId: 'source',
    state: 'active',
    expiresAt: null,
  } as any,
});
const verified = () => ({
  executor: 'codex',
  installed: true,
  authenticated: true,
  unattended: true,
  requiredToolsSupported: true,
  repositoryAccessible: true,
  checkedAt: new Date().toISOString(),
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.flags.mockResolvedValue({ mcp_event_automations: true });
  mocks.usable.mockResolvedValue({ agencyConfig: {}, model: 'codex' });
  mocks.agent.mockResolvedValue({
    id: 'agent',
    plugins: [],
    agencyConfig: { heterogeneousProvider: { type: 'codex' } },
  });
  mocks.source.mockResolvedValue({ isEnabled: true, status: 'connected' });
  mocks.devices.mockResolvedValue([{ deviceId: 'one', name: 'Device one' }]);
  mocks.online.mockResolvedValue([{ deviceId: 'one' }]);
  mocks.probe.mockResolvedValue({ success: true, content: JSON.stringify(verified()) });
  mocks.health.mockResolvedValue({ status: 'ready', observedAt: Date.now() });
  mocks.surface.mockReturnValue({ outcomes: [] });
  mocks.githubGrant.mockResolvedValue({ githubUserId: '123', grantRevision: 'grant' });
});

describe('MCP automation readiness', () => {
  it('requires a verified native GitHub ping and the same live grant, independently of the MCP release flag', async () => {
    const native = input();
    native.binding.sourceType = 'github';
    native.binding.github = { githubUserId: '123', grantRevision: 'grant' };
    native.binding.state = 'pending';
    mocks.source.mockResolvedValue({
      isEnabled: true,
      status: 'connected',
      metadata: { githubMcp: {} },
    });
    mocks.flags.mockResolvedValue({});
    expect(await checkMcpAutomationReadiness(native)).toMatchObject({
      canEnable: false,
      reasons: ['SOURCE_VERIFICATION_REQUIRED'],
    });
    native.binding.state = 'active';
    expect((await checkMcpAutomationReadiness(native)).canEnable).toBe(true);
    mocks.githubGrant.mockResolvedValue({ githubUserId: '123', grantRevision: 'reauthorized' });
    expect((await checkMcpAutomationReadiness(native)).reasons).toContain('CONNECTOR_REVOKED');
    mocks.githubGrant.mockResolvedValue(null);
    expect((await checkMcpAutomationReadiness(native)).canEnable).toBe(false);
  });
  it('keeps production enabling blocked until real Device acceptance is released', async () => {
    mocks.flags.mockResolvedValue({});
    expect(await checkMcpAutomationReadiness(input())).toMatchObject({
      canEnable: false,
      reasons: ['ACCEPTANCE_REQUIRED'],
    });
    mocks.flags.mockResolvedValue({ mcp_event_automations: ['another-user'] });
    expect((await checkMcpAutomationReadiness(input())).canEnable).toBe(false);
    mocks.flags.mockResolvedValue({ mcp_event_automations: ['user'] });
    expect((await checkMcpAutomationReadiness(input())).canEnable).toBe(true);
  });
  it('auto binds one authorized online device only after a real host probe', async () => {
    const result = await checkMcpAutomationReadiness(input());
    expect(result).toMatchObject({ canEnable: true, deviceId: 'one', reasons: [] });
    expect(mocks.probe).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user', workspaceId: 'workspace', deviceId: 'one' }),
      expect.objectContaining({ apiName: 'checkAutomationReadiness' }),
      10000,
    );
  });
  it('requires explicit selection for multiple devices', async () => {
    mocks.devices.mockResolvedValue([{ deviceId: 'one' }, { deviceId: 'two' }]);
    mocks.online.mockResolvedValue([{ deviceId: 'one' }, { deviceId: 'two' }]);
    const result = await checkMcpAutomationReadiness(input());
    expect(result.reasons).toContain('DEVICE_SELECTION_REQUIRED');
    expect(mocks.probe).not.toHaveBeenCalled();
    expect((await checkMcpAutomationReadiness({ ...input(), deviceId: 'two' })).deviceId).toBe(
      'two',
    );
  });
  it('preserves an offline binding instead of switching to the only online device', async () => {
    const request = input();
    request.task.config.automationDeviceId = 'offline';
    const result = await checkMcpAutomationReadiness(request);
    expect(result).toMatchObject({ canEnable: false, deviceId: 'offline' });
    expect(result.reasons).toContain('DEVICE_UNAVAILABLE');
    expect(mocks.probe).not.toHaveBeenCalled();
  });
  it('does not authorize gateway-only workspace devices', async () => {
    mocks.devices.mockResolvedValue([]);
    const result = await checkMcpAutomationReadiness({ ...input(), deviceId: 'one' });
    expect(result.reasons).toContain('DEVICE_UNAVAILABLE');
    expect(mocks.probe).not.toHaveBeenCalled();
  });
  it.each(['unknown', 'unavailable'])('blocks an observed %s worker', async (status) => {
    mocks.health.mockResolvedValue({ status });
    expect((await checkMcpAutomationReadiness(input())).reasons).toContain('WORKER_UNHEALTHY');
  });
  it('does not treat installed executor as authenticated unattended execution', async () => {
    mocks.probe.mockResolvedValue({
      success: true,
      content: JSON.stringify({ ...verified(), authenticated: 'unknown', unattended: 'unknown' }),
    });
    expect((await checkMcpAutomationReadiness(input())).reasons).toEqual(
      expect.arrayContaining(['AUTH_REQUIRED', 'EXECUTOR_UNVERIFIED']),
    );
  });
  it('checks the event input tool and explicitly configured agent brief tool', async () => {
    const request = input();
    request.task.config.brief = { mode: 'agent' };
    await checkMcpAutomationReadiness(request);
    expect(mocks.surface).toHaveBeenCalledWith(
      expect.objectContaining({
        requiredToolIds: expect.arrayContaining([TaskToolIdentifier, BriefIdentifier]),
      }),
    );
  });
  it('reports a missing Device executor separately from credential readiness', async () => {
    mocks.probe.mockResolvedValue({
      success: true,
      content: JSON.stringify({
        ...verified(),
        executor: 'prime',
        installed: true,
        authenticated: 'unknown',
        unattended: false,
        blockers: ['EXECUTOR_UNSUPPORTED'],
      }),
    });
    const result = await checkMcpAutomationReadiness(input());
    expect(result.canEnable).toBe(false);
    expect(result.reasons).toContain('EXECUTOR_UNSUPPORTED');
  });
  it('blocks revoked source and unmountable required tools', async () => {
    mocks.source.mockResolvedValue({ isEnabled: false, status: 'connected' });
    mocks.surface.mockReturnValue({ outcomes: [{ status: 'unsupported' }] });
    expect((await checkMcpAutomationReadiness(input())).reasons).toEqual(
      expect.arrayContaining(['CONNECTOR_REVOKED', 'REQUIRED_TOOLS_UNSUPPORTED']),
    );
  });
});
