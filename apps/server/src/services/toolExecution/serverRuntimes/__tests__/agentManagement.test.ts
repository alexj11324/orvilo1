import { AgentManagementManifest } from '@orvilo/builtin-tool-agent-management';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentModel } from '@/database/models/agent';

import { agentManagementRuntime } from '../agentManagement';

const {
  mockCreateAgent,
  mockInheritRuntime,
  mockCountAgents,
  mockQueryAgents,
  mockGetAgentConfigById,
  mockUpdateConfig,
} = vi.hoisted(() => ({
  mockCreateAgent: vi.fn(),
  mockInheritRuntime: vi.fn(),
  mockCountAgents: vi.fn(),
  mockGetAgentConfigById: vi.fn(),
  mockQueryAgents: vi.fn(),
  mockUpdateConfig: vi.fn(),
}));

vi.mock('@/database/models/agent', () => ({
  AgentModel: vi.fn(function () {
    return {
      create: mockCreateAgent,
      inheritRuntimeForCreation: mockInheritRuntime,
      countAgents: mockCountAgents,
      getAgentConfigById: mockGetAgentConfigById,
      queryAgents: mockQueryAgents,
      updateConfig: mockUpdateConfig,
    };
  }),
}));

const createRuntime = () =>
  agentManagementRuntime.factory({
    serverDB: {} as never,
    toolManifestMap: {},
    userId: 'user-1',
  });

const createWorkspaceRuntime = () =>
  agentManagementRuntime.factory({
    serverDB: {} as never,
    toolManifestMap: {},
    userId: 'user-1',
    workspaceId: 'workspace-1',
  });

const makeAgents = (count: number, startIndex = 0) =>
  Array.from({ length: count }, (_, i) => ({
    avatar: null,
    backgroundColor: null,
    description: null,
    id: `agent-${startIndex + i}`,
    title: `Agent ${startIndex + i}`,
  }));

