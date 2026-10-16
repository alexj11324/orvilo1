import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OrviloDatabase } from '@/database/type';

import { OrchestrationWorkflowExplorationPlanner } from './explorationPlanner';

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

beforeEach(() => {
  vi.clearAllMocks();
});
const input = {
  experiments: [],
  requirement: 'Find evidence',
  instruction: 'Compare alternatives',
  maxExperiments: 3,
};
const planner = new OrchestrationWorkflowExplorationPlanner({} as OrviloDatabase, 'user');

describe('OrchestrationWorkflowExplorationPlanner', () => {
  it('uses Orchestrator generation and records a separate prompt cohort', async () => {
    generateObject.mockResolvedValue({
      action: 'verify',
      parentNodeId: '',
      title: '',
      instruction: '',
      reason: 'Evidence warrants independent verification',
    });
    expect((await planner.plan(input)).action).toBe('verify');
    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({ schema: expect.any(Object) }),
      {
        judgment: { binding: { agentId: undefined }, purpose: 'orchestrationWorkflow.explore' },
        kind: 'judgment',
        tracing: {
          scenario: 'orchestration_workflow_explore',
          promptVersion: 'v2',
          schemaName: 'orchestration_workflow_exploration',
        },
      },
    );
  });
  it('accepts a revision that reuses the parent title but keeps its corrected protocol', async () => {
    generateObject.mockResolvedValue({
      action: 'revise',
      parentNodeId: 'exp-1',
      title: '',
      instruction: 'Emit a calibrated score instead of a boolean, then report AUC',
      reason: 'The arms measured a hard verdict, which discards the ranking signal',
    });
    const plan = await planner.plan(input);
    expect(plan.action).toBe('revise');
    expect(plan.parentNodeId).toBe('exp-1');
  });
  it('rejects a revision that names no experiment or carries no corrected protocol', async () => {
    generateObject.mockResolvedValue({
      action: 'revise',
      parentNodeId: '',
      title: 'Fix',
      instruction: 'Measure AUC',
      reason: 'Wrong instrument',
    });
    await expect(planner.plan(input)).rejects.toThrow();
    generateObject.mockResolvedValue({
      action: 'revise',
      parentNodeId: 'exp-1',
      title: 'Fix',
      instruction: '   ',
      reason: 'Wrong instrument',
    });
    await expect(planner.plan(input)).rejects.toThrow();
  });
  it('rejects empty expansion instructions and unknown actions', async () => {
    generateObject.mockResolvedValue({
      action: 'expand',
      parentNodeId: 'n1',
      title: 'Alternative',
      instruction: '  ',
      reason: 'Try again',
    });
    await expect(planner.plan(input)).rejects.toThrow();
    generateObject.mockResolvedValue({
      action: 'achieved',
      parentNodeId: '',
      title: '',
      instruction: '',
      reason: 'Done',
    });
    await expect(planner.plan(input)).rejects.toThrow();
  });
});
