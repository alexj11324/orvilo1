import type { OrviloDatabase } from '@orvilo/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ToolExecutionContext } from '../../types';

const mocks = vi.hoisted(() => ({
  createFtsSearchRepo: vi.fn(async () => ({ ftsSearchCandidateEnabled: false })),
  embeddings: vi.fn(),
  initModelRuntimeFromDeploymentConfig: vi.fn(),
  normalizeUserMemorySearchQueries: vi.fn(function (queries?: string[]) {
    return queries ?? [];
  }),
  recordUserMemoryLexicalSearchDecision: vi.fn(),
  searchMemory: vi.fn(),
  shouldRunUserMemoryLexicalSearch: vi.fn(),
}));

vi.mock('@/database/models/userMemory', () => ({
  normalizeUserMemorySearchQueries: mocks.normalizeUserMemorySearchQueries,
  shouldRunUserMemoryLexicalSearch: mocks.shouldRunUserMemoryLexicalSearch,
  UserMemoryModel: vi.fn().mockImplementation(function () {
    return {
      searchMemory: mocks.searchMemory,
    };
  }),
}));

vi.mock('@/database/schemas', () => ({
  userSettings: { id: 'id' },
}));

vi.mock('@/server/globalConfig', () => ({
  getServerDefaultFilesConfig: vi.fn(function () {
    return {
      embeddingModel: { model: 'default-embedding-model', provider: 'default-provider' },
    };
  }),
}));

vi.mock('@/server/modules/ModelRuntime', () => ({
  initModelRuntimeFromDeploymentConfig: mocks.initModelRuntimeFromDeploymentConfig,
}));

vi.mock('@/server/services/agentSignal/procedure', () => ({
  emitToolOutcomeSafely: vi.fn(),
  resolveToolOutcomeScope: vi.fn(function () {
    return { scope: 'user', scopeKey: 'user-1' };
  }),
}));

vi.mock('@/server/services/agentSignal/store/adapters/redis/policyStateStore', () => ({
  redisPolicyStateStore: {},
}));

vi.mock('@/server/services/ftsSearch', () => ({
  createFtsSearchRepo: mocks.createFtsSearchRepo,
}));

vi.mock('@/server/services/ftsSearch/observability', () => ({
  recordUserMemoryLexicalSearchDecision: mocks.recordUserMemoryLexicalSearchDecision,
}));

const { memoryRuntime } = await import('../memory');

const createContext = (): ToolExecutionContext => ({
  serverDB: {
    query: {
      userSettings: {
        findFirst: vi.fn(async () => undefined),
      },
    },
  } as unknown as OrviloDatabase,
  toolManifestMap: {},
  userId: 'synthetic-user',
});

describe('memoryRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the deployment embedding runtime for memory search', async () => {
    mocks.embeddings.mockResolvedValueOnce([[0.1, 0.2, 0.3]]);
    mocks.initModelRuntimeFromDeploymentConfig.mockReturnValueOnce({
      embeddings: mocks.embeddings,
    });
    mocks.searchMemory.mockResolvedValueOnce({
      activities: [],
      contexts: [],
      experiences: [],
      identities: [],
      preferences: [],
    });

    const runtime = await memoryRuntime.factory(createContext());

    await runtime.searchUserMemory({ queries: ['renewal timeline'] });

    expect(mocks.initModelRuntimeFromDeploymentConfig).toHaveBeenCalledWith(
      'synthetic-user',
      'default-provider',
      undefined,
    );
    expect(mocks.embeddings).toHaveBeenCalledWith(
      expect.objectContaining({
        input: ['renewal timeline'],
        model: 'default-embedding-model',
      }),
      expect.objectContaining({ user: 'synthetic-user' }),
    );
    expect(mocks.searchMemory).toHaveBeenCalledWith(
      expect.objectContaining({ queries: ['renewal timeline'] }),
      [[0.1, 0.2, 0.3]],
    );
  });

  it('records the lexical decision on the default Gateway memory path', async () => {
    const longQuery = 'context '.repeat(40).trimEnd();
    const embedding = [0.1, 0.2, 0.3];
    mocks.embeddings.mockResolvedValueOnce([embedding]);
    mocks.initModelRuntimeFromDeploymentConfig.mockReturnValueOnce({
      embeddings: mocks.embeddings,
    });
    mocks.searchMemory.mockResolvedValueOnce({
      activities: [],
      contexts: [],
      experiences: [],
      identities: [],
      preferences: [],
    });
    mocks.shouldRunUserMemoryLexicalSearch.mockReturnValueOnce(false);

    const runtime = await memoryRuntime.factory(createContext());

    await runtime.searchUserMemory({ queries: [longQuery] });

    expect(mocks.shouldRunUserMemoryLexicalSearch).toHaveBeenCalledWith([longQuery], [embedding]);
    expect(mocks.recordUserMemoryLexicalSearchDecision).toHaveBeenCalledWith({
      decision: 'skipped_long_context',
      queryCharacters: Array.from(longQuery).length,
      source: 'tool',
    });
  });
});
