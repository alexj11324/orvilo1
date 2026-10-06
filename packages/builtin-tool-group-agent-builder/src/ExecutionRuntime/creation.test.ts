import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GroupAgentBuilderExecutionRuntime } from './index';

const {
  createGroup,
  getRuntimeForCreation,
  createAgentOnly,
  batchCreateAgentsInGroup,
  refreshGroupDetail,
} = vi.hoisted(() => ({
  createGroup: vi.fn(),
  batchCreateAgentsInGroup: vi.fn(),
  createAgentOnly: vi.fn(),
  getRuntimeForCreation: vi.fn(),
  refreshGroupDetail: vi.fn(),
}));
let visibility: 'private' | 'public' = 'public';
vi.mock('@/services/agent', () => ({ agentService: { createAgentOnly, getRuntimeForCreation } }));
vi.mock('@/services/chatGroup', () => ({
  chatGroupService: { createGroup, batchCreateAgentsInGroup },
}));
vi.mock('@/store/agent', () => ({ useAgentStore: {} }));
vi.mock('@/store/groupProfile', () => ({ useGroupProfileStore: {} }));
vi.mock('@/store/agentGroup', () => ({
  getChatGroupStoreState: () => ({
    refreshGroupDetail,
    internal_dispatchChatGroup: vi.fn(),
    internal_fetchGroupDetail: vi.fn(),
  }),
}));
vi.mock('@/store/agentGroup/selectors', () => ({
  agentGroupSelectors: { getGroupById: () => () => ({ id: 'group', visibility }) },
}));

const runtime = new GroupAgentBuilderExecutionRuntime();
const admitted = {
  agencyConfig: { activeProvider: 'codex' },
  model: 'saved',
  provider: 'saved-provider',
};
describe('group tool runtime creation admission', () => {
  it('reports a missing selected default instead of falling back to the invoking Agent', async () => {
    createGroup.mockRejectedValueOnce(new Error('ORCHESTRATOR_SETUP_REQUIRED'));
    const result = await runtime.createGroup({ title: 'Team' }, { agentId: 'different-source' });
    expect(result.success).toBe(false);
    expect(result.content).toContain('ORCHESTRATOR_SETUP_REQUIRED');
    expect(getRuntimeForCreation).not.toHaveBeenCalled();
  });

  it('lets the server create the selected Orchestrator and preserves caller metadata', async () => {
    createGroup.mockResolvedValueOnce({
      group: { id: 'group', visibility: 'private' },
      supervisorAgentId: 'supervisor',
    });
    const result = await runtime.createGroup(
      { title: 'Team', supervisor: { title: 'Lead', model: 'requested' } },
      { agentId: 'different-source' },
    );
    expect(result.success).toBe(true);
    expect(getRuntimeForCreation).not.toHaveBeenCalled();
    expect(createGroup).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Team',
        visibility: 'private',
        supervisorConfig: { title: 'Lead', model: 'requested' },
      }),
    );
  });
  beforeEach(() => {
    vi.resetAllMocks();
    visibility = 'public';
    getRuntimeForCreation.mockResolvedValue(admitted);
    createAgentOnly.mockResolvedValue({ agentId: 'child' });
    batchCreateAgentsInGroup.mockResolvedValue({ agents: [{ id: 'child' }] });
  });

  it.each(['single', 'batch'])('blocks missing source before %s insertion', async (mode) => {
    const result =
      mode === 'single'
        ? await runtime.createAgent('group', { title: 'Child', systemRole: 'prompt' })
        : await runtime.batchCreateAgents('group', {
            agents: [{ title: 'Child', systemRole: 'prompt' }],
          });
    expect(result.success).toBe(false);
    expect(result.content).toContain('setup');
    expect(createAgentOnly).not.toHaveBeenCalled();
    expect(batchCreateAgentsInGroup).not.toHaveBeenCalled();
  });

  it('inherits authorized execution fields before single insertion', async () => {
    const result = await runtime.createAgent(
      'group',
      { title: 'Child', systemRole: 'prompt' },
      { agentId: 'source' },
    );
    expect(result.success).toBe(true);
    expect(createAgentOnly).toHaveBeenCalledWith({
      groupId: 'group',
      config: expect.objectContaining({ ...admitted, title: 'Child', systemRole: 'prompt' }),
    });
    expect(getRuntimeForCreation).toHaveBeenCalledWith({ agentId: 'source', visibility: 'public' });
  });

  it('passes group visibility before batch insertion and inserts admitted config', async () => {
    visibility = 'private';
    const result = await runtime.batchCreateAgents(
      'group',
      { agents: [{ title: 'Child', systemRole: 'prompt' }] },
      { agentId: 'source' },
    );
    expect(result.success).toBe(true);
    expect(getRuntimeForCreation).toHaveBeenCalledWith({
      agentId: 'source',
      visibility: 'private',
    });
    expect(batchCreateAgentsInGroup).toHaveBeenCalledWith('group', [
      expect.objectContaining(admitted),
    ]);
  });

  it('blocks denied runtime before batch insertion', async () => {
    getRuntimeForCreation.mockRejectedValueOnce(
      new Error('Agent setup required: host cannot be shared'),
    );
    const result = await runtime.batchCreateAgents(
      'group',
      { agents: [{ title: 'Child', systemRole: 'prompt' }] },
      { agentId: 'source' },
    );
    expect(result.success).toBe(false);
    expect(batchCreateAgentsInGroup).not.toHaveBeenCalled();
    expect(refreshGroupDetail).not.toHaveBeenCalled();
  });
});
