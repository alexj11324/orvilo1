// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GoalCriteriaGeneratorService } from './criteriaGenerator';
import { GoalExplorationPlanner } from './explorationPlanner';

const mocks = vi.hoisted(() => ({ run: vi.fn(), generate: vi.fn(), settings: vi.fn() }));
vi.mock('@/database/models/agent', () => ({
  AgentModel: class {
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
  it('drafts acceptance criteria through the selected ACP judgment binding', async () => {
    const data = { title: 'Ship it', instruction: 'Publish the release', criteria: [] };
    mocks.generate.mockResolvedValue(data);
    await expect(
      new GoalCriteriaGeneratorService({} as never, 'user', 'workspace').generatePlan({
        agentId: 'codex',
        goal: 'Ship it',
      }),
    ).resolves.toEqual(data);
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({ schema: expect.any(Object) }),
      expect.objectContaining({
        judgment: expect.objectContaining({
          binding: { agentId: 'codex', allowEnvFallback: false },
        }),
        kind: 'judgment',
      }),
    );
    expect(mocks.run).not.toHaveBeenCalled();
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
      new GoalExplorationPlanner({} as never, 'user').plan(
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