describe('agentManagementRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAgent.mockReset();
    mockInheritRuntime.mockReset();
  });

  it('declares the agent management runtime identifier', () => {
    expect(agentManagementRuntime.identifier).toBe('orvilo-agent-management');
  });

  it('throws if required server context is missing', () => {
    expect(() => agentManagementRuntime.factory({ toolManifestMap: {} })).toThrow(
      'userId and serverDB are required for Agent Management execution',
    );
  });

  it('scopes the agent model to workspace context', () => {
    createWorkspaceRuntime();

    expect(AgentModel).toHaveBeenCalledWith(expect.anything(), 'user-1', 'workspace-1');
  });

  describe('createAgent admission', () => {
    it('rejects missing invocation source before insertion', async () => {
      mockCreateAgent.mockResolvedValue({ id: 'new' });
      const result = await createRuntime().createAgent({ title: 'Child' }, { toolManifestMap: {} });
      expect(result.success).toBe(false);
      expect(result.content).toContain('setup');
      expect(mockCreateAgent).not.toHaveBeenCalled();
    });

    it('persists the admitted invoking runtime as a private agent', async () => {
      const runtimeConfig = {
        agencyConfig: {
          activeProvider: 'codex',
          providers: { codex: { type: 'codex', deviceId: 'host' } },
        },
        model: 'saved-model',
        provider: 'saved-provider',
      };
      mockInheritRuntime.mockResolvedValue(runtimeConfig);
      mockCreateAgent.mockImplementation(async (config) => {
        expect(config).toMatchObject({ ...runtimeConfig, visibility: 'private' });
        return { id: 'new' };
      });
      const result = await createRuntime().createAgent(
        { title: 'Child', model: 'requested-model', provider: 'requested-provider' },
        { agentId: 'source', activeDeviceId: 'host', toolManifestMap: {} },
      );
      expect(result.success).toBe(true);
      expect(mockInheritRuntime).toHaveBeenCalledWith('source', {
        deviceId: 'host',
        model: 'requested-model',
        provider: 'requested-provider',
        visibility: 'private',
      });
    });

    it('does not insert after runtime admission fails', async () => {
      mockInheritRuntime.mockRejectedValueOnce(new Error('Agent setup required: host denied'));
      const result = await createRuntime().createAgent(
        { title: 'Child' },
        { agentId: 'source', toolManifestMap: {} },
      );
      expect(result.success).toBe(false);
      expect(mockCreateAgent).not.toHaveBeenCalled();
    });
  });

  describe('callAgent', () => {
    it('fails when the server sub-agent runner is unavailable', async () => {
      const runtime = createRuntime();

      const result = await runtime.callAgent(
        {
          agentId: 'agent-target',
          instruction: 'Do delegated work',
          runAsTask: true,
        },
        { toolManifestMap: {} },
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatchObject({ code: 'AGENT_CALL_UNAVAILABLE' });
    });

    it('returns a deferred tool result and forks the target agent through the sub-agent runner', async () => {
      const run = vi.fn().mockResolvedValue({
        started: true,
        subOperationId: 'op-child',
        threadId: 'thread-child',
      });
      const runtime = createRuntime();

      const result = await runtime.callAgent(
        {
          agentId: 'agent-target',
          instruction: 'Do delegated work',
          runAsTask: true,
          taskTitle: 'Delegated task',
          timeout: 1234,
        },
        {
          subAgent: { run },
          toolManifestMap: {},
        },
      );

      expect(run).toHaveBeenCalledWith({
        agentId: 'agent-target',
        description: 'Delegated task',
        instruction: 'Do delegated work',
        timeout: 1234,
      });
      expect(result).toMatchObject({
        content: '',
        deferred: true,
        success: true,
      });
      expect(result.state).toMatchObject({
        status: 'pending',
        subOperationId: 'op-child',
        targetAgentId: 'agent-target',
        threadId: 'thread-child',
      });
    });

    it('returns a non-deferred failure when the target agent cannot start', async () => {
      const run = vi.fn().mockResolvedValue({
        started: false,
        threadId: '',
      });
      const runtime = createRuntime();

      const result = await runtime.callAgent(
        {
          agentId: 'agent-target',
          instruction: 'Do delegated work',
          runAsTask: true,
        },
        {
          subAgent: { run },
          toolManifestMap: {},
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatchObject({
        code: 'AGENT_CALL_START_FAILED',
      });
      expect(result.deferred).toBeUndefined();
    });

    it('surfaces the underlying start error so the failure is diagnosable', async () => {
      const run = vi.fn().mockResolvedValue({
        error: 'Agent not found: agent-target',
        started: false,
        threadId: '',
      });
      const runtime = createRuntime();

      const result = await runtime.callAgent(
        { agentId: 'agent-target', instruction: 'Do delegated work' },
        { subAgent: { run }, toolManifestMap: {} },
      );

      expect(result.success).toBe(false);
      expect(result.content).toBe(
        'Agent "agent-target" failed to start: Agent not found: agent-target',
      );
      expect(result.error).toMatchObject({
        code: 'AGENT_CALL_START_FAILED',
        message: 'Agent "agent-target" failed to start: Agent not found: agent-target',
      });
    });

    it('rejects nested server callAgent execution', async () => {
      const run = vi.fn();
      const runtime = createRuntime();

      const result = await runtime.callAgent(
        {
          agentId: 'agent-target',
          instruction: 'Do delegated work',
        },
        {
          isSubAgent: true,
          subAgent: { run },
          toolManifestMap: {},
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatchObject({ code: 'NESTED_AGENT_CALL_NOT_ALLOWED' });
      expect(run).not.toHaveBeenCalled();
    });
  });

  describe('searchAgent', () => {
    it('reports the real total and a pagination hint when more agents exist', async () => {
      mockQueryAgents.mockResolvedValue(makeAgents(20));
      mockCountAgents.mockResolvedValue(137);

      const runtime = createRuntime();
      const result = await runtime.searchAgent({ limit: 20 });

      expect(mockQueryAgents).toHaveBeenCalledWith({ keyword: undefined, limit: 20, offset: 0 });
      expect(result.success).toBe(true);
      expect(result.content).toContain('Found 137 agents in your workspace, showing 1-20');
      expect(result.content).toContain('call searchAgent with offset=20');
      expect(result.state).toMatchObject({ hasMore: true, offset: 0, totalCount: 137 });
    });

    it('passes offset through and computes the next page hint from it', async () => {
      mockQueryAgents.mockResolvedValue(makeAgents(20, 20));
      mockCountAgents.mockResolvedValue(50);

      const runtime = createRuntime();
      const result = await runtime.searchAgent({ limit: 20, offset: 20 });

      expect(mockQueryAgents).toHaveBeenCalledWith({ keyword: undefined, limit: 20, offset: 20 });
      expect(result.content).toContain('Found 50 agents in your workspace, showing 21-40');
      expect(result.content).toContain('call searchAgent with offset=40');
      expect(result.state).toMatchObject({ hasMore: true, offset: 20, totalCount: 50 });
    });

    it('notes when the requested limit is capped', async () => {
      mockQueryAgents.mockResolvedValue(makeAgents(1));
      mockCountAgents.mockResolvedValue(1);

      const runtime = createRuntime();
      const result = await runtime.searchAgent({ limit: 50 });

      expect(mockQueryAgents).toHaveBeenCalledWith({ keyword: undefined, limit: 20, offset: 0 });
      expect(result.content).toContain(
        'Requested limit 50 exceeds the maximum of 20; results were capped at 20 per call.',
      );
      expect(result.state).toMatchObject({ hasMore: false });
    });

    it('returns no agents found when nothing matches', async () => {
      mockQueryAgents.mockResolvedValue([]);
      mockCountAgents.mockResolvedValue(0);

      const runtime = createRuntime();
      const result = await runtime.searchAgent({ keyword: 'nonexistent' });

      expect(result.success).toBe(true);
      expect(result.content).toContain('No agents matched');
    });

    it('explains an out-of-range offset instead of claiming no matches', async () => {
      mockQueryAgents.mockResolvedValue([]);
      mockCountAgents.mockResolvedValue(37);

      const runtime = createRuntime();
      const result = await runtime.searchAgent({ offset: 200 });

      expect(result.success).toBe(true);
      expect(result.content).toContain('No agents at offset 200; only 37 match');
    });

    it('surfaces heteroType for heterogeneous workspace agents', async () => {
      mockQueryAgents.mockResolvedValue([
        {
          avatar: null,
          backgroundColor: null,
          description: null,
          heteroType: 'claude-code',
          id: 'agent-cc',
          title: 'CC 2号机',
        },
      ]);
      mockCountAgents.mockResolvedValue(1);

      const runtime = createRuntime();
      const result = await runtime.searchAgent({});

      expect(result.success).toBe(true);
      expect(result.content).toContain('heteroType="claude-code"');
      expect(result.content).toContain('heterogeneous agents');
      expect(result.state).toMatchObject({
        agents: [expect.objectContaining({ id: 'agent-cc', heteroType: 'claude-code' })],
      });
    });

    it('searches workspace Agents through the workspace-scoped model', async () => {
      mockQueryAgents.mockResolvedValue(makeAgents(1));
      mockCountAgents.mockResolvedValue(1);

      const result = await createWorkspaceRuntime().searchAgent({ keyword: 'Agent' });

      expect(result.success).toBe(true);
      expect(result.state).toMatchObject({
        agents: [expect.objectContaining({ id: 'agent-0' })],
        totalCount: 1,
      });
    });

    it('handles search failure', async () => {
      mockQueryAgents.mockRejectedValue(new Error('DB unavailable'));
      mockCountAgents.mockResolvedValue(0);

      const runtime = createRuntime();
      const result = await runtime.searchAgent({});

      expect(result.success).toBe(false);
      expect(result.content).toContain('Failed to search agents');
    });
  });

  it('does not advertise or execute retired Marketplace tools', () => {
    const runtime = createRuntime();
    const apiNames = AgentManagementManifest.api.map((api) => api.name);

    for (const name of ['searchMarketTools', 'installPlugin']) {
      expect(apiNames).not.toContain(name);
      expect(runtime[name]).toBeUndefined();
    }
  });
});
