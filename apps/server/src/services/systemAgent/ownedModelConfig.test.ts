// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveExpertiseModelConfig } from '../expertise/modelConfig';
import { resolveGoalModelConfig } from '../goal/modelConfig';

const { getAgentConfig, getAgentModelConfig, getUserSettings, resolveBinding } = vi.hoisted(() => ({
  getAgentConfig: vi.fn(),
  getAgentModelConfig: vi.fn(),
  getUserSettings: vi.fn(),
  resolveBinding: vi.fn(),
}));
vi.mock('@/database/models/agent', () => ({
  AgentModel: class {
    getAgentConfig = getAgentConfig;
    getAgentModelConfig = getAgentModelConfig;
  },
}));
vi.mock('@/database/models/user', () => ({
  UserModel: class {
    getUserSettings = getUserSettings;
  },
}));
vi.mock('@/server/services/providerBinding/execution', () => ({
  resolveOrviloProviderBinding: resolveBinding,
}));

beforeEach(() => {
  vi.resetAllMocks();
  getUserSettings.mockResolvedValue({
    systemAgent: {
      goal: { model: 'fallback', provider: 'openai' },
      expertise: { model: 'fallback', provider: 'openai' },
    },
  });
});

for (const resolve of [resolveGoalModelConfig, resolveExpertiseModelConfig])
  describe(resolve.name, () => {
    it('prefers the owning agent to the global setting', async () => {
      getAgentConfig.mockResolvedValue({ model: 'agent-model' });
      getAgentModelConfig.mockResolvedValue({ model: 'agent-model', provider: 'anthropic' });
      expect(await resolve({} as never, 'owner', 'agent', 'workspace')).toEqual({
        model: 'agent-model',
        provider: 'anthropic',
      });
      expect(getUserSettings).not.toHaveBeenCalled();
    });
    it('uses the builtin route binding instead of a stale legacy model field', async () => {
      getAgentConfig.mockResolvedValue({
        agencyConfig: { heterogeneousProvider: { type: 'orvilo', model: 'route-model' } },
      });
      resolveBinding.mockResolvedValue({ config: { model: 'route-model', provider: 'openai' } });
      expect(await resolve({} as never, 'owner', 'agent')).toEqual({
        model: 'route-model',
        provider: 'openai',
      });
    });
    it('blocks external agents before dispatch instead of using an unrelated API model', async () => {
      getAgentConfig.mockResolvedValue({
        model: 'stale-api-model',
        agencyConfig: { heterogeneousProvider: { type: 'codex' } },
      });
      await expect(resolve({} as never, 'owner', 'agent')).rejects.toThrow(
        'CLI agents are not supported',
      );
      expect(getAgentModelConfig).not.toHaveBeenCalled();
      expect(getUserSettings).not.toHaveBeenCalled();
    });
    it('falls back when the owner is absent', async () => {
      expect(await resolve({} as never, 'owner', 'missing')).toEqual({
        model: 'fallback',
        provider: 'openai',
      });
    });
  });
