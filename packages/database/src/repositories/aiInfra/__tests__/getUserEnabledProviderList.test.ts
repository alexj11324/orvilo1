import { describe, expect, it, vi } from 'vitest';

import { AiInfraRepos } from '../index';

// vitest.config.server.mts runs with isolate:false, so one file's module mock
// serves every file; delegate through a per-test-installed global instead.
vi.mock('@orvilo/business-model-bank/model-config', () => ({
  loadModels: (...args: unknown[]) =>
    (
      (
        globalThis as typeof globalThis & {
          __orviloTestLoadModels?: (...a: unknown[]) => Promise<unknown>;
        }
      ).__orviloTestLoadModels ?? (() => Promise.resolve([]))
    )(...args),
}));

describe('AiInfraRepos', () => {
  describe('getUserEnabledProviderList', () => {
    it('returns only deployment-enabled providers in catalog order', async () => {
      const repo = new AiInfraRepos({
        anthropic: { enabled: true },
        openai: { enabled: true },
      });
      const list = await repo.getUserEnabledProviderList();

      const { DEFAULT_MODEL_PROVIDER_LIST } = await import('model-bank/modelProviders');
      const catalogOrder = DEFAULT_MODEL_PROVIDER_LIST.map((p) => p.id);
      expect(list.map((p) => p.id)).toEqual(
        [...list.map((p) => p.id)].sort(
          (a, b) => catalogOrder.indexOf(a) - catalogOrder.indexOf(b),
        ),
      );
      expect(new Set(list.map((p) => p.id))).toEqual(new Set(['anthropic', 'openai']));
      expect(list.every((p) => p.source === 'builtin')).toBe(true);
    });

    it('returns an empty list when nothing is enabled', async () => {
      const repo = new AiInfraRepos({ openai: { enabled: false } });
      expect(await repo.getUserEnabledProviderList()).toEqual([]);
    });
  });
});
