// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { BriefIdentifier } from '@orvilo/builtin-tool-brief';
import { TaskIdentifier as TaskToolIdentifier } from '@orvilo/builtin-tool-task';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('OpenCode ACP execution evidence', () => {
  let database: PGlite;
  const model = 'opencode-go/glm-5.3-flash';
  const metadata = () => ({
    executionEngine: 'hetero',
    heteroAgentType: 'opencode',
    assistantMessageId: 'answer',
    executionPlan: { deviceId: 'one', workingDirectoryBinding: '/repo' },
    remoteAdmission: { acpSessionId: 'acp-session' },
  });
  const request = () => {
    const value = input();
    value.db = drizzle(database);
    value.task.config.workspace = { repoPath: '/repo' };
    return value;
  };
  beforeEach(async () => {
    database = new PGlite();
    await database.exec(`
      CREATE TABLE agent_operations (
        id text PRIMARY KEY, user_id text, workspace_id text, agent_id text,
        topic_id text, status text, completion_reason text, model text, provider text,
        started_at timestamptz, completed_at timestamptz, metadata jsonb
      );
      CREATE TABLE messages (
        id text PRIMARY KEY, user_id text, workspace_id text, topic_id text,
        role text, content text, deleted_at timestamptz
      );
      INSERT INTO messages VALUES ('answer', 'user', 'workspace', 'topic', 'assistant', 'ACP succeeded', NULL);
    `);
    await database.query(
      `INSERT INTO agent_operations VALUES
      ('proof', 'user', 'workspace', 'agent', 'topic', 'done', 'done', $1, 'opencode',
       '2026-10-06T10:00:00Z', '2026-10-06T10:01:00Z', $2)`,
      [model, metadata()],
    );
    mocks.agent.mockResolvedValue({
      id: 'agent',
      updatedAt: new Date('2026-10-06T09:59:00Z'),
      plugins: [],
      agencyConfig: { heterogeneousProvider: { type: 'opencode', model } },
    });
    mocks.probe.mockResolvedValue({
      success: true,
      content: JSON.stringify({ ...verified(), executor: 'opencode', authenticated: 'unknown' }),
    });
  });
  afterEach(async () => database.close());

  it('accepts the latest actual ACP success on the unchanged pinned execution route', async () => {
    expect(await checkMcpAutomationReadiness(request())).toMatchObject({
      canEnable: true,
      reasons: [],
    });
  });

  it.each([
    ['another user', "UPDATE agent_operations SET user_id='other'"],
    ['another workspace', "UPDATE agent_operations SET workspace_id='other'"],
    ['another Agent', "UPDATE agent_operations SET agent_id='other'"],
    ['another provider', "UPDATE agent_operations SET provider='other'"],
    ['another executed model', "UPDATE agent_operations SET model='another/model'"],
    ['missing executed model', 'UPDATE agent_operations SET model=NULL'],
    ['old configuration', "UPDATE agent_operations SET started_at='2026-10-06T09:58:00Z'"],
    ['missing terminal completion', 'UPDATE agent_operations SET completed_at=NULL'],
    ['failed completion', "UPDATE agent_operations SET completion_reason='error'"],
    [
      'missing ACP session',
      "UPDATE agent_operations SET metadata=metadata #- '{remoteAdmission,acpSessionId}'",
    ],
    ['missing ACP engine', "UPDATE agent_operations SET metadata=metadata - 'executionEngine'"],
    [
      'wrong Agent family',
      `UPDATE agent_operations SET metadata=jsonb_set(metadata, '{heteroAgentType}', '"other"')`,
    ],
    [
      'another device',
      `UPDATE agent_operations SET metadata=jsonb_set(metadata, '{executionPlan,deviceId}', '"other"')`,
    ],
    [
      'another cwd',
      `UPDATE agent_operations SET metadata=jsonb_set(metadata, '{executionPlan,workingDirectoryBinding}', '"/other"')`,
    ],
    ['missing output', 'DELETE FROM messages'],
    ['blank output', "UPDATE messages SET content='   '"],
    ['foreign output', "UPDATE messages SET user_id='other'"],
    ['deleted output', 'UPDATE messages SET deleted_at=now()'],
  ])('rejects %s evidence', async (_name, statement) => {
    await database.exec(statement);
    expect((await checkMcpAutomationReadiness(request())).reasons).toContain('AUTH_REQUIRED');
  });

  it('invalidates older success after a newer failure before model negotiation', async () => {
    await database.exec(`INSERT INTO agent_operations
      SELECT 'failed', user_id, workspace_id, agent_id, topic_id, 'error', 'error', NULL,
        provider, started_at, completed_at + interval '1 minute', metadata
      FROM agent_operations WHERE id='proof'`);
    expect((await checkMcpAutomationReadiness(request())).reasons).toContain('AUTH_REQUIRED');
  });

  it('rejects whitespace-only output containing line breaks and tabs', async () => {
    await database.query('UPDATE messages SET content=$1', ['\n\t\r']);
    expect((await checkMcpAutomationReadiness(request())).reasons).toContain('AUTH_REQUIRED');
  });

  it('uses completion order when a concurrent failure finishes before the success', async () => {
    await database.exec(`INSERT INTO agent_operations
      SELECT 'failed', user_id, workspace_id, agent_id, topic_id, 'error', 'error', NULL,
        provider, started_at + interval '1 second', completed_at - interval '30 seconds', metadata
      FROM agent_operations WHERE id='proof'`);
    expect((await checkMcpAutomationReadiness(request())).canEnable).toBe(true);
  });

  it.each([
    { authenticated: false },
    { credentialRequired: false },
    { installed: false },
    { unattended: false },
    { repositoryAccessible: false },
    { requiredToolsSupported: false },
  ])('preserves host rejection %j', async (patch) => {
    mocks.probe.mockResolvedValue({
      success: true,
      content: JSON.stringify({
        ...verified(),
        executor: 'opencode',
        authenticated: 'unknown',
        ...patch,
      }),
    });
    expect((await checkMcpAutomationReadiness(request())).canEnable).toBe(false);
  });

  it('requires an explicit pinned model even after a successful default-model run', async () => {
    const agent = await mocks.agent();
    delete agent.agencyConfig.heterogeneousProvider.model;
    mocks.agent.mockResolvedValue(agent);
    expect((await checkMcpAutomationReadiness(request())).reasons).toContain('AUTH_REQUIRED');
  });
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
