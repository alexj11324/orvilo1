import { describe, expect, it, vi } from 'vitest';

import { createLinearCoordinatorPlanner } from './coordinator';
import type { TaskPlanningSnapshot } from './planning';

const mocks = vi.hoisted(() => ({
  generateObject: vi.fn(),
  getAgentConfig: vi.fn(),
}));

vi.mock('@/database/models/agent', () => ({
  AgentModel: vi.fn(function () {
    return { getAgentConfig: mocks.getAgentConfig };
  }),
}));
vi.mock('@/server/services/aiGeneration', () => ({
  AiGenerationService: vi.fn(function () {
    return { generateObject: mocks.generateObject };
  }),
}));

const snapshot: TaskPlanningSnapshot = {
  dependencies: [],
  events: [],
  scope: { id: 'scope-1', scopeId: 'project-1', scopeType: 'project', revision: 4 },
  tasks: [],
};

describe('createLinearCoordinatorPlanner', () => {
  it('uses the existing project coordinator model and validates its proposal', async () => {
    mocks.getAgentConfig.mockResolvedValue({ model: 'coordinator-model', provider: 'openai' });
    mocks.generateObject.mockResolvedValue({
      actions: [{ action: 'noop', reason: 'The graph already covers the Linear change.' }],
      explanation: 'No task graph mutation is required.',
      requiresApproval: false,
    });
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            { coordinatorAgentId: 'agent-1', name: 'Project', userId: 'owner-1' },
          ]),
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              { coordinatorAgentId: 'agent-1', name: 'Project', userId: 'owner-1' },
            ]),
          })),
        })),
      })),
    } as never;

    await expect(createLinearCoordinatorPlanner(db, 'workspace-1')(snapshot)).resolves.toEqual({
      actions: [{ action: 'noop', reason: 'The graph already covers the Linear change.' }],
      explanation: 'No task graph mutation is required.',
      requiresApproval: false,
    });
    expect(mocks.generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'coordinator-model',
        provider: 'openai',
        schema: expect.objectContaining({ name: 'linear_task_planning_proposal' }),
      }),
      expect.objectContaining({
        metadata: expect.objectContaining({ trigger: 'linear_incremental_replanning' }),
      }),
    );
  });
});
