import { describe, expect, it, vi } from 'vitest';

import { GoalCriteriaGeneratorService } from './criteriaGenerator';

const mocks = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('@/server/services/aiGeneration', () => ({
  AiGenerationService: class {
    generateObject = mocks.generate;
  },
}));

describe('retired Goal drafting', () => {
  it('rejects criteria, plan and decomposition without model execution', async () => {
    const service = new GoalCriteriaGeneratorService({} as never, 'owner');
    for (const run of [
      () => service.generate({ agentId: 'agent', goal: 'Old goal' }),
      () => service.generatePlan({ agentId: 'agent', goal: 'Old goal' }),
      () => service.decompose({ agentId: 'agent', requirement: 'Old goal' }),
    ])
      await expect(run()).rejects.toMatchObject({ code: 'METHOD_NOT_SUPPORTED' });
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
