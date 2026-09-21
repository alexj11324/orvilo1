import type { EnabledAiModel } from 'model-bank';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AiInfraRepos } from '../index';

// vitest.config.server.mts runs with isolate:false, so one file's module mock
// serves every file; delegate through a per-test-installed global instead.
type GlobalWithMock = typeof globalThis & {
  __orviloTestLoadModels?: ReturnType<typeof vi.fn>;
};

vi.mock('@orvilo/business-model-bank/model-config', () => ({
  loadModels: (...args: unknown[]) =>
    ((globalThis as GlobalWithMock).__orviloTestLoadModels ?? (() => Promise.resolve([])))(...args),
}));

const chatModel = (over: Partial<EnabledAiModel> = {}): EnabledAiModel =>
  ({
    abilities: {},
    displayName: 'Model',
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
      chatModel(),
      chatModel({ id: 'm-2' }),
      chatModel({ id: 'm-hidden', visible: false }),
      chatModel({ abilities: { search: true }, id: 'm-search' }),
      chatModel({ id: 'm-img', type: 'tts' }),
      chatModel({ enabled: false, id: 'm-off' }),
    ]);
});

describe('AiInfraRepos', () => {
  describe('getAiProviderModelList', () => {
    it('returns visible builtin models of the provider', async () => {
      const repo = new AiInfraRepos({});
      const models = await repo.getAiProviderModelList('openai');

      expect(models.map((m) => m.id)).toEqual(['m-1', 'm-2', 'm-search', 'm-img', 'm-off']);
    });

    it('returns an empty list for an unknown provider', async () => {
      const repo = new AiInfraRepos({});
      expect(await repo.getAiProviderModelList('nope')).toEqual([]);
    });

    it('filters by type and enabled', async () => {
      const repo = new AiInfraRepos({});

      expect(
        (await repo.getAiProviderModelList('openai', { type: 'tts' })).map((m) => m.id),
      ).toEqual(['m-img']);
      expect(
        (await repo.getAiProviderModelList('openai', { enabled: false })).map((m) => m.id),
      ).toEqual(['m-off']);
    });

    it('supports offset/limit pagination', async () => {
      const repo = new AiInfraRepos({});
      const models = await repo.getAiProviderModelList('openai', { limit: 2, offset: 1 });

      expect(models.map((m) => m.id)).toEqual(['m-2', 'm-search']);
    });

    it('injects search settings for builtin-search models', async () => {
      const repo = new AiInfraRepos({});
      const models = await repo.getAiProviderModelList('openai');

      expect(models.find((m) => m.id === 'm-search')?.settings?.searchImpl).toBeDefined();
    });
  });
});
