import type { EnabledAiModel } from 'model-bank';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AiInfraRepos } from '../index';

const loadModels = vi.hoisted(() => vi.fn());

vi.mock('@orvilo/business-model-bank/model-config', () => ({
  loadModels,
}));

const model = (over: Partial<EnabledAiModel> = {}): EnabledAiModel =>
  ({
    abilities: {},
    enabled: true,
    id: 'm-1',
    providerId: 'openai',
    type: 'chat',
    ...over,
  }) as EnabledAiModel;

beforeEach(() => {
  vi.clearAllMocks();
  loadModels.mockResolvedValue([
    model(),
    model({ id: 'm-off', enabled: false }),
    model({ id: 'm-img', type: 'image' }),
    model({ id: 'm-vid', type: 'video' }),
    model({ id: 'claude', providerId: 'anthropic' }),
  ]);
});

describe('AiInfraRepos', () => {
  describe('getAiProviderRuntimeState', () => {
    it('returns deployment-owned runtime state', async () => {
      const providerConfigs = {
        anthropic: { enabled: false },
        openai: { apiKey: 'deploy-key', enabled: true },
      };
      const repo = new AiInfraRepos(providerConfigs as never);
      const state = await repo.getAiProviderRuntimeState();

      expect(Object.keys(state.runtimeConfig)).toEqual(['openai']);
      expect(state.runtimeConfig.openai).toMatchObject({ config: {}, keyVaults: {} });
      expect(state.enabledAiProviders.map((p) => p.id)).toEqual(['openai']);
      expect(state.enabledAiModels.map((m) => m.id).sort()).toEqual(['m-1', 'm-img', 'm-vid']);
      expect(state.enabledChatAiProviders.map((p) => p.id)).toEqual(['openai']);
    });

    it('returns an empty state when nothing is deployment-enabled', async () => {
      const repo = new AiInfraRepos({});
      const state = await repo.getAiProviderRuntimeState();

      expect(state.enabledAiModels).toEqual([]);
      expect(state.enabledAiProviders).toEqual([]);
      expect(state.runtimeConfig).toEqual({});
    });
  });
});
