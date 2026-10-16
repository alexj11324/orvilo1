// @vitest-environment node
import { expect, it, vi } from 'vitest';

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

it('does not execute the retired rubric review service', async () => {
  await expect(
    new TaskReviewService({} as never, 'user', 'workspace').review({} as never),
  ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  expect(mocks.getAgentModelConfig).not.toHaveBeenCalled();
  expect(mocks.generateObject).not.toHaveBeenCalled();
});
