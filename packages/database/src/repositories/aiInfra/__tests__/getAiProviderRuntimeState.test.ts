import type { EnabledAiModel } from 'model-bank';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AiInfraRepos } from '../index';

// vitest.config.server.mts runs with isolate:false, so one file's module mock
// serves every file; delegate through a per-test-installed global instead.
type GlobalWithMock = typeof globalThis & {
  __orviloTestLoadModels?: () => Promise<unknown[]>;
};

vi.mock('@orvilo/business-model-bank/model-config', () => ({
  loadModels: () =>
    (globalThis as GlobalWithMock).__orviloTestLoadModels?.() ?? Promise.resolve([]),
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
  (globalThis as GlobalWithMock).__orviloTestLoadModels = vi
    .fn()
    .mockResolvedValue([
      model(),
      model({ id: 'm-off', enabled: false }),
      model({ id: 'm-img', type: 'tts' }),
      model({ id: 'm-vid', type: 'realtime' }),
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
