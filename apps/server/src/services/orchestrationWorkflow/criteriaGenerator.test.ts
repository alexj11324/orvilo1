import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrchestrationWorkflowCriteriaGeneratorService } from './criteriaGenerator';

const { generateObject } = vi.hoisted(() => ({ generateObject: vi.fn() }));
vi.mock('./generation', () => ({
  generateOrchestrationWorkflowObject: (
    _db: unknown,
    _userId: string,
    _workspaceId: string,
    _agentId: string,
    input: unknown,
    options: unknown,
  ) => generateObject(input, options),
}));

describe('OrchestrationWorkflowCriteriaGeneratorService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateObject.mockResolvedValue({
      criteria: [],
      instruction: 'Publish the benchmark paper.',
      title: 'Publish benchmark paper',
    });
  });

  it('records the orchestration prompt, schema, and tracing scenario', async () => {
    await new OrchestrationWorkflowCriteriaGeneratorService(
      {} as any,
      'user-1',
      'workspace-1',
    ).generate({
      orchestrationWorkflow: 'Publish a benchmark paper',
    });

    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        schema: expect.objectContaining({ name: 'orchestration_workflow_criteria_draft' }),
      }),
      expect.objectContaining({
        tracing: {
          promptVersion: 'v3',
          scenario: 'orchestration_workflow_criteria_gen',
          schemaName: 'orchestration_workflow_criteria_draft',
        },
      }),
    );
  });

  it('traces executable decomposition with its updated prompt cohort and validates the output', async () => {
    const service = new OrchestrationWorkflowCriteriaGeneratorService({} as never, 'user-1');
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
      expect.objectContaining({
        schema: expect.objectContaining({ name: 'orchestration_workflow_decomposition' }),
      }),
      expect.objectContaining({
        tracing: {
          promptVersion: 'v5',
          scenario: 'orchestration_workflow_decompose',
          schemaName: 'orchestration_workflow_decomposition',
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
      new OrchestrationWorkflowCriteriaGeneratorService({} as any, 'user-1').generate({
        orchestrationWorkflow: 'Ship it',
      }),
    ).resolves.toEqual([]);
  });

  it('keeps the array response for existing callers while exposing the full generated plan', async () => {
    generateObject.mockResolvedValue({
      criteria: [{ title: 'Benchmark is published', verifierType: 'agent' }],
      instruction: 'Publish the benchmark paper.',
      title: 'Publish benchmark paper',
    });
    const service = new OrchestrationWorkflowCriteriaGeneratorService({} as any, 'user-1');

    await expect(
      service.generate({ orchestrationWorkflow: 'Publish a benchmark paper' }),
    ).resolves.toEqual([{ title: 'Benchmark is published', verifierType: 'agent' }]);
    await expect(
      service.generatePlan({ orchestrationWorkflow: 'Publish a benchmark paper' }),
    ).resolves.toEqual({
      criteria: [{ title: 'Benchmark is published', verifierType: 'agent' }],
      instruction: 'Publish the benchmark paper.',
      title: 'Publish benchmark paper',
    });
  });
});
