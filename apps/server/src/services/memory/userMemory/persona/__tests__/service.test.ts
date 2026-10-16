// @vitest-environment node
import { type OrviloDatabase } from '@orvilo/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserPersonaModel } from '@/database/models/userMemory/persona';
import type * as AiInfraReposModule from '@/database/repositories/aiInfra';

import { UserPersonaService } from '../service';

const personaMocks = vi.hoisted(() => ({
  historicalPersona: { persona: '# Historical persona', version: 1 },
  upsertPersona: vi.fn(),
}));
vi.mock('@/database/models/userMemory/persona', () => ({
  UserPersonaModel: vi.fn().mockImplementation(function () {
    return {
      getLatestPersonaDocument: async () => personaMocks.historicalPersona,
      upsertPersona: personaMocks.upsertPersona,
    };
  }),
}));

// Use vi.hoisted to ensure mocks are available when vi.mock factory runs
const aiInfraMocks = vi.hoisted(() => ({
  getAiProviderRuntimeState: vi.fn(),
  tryMatchingModelFrom: vi.fn(),
  tryMatchingProviderFrom: vi.fn(),
}));

vi.mock('@/database/repositories/aiInfra', () => {
  const AiInfraRepos = vi.fn().mockImplementation(function () {
    return {
      getAiProviderRuntimeState: aiInfraMocks.getAiProviderRuntimeState,
    };
  }) as unknown as typeof AiInfraReposModule.AiInfraCatalogRepos;

  (AiInfraRepos as any).tryMatchingModelFrom = aiInfraMocks.tryMatchingModelFrom;
  (AiInfraRepos as any).tryMatchingProviderFrom = aiInfraMocks.tryMatchingProviderFrom;

  return { AiInfraCatalogRepos: AiInfraRepos };
});

vi.mock('@/server/globalConfig/parseMemoryExtractionConfig', () => ({
  parseMemoryExtractionConfig: () => ({
    agentLayerExtractor: {
      apiKey: 'test-key',
      baseURL: 'https://example.com',
      language: 'English',
      layers: { context: 'gpt-mock' },
      model: 'gpt-mock',
      provider: 'openai',
    },
    agentPersonaWriter: {
      apiKey: 'test-key',
      baseURL: 'https://example.com',
      language: 'English',
      model: 'gpt-mock',
      provider: 'openai',
    },
  }),
}));

vi.mock('@/server/modules/KeyVaultsEncrypt', () => ({
  KeyVaultsGateKeeper: { getUserKeyVaults: vi.fn() },
}));

const structuredResult = {
  diff: '- updated',
  memoryIds: ['mem-1'],
  persona: '# Persona',
  reasoning: 'reason',
  sourceIds: ['src-1'],
  summary: 'summary',
};

const toolCall = vi.fn().mockResolvedValue(structuredResult);

vi.mock('@orvilo/memory-user-memory', () => ({
  UserPersonaExtractor: vi.fn().mockImplementation(function () {
    return {
      toolCall,
    };
  }),
}));

vi.mock('@/server/services/memory/userMemory/extract', () => ({
  resolveRuntimeAgentConfig: vi.fn().mockResolvedValue({}),
}));

let db: OrviloDatabase;
const userId = 'user-persona-service';

beforeEach(async () => {
  toolCall.mockClear();
  aiInfraMocks.getAiProviderRuntimeState.mockReset();
  aiInfraMocks.tryMatchingModelFrom.mockReset();
  aiInfraMocks.tryMatchingProviderFrom.mockReset();
  aiInfraMocks.tryMatchingModelFrom.mockResolvedValue('openai');
  aiInfraMocks.tryMatchingProviderFrom.mockResolvedValue('openai');
  aiInfraMocks.getAiProviderRuntimeState.mockResolvedValue({
    enabledAiModels: [
      { abilities: {}, enabled: true, id: 'gpt-mock', providerId: 'openai', type: 'chat' },
    ],
    enabledAiProviders: [],
    enabledChatAiProviders: [],
    runtimeConfig: {
      openai: { keyVaults: { apiKey: 'vault-key', baseURL: 'https://vault.example.com' } },
    },
  });
  db = {} as OrviloDatabase;
});

describe('UserPersonaService', () => {
  it('rejects automatic persona writing and preserves the existing persona history', async () => {
    const model = new UserPersonaModel(db, userId);
    const before = await model.getLatestPersonaDocument();
    await expect(
      new UserPersonaService(db).composeWriting({ userId, username: 'User' }),
    ).rejects.toThrow('Platform memory persona writing is unavailable');
    expect(await model.getLatestPersonaDocument()).toEqual(before);
    expect(toolCall).not.toHaveBeenCalled();
    expect(personaMocks.upsertPersona).not.toHaveBeenCalled();
  });
});
