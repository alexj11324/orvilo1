// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GoalDecompositionPlannerService } from './decompositionPlanner';
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
  it('decomposes through the selected ACP Agent without provider generation', async () => {
    const data = {
      problemStatement: 'Ship it',
      tasks: [{ title: 'Publish', instruction: 'Publish the release' }],
    };
    mocks.run.mockResolvedValue({ data });
    await expect(
      new GoalDecompositionPlannerService({} as never, 'user', 'workspace').decompose({
        agentId: 'codex',
        requirement: 'Ship it',
      }),
    ).resolves.toEqual(data);
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
