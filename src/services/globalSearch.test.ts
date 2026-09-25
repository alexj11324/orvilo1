import { beforeEach, describe, expect, it, vi } from 'vitest';

const ftsQuery = vi.fn();
const workSearch = vi.fn();

// globalSearch.ts imports both clients at module load; stub them so the
// service resolves without real tRPC transport.
vi.mock('@/libs/trpc/client', () => ({
  lambdaClient: {
    search: { query: { query: (...args: unknown[]) => ftsQuery(...args) } },
  },
}));

vi.mock('@/services/workAttention', () => ({
  workAttentionService: { search: (...args: unknown[]) => workSearch(...args) },
}));

const { globalSearchService, resolveGlobalSearchSources } = await import('./globalSearch');

const workRow = (type: 'project' | 'savedView' | 'task' | 'team', id: string, title: string) => ({
  createdAt: new Date('2026-09-01'),
  description: type === 'task' ? `ORV-${id}` : type === 'team' ? 'CORE' : null,
  id,
  relevance: 1,
  title,
  type,
  updatedAt: new Date('2026-09-02'),
});

const ftsRow = (type: string, id: string, title: string) => ({
  createdAt: new Date('2026-09-01'),
  description: null,
  id,
  relevance: 2,
  title,
  type,
  updatedAt: new Date('2026-09-02'),
});

beforeEach(() => {
  ftsQuery.mockReset().mockResolvedValue([]);
  workSearch.mockReset().mockResolvedValue({ data: [], success: true });
});

describe('resolveGlobalSearchSources', () => {
  it('fans out to both backends when no type is given', () => {
    expect(resolveGlobalSearchSources(undefined, 'ws-1')).toEqual({
      ftsType: undefined,
      includeFts: true,
      includeWork: true,
      workType: undefined,
    });
  });

  it('routes a work type to the work backend only', () => {
    expect(resolveGlobalSearchSources('task', 'ws-1')).toEqual({
      ftsType: undefined,
      includeFts: false,
      includeWork: true,
      workType: 'task',
    });
  });

  it('routes an FTS type to the FTS backend only', () => {
    expect(resolveGlobalSearchSources('message', 'ws-1')).toEqual({
      ftsType: 'message',
      includeFts: true,
      includeWork: false,
      workType: undefined,
    });
  });

  it('drops the team type entirely in personal scope', () => {
    expect(resolveGlobalSearchSources('team', null)).toEqual({
      ftsType: undefined,
      includeFts: false,
      includeWork: false,
      workType: 'team',
    });
  });

  it('still queries teams in a workspace', () => {
    expect(resolveGlobalSearchSources('team', 'ws-1').includeWork).toBe(true);
  });

  it('hits neither backend for an unknown type', () => {
    const sources = resolveGlobalSearchSources('bogus', 'ws-1');
    expect(sources.includeFts).toBe(false);
    expect(sources.includeWork).toBe(false);
  });
});

describe('globalSearchService.searchAll', () => {
  it('merges work results first, then FTS results', async () => {
    workSearch.mockResolvedValue({ data: [workRow('task', '1', 'Ship it')], success: true });
    ftsQuery.mockResolvedValue([ftsRow('agent', 'a-1', 'Helper')]);

    const { items, workFailed } = await globalSearchService.searchAll({
      query: 'ship',
      workspaceId: 'ws-1',
    });

    expect(workFailed).toBe(false);
    expect(items.map((item) => item.type)).toEqual(['task', 'agent']);
    expect(items[0].title).toBe('Ship it');
    expect(items[1].title).toBe('Helper');
  });

  it('trims the query and forwards routing inputs to both backends', async () => {
    await globalSearchService.searchAll({
      agentId: 'a-1',
      limitPerType: 8,
      locale: 'zh-CN',
      query: '  ship it  ',
      workspaceId: 'ws-1',
    });

    expect(workSearch).toHaveBeenCalledWith({
      limitPerType: 8,
      query: 'ship it',
      type: undefined,
    });
    expect(ftsQuery).toHaveBeenCalledWith({
      agentId: 'a-1',
      includeMarketplace: false,
      limitPerType: 8,
      locale: 'zh-CN',
      query: 'ship it',
      type: undefined,
    });
  });

  it('calls only the work backend for a work type filter', async () => {
    workSearch.mockResolvedValue({ data: [workRow('task', '1', 'Ship it')], success: true });

    const { items } = await globalSearchService.searchAll({
      query: 'ship',
      type: 'task',
      workspaceId: 'ws-1',
    });

    expect(ftsQuery).not.toHaveBeenCalled();
    expect(workSearch).toHaveBeenCalledWith({ limitPerType: 5, query: 'ship', type: 'task' });
    expect(items).toHaveLength(1);
  });

  it('calls only the FTS backend for an FTS type filter', async () => {
    ftsQuery.mockResolvedValue([ftsRow('message', 'm-1', 'hello')]);

    const { items } = await globalSearchService.searchAll({
      query: 'hello',
      type: 'message',
      workspaceId: 'ws-1',
    });

    expect(workSearch).not.toHaveBeenCalled();
    expect(ftsQuery).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'hello', type: 'message' }),
    );
    expect(items).toHaveLength(1);
  });

  it('queries neither backend for an unknown type', async () => {
    const { items } = await globalSearchService.searchAll({ query: 'x', type: 'bogus' });

    expect(workSearch).not.toHaveBeenCalled();
    expect(ftsQuery).not.toHaveBeenCalled();
    expect(items).toEqual([]);
  });

  it('skips both backends for an empty query', async () => {
    const { items, workFailed } = await globalSearchService.searchAll({ query: '   ' });

    expect(workSearch).not.toHaveBeenCalled();
    expect(ftsQuery).not.toHaveBeenCalled();
    expect(items).toEqual([]);
    expect(workFailed).toBe(false);
  });

  it('degrades to FTS-only results and flags workFailed when the work call throws', async () => {
    workSearch.mockRejectedValue(new Error('work boom'));
    ftsQuery.mockResolvedValue([ftsRow('agent', 'a-1', 'Helper')]);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { items, workFailed } = await globalSearchService.searchAll({
      query: 'x',
      workspaceId: 'ws-1',
    });

    expect(workFailed).toBe(true);
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('agent');
    consoleSpy.mockRestore();
  });

  it('rejects when the FTS backend fails — the caller owns the error state', async () => {
    ftsQuery.mockRejectedValue(new Error('fts boom'));

    await expect(
      globalSearchService.searchAll({ query: 'x', workspaceId: 'ws-1' }),
    ).rejects.toThrow('fts boom');
  });

  it('omits team rows in personal scope even if the backend returns them', async () => {
    workSearch.mockResolvedValue({
      data: [workRow('team', 'tm-1', 'Core'), workRow('task', '1', 'Ship')],
      success: true,
    });

    const { items } = await globalSearchService.searchAll({ query: 'x', workspaceId: null });

    expect(items.map((item) => item.type)).toEqual(['task']);
  });
});
