// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ExpertiseDomainService } from '../expertise/domain';
import { TaskIntentService } from '../task/intent';
import { resolveLightweightJudgment } from './lightweightJudgment';

const mocks = vi.hoisted(() => ({
  binding: vi.fn(),
  agent: vi.fn(),
  model: vi.fn(),
  settings: vi.fn(),
  generate: vi.fn(),
  orchestrator: vi.fn(),
  exists: vi.fn(),
  use: vi.fn(),
}));
vi.mock('@/server/services/providerBinding/execution', () => ({
  resolveOrviloProviderBinding: mocks.binding,
}));
vi.mock('@/database/models/agent', () => ({
  AgentModel: class {
    existsById = mocks.exists;
    getOrchestratorSourceAgentId = mocks.orchestrator;
    getAgentConfig = mocks.agent;
    getAgentModelConfig = mocks.model;
  },
}));
vi.mock('@/server/routers/lambda/_helpers/workspaceAgentGuard', () => ({
  assertCanUseWorkspaceAgent: mocks.use,
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

beforeEach(() => {
  vi.resetAllMocks();
  mocks.agent.mockResolvedValue({ agencyConfig: { heterogeneousProvider: { type: 'codex' } } });
  mocks.exists.mockResolvedValue(true);
  mocks.settings.mockResolvedValue({
    systemAgent: { expertise: { model: 'fallback', provider: 'openai' } },
  });
});
describe('optional builtin work (#623)', () => {
  it('uses the selected CLI Agent for task intent without reading a server model', async () => {
    await expect(
      resolveLightweightJudgment({} as never, 'user', 'goal', 'codex', 'ws'),
    ).resolves.toEqual({ binding: { agentId: 'codex', allowEnvFallback: false } });
    expect(mocks.binding).not.toHaveBeenCalled();
    expect(mocks.model).not.toHaveBeenCalled();
    expect(mocks.settings).not.toHaveBeenCalled();
  });
  it('uses the configured Orchestrator for unassigned task intent', async () => {
    mocks.orchestrator.mockResolvedValue('orchestrator');
    await expect(resolveLightweightJudgment({} as never, 'user', 'goal')).resolves.toEqual({
      binding: { agentId: 'orchestrator', allowEnvFallback: false },
    });
  });
  it('reports a stable precondition without invoking a model for intent', async () => {
    await expect(
      new TaskIntentService({} as never, 'user').analyze({ instruction: 'Ship it' }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED', message: 'TASK_INTENT_UNAVAILABLE' });
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('reports a stable precondition without invoking a model for self-evolution', async () => {
    await expect(
      new ExpertiseDomainService({} as never, 'user').draftFromBrief({
        agentId: 'codex',
        brief: 'Improve',
      }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED', message: 'EXPERTISE_UNAVAILABLE' });
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('uses a configured builtin fallback for an ACP owner without calling its CLI model', async () => {
    mocks.binding.mockResolvedValue({ config: { model: 'fallback', provider: 'openai' } });
    await expect(
      resolveLightweightJudgment({} as never, 'user', 'expertise', 'codex'),
    ).resolves.toEqual({
      model: 'fallback',
      provider: 'openai',
      binding: { slug: 'self-reflection' },
    });
    expect(mocks.model).not.toHaveBeenCalled();
  });
  it('keeps the builtin owner model ahead of global settings', async () => {
    mocks.binding.mockResolvedValue({});
    mocks.agent.mockResolvedValue({ model: 'owner' });
    mocks.model.mockResolvedValue({ model: 'owner', provider: 'openai' });
    await expect(
      resolveLightweightJudgment({} as never, 'user', 'expertise', 'owner'),
    ).resolves.toEqual({
      model: 'owner',
      provider: 'openai',
      binding: { agentId: 'owner' },
    });
    expect(mocks.settings).not.toHaveBeenCalled();
  });
});
