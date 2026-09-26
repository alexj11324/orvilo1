import { beforeEach, describe, expect, it, vi } from 'vitest';

import { workAttentionService } from '@/services/workAttention';

import { buildSavedViewCsv, fetchAllSavedViewRows, SAVED_VIEW_CSV_MAX_ROWS } from './savedViewCsv';

vi.mock('@/services/workAttention', () => ({
  workAttentionService: {
    savedViewEvaluate: vi.fn(),
  },
}));

const evaluate = vi.mocked(workAttentionService.savedViewEvaluate);

const page = (evaluation: unknown) => ({ data: { evaluation } }) as never;

describe('buildSavedViewCsv', () => {
  it('quotes every cell and escapes inner quotes', () => {
    const csv = buildSavedViewCsv('task', [
      {
        createdAt: '2024-01-02T03:04:05.000Z',
        id: 't1',
        identifier: 'ORV-1',
        name: 'Fix "the" bug, now',
        priority: 1,
        status: 'in_progress',
        updatedAt: null,
      },
    ]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('"ID","Identifier","Title","Status","Priority","Created","Updated"');
    expect(lines[1]).toBe(
      '"t1","ORV-1","Fix ""the"" bug, now","in_progress","1","2024-01-02T03:04:05.000Z",""',
    );
  });

  it('neutralizes formula-leading values so exports stay literal', () => {
    const csv = buildSavedViewCsv('task', [
      { id: '=1+1', identifier: '@SUM(1)', name: '=-2+3', status: '-safe' },
      { id: 't2', identifier: 'ORV-2', name: '\tcmd', status: '+ok' },
    ]);
    const lines = csv.split('\n');
    expect(lines[1]).toBe('"\'=1+1","\'@SUM(1)","\'=-2+3","\'-safe","","",""');
    expect(lines[2]).toBe('"t2","ORV-2","\'\tcmd","\'+ok","","",""');
  });

  it('uses the project column set for project views', () => {
    const csv = buildSavedViewCsv('project', [
      {
        createdAt: new Date('2024-05-06T00:00:00Z'),
        id: 'p1',
        identifier: 'PRJ-7',
        name: 'Launch',
        status: 'in-progress',
      },
    ]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('"ID","Identifier","Name","Status","Created","Updated"');
    expect(lines[1]).toBe('"p1","PRJ-7","Launch","in-progress","2024-05-06T00:00:00.000Z",""');
  });

  it('applies status and priority formatters', () => {
    const csv = buildSavedViewCsv(
      'task',
      [{ id: 't1', name: 'x', priority: 2, status: 'in_review' }],
      {
        priority: (value) => (value === 2 ? 'High' : String(value)),
        status: (value) => (value === 'in_review' ? 'In review' : (value ?? '')),
      },
    );
    const line = csv.split('\n')[1];
    expect(line).toContain('"In review"');
    expect(line).toContain('"High"');
  });
});

describe('fetchAllSavedViewRows', () => {
  beforeEach(() => {
    evaluate.mockReset();
  });

  it('drains a flat evaluation with afterId pagination', async () => {
    const rows = (start: number, count: number) =>
      Array.from({ length: count }, (_, i) => ({ id: `t${start + i}`, name: `row ${start + i}` }));
    evaluate
      .mockResolvedValueOnce(page({ queryHash: 'h1', tasks: rows(0, 3), total: 5 }))
      .mockResolvedValueOnce(page({ queryHash: 'h1', tasks: rows(3, 2), total: 5 }));

    const result = await fetchAllSavedViewRows('view-1');
    expect(result.truncated).toBe(false);
    expect(result.rows.map((row) => row.id)).toEqual(['t0', 't1', 't2', 't3', 't4']);
    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(evaluate).toHaveBeenNthCalledWith(2, {
      afterId: 't2',
      id: 'view-1',
      limit: 100,
      queryHash: 'h1',
    });
  });

  it('drains each group independently when the view is grouped', async () => {
    evaluate
      .mockResolvedValueOnce(
        page({
          groups: [
            { hasMore: true, key: 'todo', tasks: [{ id: 'a1' }] },
            { hasMore: false, key: 'done', tasks: [{ id: 'b1' }] },
          ],
          queryHash: 'h2',
          total: 3,
        }),
      )
      .mockResolvedValueOnce(
        page({
          groups: [
            { hasMore: false, key: 'todo', tasks: [{ id: 'a2' }] },
            { hasMore: true, key: 'done', tasks: [] },
          ],
          queryHash: 'h2',
          total: 3,
        }),
      );

    const result = await fetchAllSavedViewRows('view-2');
    expect(result.truncated).toBe(false);
    expect(result.rows.map((row) => row.id)).toEqual(['a1', 'a2', 'b1']);
    // Only the 'todo' group needed a second page — 'done' reported hasMore:false.
    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(evaluate).toHaveBeenNthCalledWith(2, {
      afterId: 'a1',
      groupKey: 'todo',
      id: 'view-2',
      limit: 100,
      queryHash: 'h2',
    });
  });

  it('dedupes rows that appear in both flat and grouped payloads', async () => {
    evaluate.mockResolvedValueOnce(
      page({
        groups: [{ hasMore: false, key: 'todo', tasks: [{ id: 'a1' }] }],
        queryHash: 'h3',
        tasks: [{ id: 'a1' }],
        total: 1,
      }),
    );
    const result = await fetchAllSavedViewRows('view-3');
    expect(result.truncated).toBe(false);
    expect(result.rows).toHaveLength(1);
  });

  it('respects the hard row cap', async () => {
    const rows = (offset: number) =>
      Array.from({ length: 100 }, (_, i) => ({ id: `t${offset + i}` }));
    evaluate.mockImplementation(async (input: { afterId?: string }) =>
      page({
        queryHash: 'h4',
        tasks: rows(input.afterId ? Number(input.afterId.slice(1)) + 100 : 0),
        total: SAVED_VIEW_CSV_MAX_ROWS + 500,
      }),
    );
    const result = await fetchAllSavedViewRows('view-4');
    expect(result.rows.length).toBeLessThanOrEqual(SAVED_VIEW_CSV_MAX_ROWS);
    expect(result.truncated).toBe(true);
  });
});
