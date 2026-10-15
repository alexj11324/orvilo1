// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveMarketUserContext } from '@/libs/trpc/lambda/middleware';
import { DiscoverService } from '@/server/services/discover';
import { createFtsSearchRepo } from '@/server/services/ftsSearch';

import { searchRouter } from '../search';

vi.mock('@/libs/trpc/lambda', async () => {
  const { initTRPC } = await import('@trpc/server');
  return { router: initTRPC.create().router };
});
vi.mock('@/business/server/trpc-middlewares/workspaceAuth', async () => {
  const { initTRPC } = await import('@trpc/server');
  return { wsCompatProcedure: initTRPC.create().procedure };
});
vi.mock('@/libs/trpc/lambda/middleware', () => ({
  resolveMarketUserContext: vi.fn(() => {
    throw new Error('Retired marketplace identity must not be reached');
  }),
  serverDatabase: ({ next }: { next: (opts: { ctx: { serverDB: object } }) => unknown }) =>
    next({ ctx: { serverDB: {} } }),
}));
vi.mock('@/server/services/discover', () => ({ DiscoverService: vi.fn() }));
vi.mock('@/server/services/ftsSearch', () => ({ createFtsSearchRepo: vi.fn() }));
vi.mock('../_helpers/knowledgeBaseAccess', () => ({
  getRestrictedKnowledgeBaseIds: vi.fn().mockResolvedValue(['restricted-kb']),
}));

describe('searchRouter', () => {
  const search = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    search.mockResolvedValue([]);
    vi.mocked(createFtsSearchRepo).mockResolvedValue({ search } as any);
    vi.mocked(DiscoverService).mockImplementation(() => {
      throw new Error('Retired marketplace must not be reached');
    });
  });

  it('returns scoped FTS results without resolving marketplace identity or services', async () => {
    const results = [{ id: 'local-agent', title: 'Local Agent', type: 'agent' }];
    search.mockResolvedValue(results);
    const caller = searchRouter.createCaller({ userId: 'test-user' } as any);

    await expect(caller.query({ query: 'assistant', limitPerType: 3, offset: 2 })).resolves.toEqual(
      results,
    );
    expect(search).toHaveBeenCalledWith({
      excludeKnowledgeBaseIds: ['restricted-kb'],
      limitPerType: 3,
      offset: 2,
      query: 'assistant',
    });
    expect(createFtsSearchRepo).toHaveBeenCalledWith(
      expect.objectContaining({
        usage: 'unified_search',
        userId: 'test-user',
        workspaceId: undefined,
      }),
    );
    expect(resolveMarketUserContext).not.toHaveBeenCalled();
    expect(DiscoverService).not.toHaveBeenCalled();
  });

  it.each([undefined, 'workspace-1'])(
    'preserves typed scopes for workspace %s and skips unrelated KB exclusions',
    async (workspaceId) => {
      const caller = searchRouter.createCaller({ userId: 'test-user', workspaceId } as any);

      await expect(
        caller.query({ agentId: 'agent-1', query: 'message', type: 'message' }),
      ).resolves.toEqual([]);
      expect(search).toHaveBeenCalledWith({
        agentId: 'agent-1',
        excludeKnowledgeBaseIds: [],
        query: 'message',
        type: 'message',
      });
      expect(createFtsSearchRepo).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'test-user', workspaceId }),
      );
    },
  );

  it.each(['communityAgent', 'mcp', 'plugin'] as const)(
    'rejects retired public search type %s',
    async (type) => {
      const caller = searchRouter.createCaller({ userId: 'test-user' } as any);

      // Simulate a stale external caller rather than bypassing validation.
      // @ts-expect-error Retired marketplace types are absent from the public API.
      await expect(caller.query({ query: 'assistant', type })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
      expect(createFtsSearchRepo).not.toHaveBeenCalled();
      expect(DiscoverService).not.toHaveBeenCalled();
    },
  );

  it('returns no results for blank input without initializing a search backend', async () => {
    const caller = searchRouter.createCaller({ userId: 'test-user' } as any);

    await expect(caller.query({ query: '  ' })).resolves.toEqual([]);
    expect(createFtsSearchRepo).not.toHaveBeenCalled();
    expect(DiscoverService).not.toHaveBeenCalled();
  });
});
