// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { TaskReviewService } from './index';

const mocks = vi.hoisted(() => ({
  getAgentModelConfig: vi
    .fn()
    .mockResolvedValue({ model: 'owner-model', provider: 'owner-provider' }),
  getUserSettings: vi.fn(),
  generateObject: vi.fn().mockResolvedValue({ reason: 'correct', score: 1 }),
}));
vi.mock('@/database/models/user', () => ({
  UserModel: class {
    getUserSettings = mocks.getUserSettings;
  },
}));
vi.mock('@/database/models/agent', () => ({
  AgentModel: class {
    getAgentModelConfig = mocks.getAgentModelConfig;
  },
}));
vi.mock('@/server/services/aiGeneration', () => ({
  AiGenerationService: class {
    generateObject = mocks.generateObject;
  },
}));

describe('agent-owned task review', () => {
  it('runs a rubric using the assignee without reading retired topic settings', async () => {
    const result = await new TaskReviewService({} as never, 'user', 'workspace').review({
      content: 'implemented',
      judge: {},
      judgeAgentId: 'agent-owner',
      taskName: 'Implement feature',
      rubrics: [
        {
          id: 'rubric',
          type: 'llm-rubric',
          config: { criteria: 'Correct implementation' },
          weight: 1,
        } as never,
      ],
    });
    expect(result.passed).toBe(true);
    expect(mocks.getUserSettings).not.toHaveBeenCalled();
    expect(mocks.getAgentModelConfig).toHaveBeenCalledWith('agent-owner');
    expect(mocks.generateObject).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'owner-model', provider: 'owner-provider' }),
      expect.objectContaining({
        kind: 'judgment',
        judgment: { binding: { agentId: 'agent-owner' }, purpose: 'task.review' },
      }),
    );
  });
});
