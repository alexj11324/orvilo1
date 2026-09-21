import { describe, expect, it, vi } from 'vitest';

import { AiInfraRepos } from '../index';

vi.mock('@orvilo/business-model-bank/model-config', () => ({
  loadModels: vi.fn().mockResolvedValue([]),
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
