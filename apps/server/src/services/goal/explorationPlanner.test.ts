import { describe, expect, it, vi } from 'vitest';

import { GoalExplorationPlanner } from './explorationPlanner';

const run = vi.hoisted(() => vi.fn());
vi.mock('@/server/services/aiGeneration/judgment', () => ({ runAcpJudgment: run }));

describe('retired Goal exploration', () => {
  it('rejects standalone exploration without an Agent run', async () => {
    await expect(
      new GoalExplorationPlanner({} as never, 'owner').plan({
        experiments: [],
        instruction: 'Explore',
        maxExperiments: 3,
        requirement: 'Old goal',
      }),
    ).rejects.toMatchObject({ code: 'METHOD_NOT_SUPPORTED' });
    expect(run).not.toHaveBeenCalled();
  });
});
