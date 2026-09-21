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
      chatModel({ id: 'm-disabled', enabled: false }),
      chatModel({ abilities: { search: true }, id: 'm-search' }),
      chatModel({ abilities: {}, id: 'claude', providerId: 'anthropic' }),
    ]);
});

describe('AiInfraRepos', () => {
  describe('getEnabledModels', () => {
    it('returns builtin models of deployment-enabled providers', async () => {
      const repo = new AiInfraRepos({ openai: { enabled: true } });
      const models = await repo.getEnabledModels();

      expect(models.map((m) => `${m.providerId}/${m.id}`)).toEqual([
        'openai/m-1',
        'openai/m-search',
      ]);
    });

    it('excludes models of providers that are not deployment-enabled', async () => {
      const repo = new AiInfraRepos({ anthropic: { enabled: true } });
      const models = await repo.getEnabledModels();

      expect(models.map((m) => `${m.providerId}/${m.id}`)).toEqual(['anthropic/claude']);
    });

    it('returns all catalog models including disabled ones when filterEnabled is false', async () => {
      const repo = new AiInfraRepos({ openai: { enabled: true } });
      const models = await repo.getEnabledModels(false);

      expect(models.map((m) => m.id)).toEqual(
        expect.arrayContaining(['m-1', 'm-disabled', 'm-search']),
      );
    });

    it('injects search settings for models that enable builtin search', async () => {
      const repo = new AiInfraRepos({ openai: { enabled: true } });
      const models = await repo.getEnabledModels();

      const searchModel = models.find((m) => m.id === 'm-search');
      expect(searchModel?.settings?.searchImpl).toBeDefined();
    });

    it('prefers serverModelLists from deployment config over the catalog', async () => {
      const repo = new AiInfraRepos({
        openai: {
          enabled: true,
          serverModelLists: [chatModel({ id: 'deployed-only' })],
        } as never,
      });
      const models = await repo.getEnabledModels();

      expect(models.map((m) => m.id)).toEqual(['deployed-only']);
    });
  });
});
