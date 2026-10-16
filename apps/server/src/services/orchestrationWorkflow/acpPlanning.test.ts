// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrchestrationWorkflowCriteriaGeneratorService } from './criteriaGenerator';
import { OrchestrationWorkflowExplorationPlanner } from './explorationPlanner';

const mocks = vi.hoisted(() => ({ run: vi.fn(), generate: vi.fn(), settings: vi.fn() }));
vi.mock('@/database/models/agent', () => ({
  AgentModel: class {
    getOrchestratorSourceAgentId = async () => 'codex';
    getAgentConfig = async () => ({ agencyConfig: { heterogeneousProvider: { type: 'codex' } } });
  },
}));
vi.mock('@/database/models/user', () => ({
  UserModel: class {
    getUserSettings = mocks.settings;
  },
}));
vi.mock('@/server/services/aiGeneration', () => ({
  AiGenerationService: class {
    generateObject = mocks.generate;
  },
}));
vi.mock('@/server/services/aiGeneration/judgment', () => ({ runAcpJudgment: mocks.run }));

beforeEach(() => vi.clearAllMocks());
describe('ACP planning without a builtin provider (#623)', () => {
  it('drafts acceptance criteria using the selected ACP agent and a tool submission', async () => {
    const data = { title: 'Ship it', instruction: 'Publish the release', criteria: [] };
    mocks.run.mockResolvedValue({ data });
    await expect(
      new OrchestrationWorkflowCriteriaGeneratorService(
        {} as never,
        'user',
        'workspace',
      ).generatePlan({
        agentId: 'codex',
        orchestrationWorkflow: 'Ship it',
      }),
    ).resolves.toEqual(data);
    expect(mocks.run).toHaveBeenCalledWith(
      {},
      'user',
      expect.objectContaining({
        judgment: expect.objectContaining({ binding: { agentId: 'codex' }, outputMode: 'tool' }),
        workspaceId: 'workspace',
      }),
    );
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.settings).not.toHaveBeenCalled();
  });
  it('uses the same ACP round for exploration', async () => {
    const data = {
      action: 'verify',
      parentNodeId: '',
      title: '',
      instruction: '',
      reason: 'Ready',
    };
    mocks.run.mockResolvedValue({ data });
    await expect(
      new OrchestrationWorkflowExplorationPlanner({} as never, 'user').plan(
        {
          experiments: [],
          requirement: 'Find evidence',
          instruction: 'Explore',
          maxExperiments: 3,
        },
        { agentId: 'codex' },
      ),
    ).resolves.toEqual(data);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
