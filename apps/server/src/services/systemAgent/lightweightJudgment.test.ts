// @vitest-environment node
import { TRPCError } from '@trpc/server';
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
}));
vi.mock('@/server/services/providerBinding/execution', () => ({
  resolveOrviloProviderBinding: mocks.binding,
}));
vi.mock('@/database/models/agent', () => ({
  AgentModel: class {
    getOrchestratorSourceAgentId = async () => {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'ORCHESTRATOR_SETUP_REQUIRED' });
    };
    getAgentConfig = mocks.agent;
    getAgentModelConfig = mocks.model;
  },
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
  mocks.settings.mockResolvedValue({
    systemAgent: { expertise: { model: 'fallback', provider: 'openai' } },
  });
});
describe('optional builtin work (#623)', () => {
  it('reports a stable precondition without invoking a model for intent', async () => {
    await expect(
      new TaskIntentService({} as never, 'user').analyze({ instruction: 'Ship it' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: 'ORCHESTRATOR_SETUP_REQUIRED' });
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
