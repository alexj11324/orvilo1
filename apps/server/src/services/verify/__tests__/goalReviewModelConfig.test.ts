// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OrviloDatabase } from '@/database/type';

import { resolveGoalReviewModelConfig } from '../goalReviewModelConfig';

const mocks = vi.hoisted(() => ({
  agent: vi.fn(),
  task: vi.fn(),
  init: vi.fn(),
  models: vi.fn(),
  goal: vi.fn(),
}));
vi.mock('@/database/models/agent', () => ({
  AgentModel: vi.fn(function () {
    return { getAgentModelConfig: mocks.agent };
  }),
}));
vi.mock('@/database/models/task', () => ({
  TaskModel: vi.fn(function () {
    return { findById: mocks.task };
  }),
}));
vi.mock('@/database/repositories/aiInfra', () => ({
  AiInfraRepos: vi.fn(function () {
    return { getAiProviderModelList: mocks.models };
  }),
}));
vi.mock('@/server/globalConfig', () => ({
  getServerGlobalConfig: vi.fn().mockResolvedValue({ aiProvider: {} }),
}));
// The R08 contract: this module must not probe deployment credentials at all.
// Keeping the mock registered means a regression that re-imports the runtime
// initializer turns red on the `init` assertions below.
vi.mock('@/server/modules/ModelRuntime', () => ({
  initModelRuntimeFromDeploymentConfig: mocks.init,
}));
vi.mock('@/server/services/goal/modelConfig', () => ({ resolveGoalModelConfig: mocks.goal }));
vi.mock('../modelConfig', () => ({
  REVIEW_PREDICT_MODEL_CONFIG: { model: 'gemini', provider: 'google' },
  isHeterogeneousVerifyProvider: (provider: string) => provider === 'codex',
}));
const db = {} as OrviloDatabase;
const configured = { model: 'gpt-4o', provider: 'openai' };
const resolve = (requiresVision = false, verifierAgentId?: string) =>
  resolveGoalReviewModelConfig(db, 'u1', { taskId: 't1', requiresVision, verifierAgentId }, 'w1');

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.agent.mockResolvedValue(null);
  mocks.task.mockResolvedValue({ config: configured });
  mocks.goal.mockResolvedValue({ model: 'unavailable', provider: 'google' });
  mocks.models.mockResolvedValue([{ id: 'gpt-4o', abilities: { vision: true } }]);
  mocks.init.mockRejectedValue(new Error('deployment credentials must not be probed'));
});

describe('Goal review model selection', () => {
  it('uses an explicitly configured verifier without probing deployment credentials', async () => {
    mocks.agent.mockResolvedValue(configured);
    expect(await resolve(true, 'verifier')).toEqual(configured);
    expect(mocks.init).not.toHaveBeenCalled();
  });
  it('keeps the pinned reviewer identity without any credential probe', async () => {
    // The recorded model/provider is the reviewing agent's identity — the
    // judgment itself runs as an authorized ACP operation, so the pinned
    // reviewer is selected even though Google credentials are absent here.
    expect(await resolve()).toEqual({ model: 'gemini', provider: 'google' });
    expect(mocks.init).not.toHaveBeenCalled();
  });
  it('keeps the vision gate while selecting identity candidates', async () => {
    // The pinned gemini reviewer is not in the vision-capable list, so the
    // task's vision-capable model wins.
    expect(await resolve(true)).toEqual(configured);
    expect(mocks.init).not.toHaveBeenCalled();
  });
  it('never silently sends screenshots to a text-only fallback', async () => {
    mocks.models.mockResolvedValue([{ id: 'gpt-4o', abilities: { vision: false } }]);
    expect(await resolve(true)).toBeUndefined();
  });
  it('allows a configured text-only model for text evidence', async () => {
    mocks.agent.mockResolvedValue(configured);
    mocks.models.mockResolvedValue([]);
    expect(await resolve(false, 'verifier')).toEqual(configured);
  });
  it('does not treat a CLI agent as an LLM review provider', async () => {
    mocks.task.mockResolvedValue({ config: { model: 'codex-model', provider: 'codex' } });
    // Pinned reviewer still wins; the codex task model is filtered out.
    expect(await resolve()).toEqual({ model: 'gemini', provider: 'google' });
    expect(mocks.init.mock.calls.some((call) => call[1] === 'codex')).toBe(false);
  });
});
