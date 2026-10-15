import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GoalCriteriaGeneratorService } from './criteriaGenerator';

const { generateObject, resolveGoalModelConfig, reviewer } = vi.hoisted(() => ({
  generateObject: vi.fn(),
  reviewer: vi.fn(),
  resolveGoalModelConfig: vi.fn(),
}));

vi.mock('@/server/services/aiGeneration', () => ({
  AiGenerationService: vi.fn(function () {
    return { generateObject };
  }),
}));

vi.mock('./modelConfig', () => ({ resolveGoalModelConfig }));
vi.mock('@/server/services/verify/reviewerAgent', () => ({ resolveIssueReviewer: reviewer }));

describe('GoalCriteriaGeneratorService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reviewer.mockResolvedValue('reviewer-1');
    resolveGoalModelConfig.mockResolvedValue({ model: 'goal-model', provider: 'goal-provider' });
    generateObject.mockResolvedValue({
      criteria: [],
      instruction: 'Publish the benchmark paper.',
      title: 'Publish benchmark paper',
    });
  });

  it('uses the explicitly selected coordinator without resolving a model or provider', async () => {
    await new GoalCriteriaGeneratorService({} as any, 'user-1', 'workspace-1').generate({
      agentId: 'coordinator-1',
      goal: 'Publish a benchmark paper',
    });

    expect(resolveGoalModelConfig).not.toHaveBeenCalled();
    expect(generateObject.mock.calls[0][0]).not.toHaveProperty('model');
    expect(generateObject.mock.calls[0][0]).not.toHaveProperty('provider');
    expect(
      generateObject.mock.calls[0][0].messages.every(
        (message: { role: string }) => message.role === 'user',
      ),
    ).toBe(true);
    expect(generateObject.mock.calls[0][1].judgment.binding).toEqual({
      agentId: 'coordinator-1',
      allowEnvFallback: false,
    });
    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        schema: expect.objectContaining({ name: 'goal_criteria_draft' }),
      }),
      expect.objectContaining({
        tracing: {
          promptVersion: 'v3',
          scenario: 'goal_criteria_gen',
          schemaName: 'goal_criteria_draft',
        },
      }),
    );
  });

  it('blocks drafting without an explicitly selected coordinator', async () => {
    await expect(
      new GoalCriteriaGeneratorService({} as never, 'user-1').generatePlan({ goal: 'Ship' }),
    ).rejects.toThrow('Select a coordinator Agent');
    expect(generateObject).not.toHaveBeenCalled();
    expect(resolveGoalModelConfig).not.toHaveBeenCalled();
  });

  it('traces executable decomposition with its updated prompt cohort and validates the output', async () => {
    const service = new GoalCriteriaGeneratorService({} as never, 'user-1');
    const draft = {
      problemStatement: 'Deliver editable office documents.',
      tasks: [
        { dependsOn: [], instruction: 'Document current gaps.', title: 'Investigate' },
        { dependsOn: [0], instruction: 'Implement editing and persistence.', title: 'Implement' },
      ],
    };
    generateObject.mockResolvedValueOnce(draft);
    await expect(service.decompose({ requirement: 'Upgrade office editing' })).resolves.toEqual(
      draft,
    );
    expect(generateObject).toHaveBeenLastCalledWith(
      expect.objectContaining({ schema: expect.objectContaining({ name: 'goal_decomposition' }) }),
      expect.objectContaining({
        tracing: {
          promptVersion: 'v5',
          scenario: 'goal_decompose',
          schemaName: 'goal_decomposition',
        },
      }),
    );
    generateObject.mockResolvedValueOnce({ ...draft, tasks: [{ title: 'Missing instruction' }] });
    await expect(
      service.decompose({ requirement: 'Upgrade office editing' }),
    ).resolves.toBeUndefined();
  });

  it('rejects criteria containing evidence values outside the supported enums', async () => {
    generateObject.mockResolvedValue({
      criteria: [
        {
          description: 'The release is visible',
          instruction: 'Inspect the release.',
          onFail: 'auto_repair',
          required: true,
          requiredEvidence: [
            { hint: 'Capture it', modality: 'hologram', scope: 'somewhere', type: 'binary' },
          ],
          title: 'Release shipped',
          verifierType: 'agent',
        },
      ],
      instruction: 'Ship it.',
      title: 'Ship it',
    });

    await expect(
      new GoalCriteriaGeneratorService({} as any, 'user-1').generate({
        agentId: 'coordinator-1',
        goal: 'Ship it',
      }),
    ).resolves.toEqual([]);
  });

  it('keeps the array response for existing callers while exposing the full generated plan', async () => {
    generateObject.mockResolvedValue({
      criteria: [{ title: 'Benchmark is published', verifierType: 'agent' }],
      instruction: 'Publish the benchmark paper.',
      title: 'Publish benchmark paper',
    });
    const service = new GoalCriteriaGeneratorService({} as any, 'user-1');

    await expect(
      service.generate({ agentId: 'coordinator-1', goal: 'Publish a benchmark paper' }),
    ).resolves.toEqual([{ title: 'Benchmark is published', verifierType: 'agent' }]);
    await expect(
      service.generatePlan({ agentId: 'coordinator-1', goal: 'Publish a benchmark paper' }),
    ).resolves.toEqual({
      criteria: [{ title: 'Benchmark is published', verifierType: 'agent' }],
      instruction: 'Publish the benchmark paper.',
      title: 'Publish benchmark paper',
    });
  });
});
