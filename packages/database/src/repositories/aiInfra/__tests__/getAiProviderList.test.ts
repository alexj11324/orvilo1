import { describe, expect, it, vi } from 'vitest';

import { AiInfraCatalogRepos } from '../index';

// vitest.config.server.mts runs with isolate:false, so one file's module mock
// serves every file; delegate through a per-test-installed global instead.
vi.mock('@orvilo/business-model-bank/model-config', () => ({
  loadModels: () =>
    (
      globalThis as typeof globalThis & {
        __orviloTestLoadModels?: () => Promise<unknown[]>;
      }
    ).__orviloTestLoadModels?.() ?? Promise.resolve([]),
}));

describe('AiInfraCatalogRepos', () => {
  describe('getAiProviderList', () => {
    it('returns the builtin catalog in catalog order', async () => {
      const repo = new AiInfraCatalogRepos({});
      const list = await repo.getAiProviderList();

      const { DEFAULT_MODEL_PROVIDER_LIST } = await import('model-bank/modelProviders');
      expect(list.map((p) => p.id)).toEqual(DEFAULT_MODEL_PROVIDER_LIST.map((p) => p.id));
      expect(list.every((p) => p.source === 'builtin')).toBe(true);
    });

    it('marks providers enabled only via deployment config', async () => {
      const repo = new AiInfraCatalogRepos({
        openai: { enabled: true },
      });
      const list = await repo.getAiProviderList();

      expect(list.find((p) => p.id === 'openai')?.enabled).toBe(true);
      expect(list.find((p) => p.id === 'anthropic')?.enabled).toBe(false);
    });
  });
});
