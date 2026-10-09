import { WORK_QUERY_BOARD_KEY_SEP } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import { myWorkPriorityGroupRank } from './myWorkDisplay';
import type { WorkQueryResultTask } from './workQueryPaging';
import {
  flattenWorkQueryVirtualItems,
  groupHidesIssue,
  indexWorkQueryVirtualTasks,
  nestWorkQueryListGroups,
  stickyFlatKeys,
  stickyVirtualSections,
  workQueryVirtualPeekRows,
} from './workQueryVirtualListModel';

const task = (id: string): WorkQueryResultTask =>
  ({ id, identifier: id, parentTaskId: null }) as WorkQueryResultTask;

describe('nestWorkQueryListGroups', () => {
  it('keeps a primary group and drops an empty one', () => {
    const nested = nestWorkQueryListGroups(
      [
        { hasMore: true, key: 'todo', tasks: [task('a')], total: 4 },
        { hasMore: false, key: 'done', tasks: [], total: 0 },
      ],
      false,
    );
    expect(nested).toEqual([
      { children: [], hasMore: true, key: 'todo', tasks: [task('a')], total: 4 },
    ]);
  });

  it('nests composite keys and sums the parent total from its children', () => {
    const sep = WORK_QUERY_BOARD_KEY_SEP;
    const nested = nestWorkQueryListGroups(
      [
        { hasMore: false, key: `todo${sep}1`, tasks: [task('a')], total: 2 },
        { hasMore: true, key: `todo${sep}2`, tasks: [task('b')], total: 3 },
        { hasMore: false, key: 'backlog', tasks: [], total: 0 },
      ],
      true,
    );
    expect(nested).toHaveLength(1);
    expect(nested[0]?.key).toBe('todo');
    expect(nested[0]?.total).toBe(5);
    expect(nested[0]?.children.map((child) => child.key)).toEqual(['1', '2']);
  });
});

describe('flattenWorkQueryVirtualItems', () => {
  it('drops rows under a collapsed group and records the visible order', () => {
    const groups = nestWorkQueryListGroups(
      [
        { hasMore: true, key: 'todo', tasks: [task('a'), task('b')], total: 4 },
        { hasMore: false, key: 'done', tasks: [task('c')], total: 1 },
      ],
      false,
    );
    const open = flattenWorkQueryVirtualItems({
      allTasks: [task('a'), task('b'), task('c')],
      collapsed: new Set(['todo']),
      groups,
      nestRows: false,
      primaryAxis: 'status',
    });
    expect(open.items.map((item) => item.kind)).toEqual(['header', 'header', 'row']);
    expect(open.orderedIds).toEqual(['c']);
    expect(open.items.some((item) => item.kind === 'loadMore')).toBe(false);
  });

  it('orders activity groups by recency rank', () => {
    const groups = nestWorkQueryListGroups(
      [
        { key: 'week:1', tasks: [task('old')], total: 1 },
        { key: 'day:0', tasks: [task('now')], total: 1 },
      ],
      false,
    );
    const flat = flattenWorkQueryVirtualItems({
      allTasks: [task('old'), task('now')],
      collapsed: new Set(),
      groups,
      nestRows: false,
      primaryAxis: 'activityDate',
      rankOf: (key) => (key === 'day:0' ? 0 : 7),
    });
    expect(
      flat.items.filter((item) => item.kind === 'header').map((item) => item.labelKey),
    ).toEqual(['day:0', 'week:1']);
  });

  it('orders priority headers urgent-first and assignee lanes by name', () => {
    const priority = nestWorkQueryListGroups(
      [
        { key: '0', tasks: [task('none')], total: 1 },
        { key: '4', tasks: [task('low')], total: 1 },
        { key: '1', tasks: [task('urgent')], total: 1 },
      ],
      false,
    );
    const priorityFlat = flattenWorkQueryVirtualItems({
      allTasks: [task('none'), task('low'), task('urgent')],
      collapsed: new Set(),
      groups: priority,
      nestRows: false,
      primaryAxis: 'priority',
      rankOf: (key) => myWorkPriorityGroupRank(key),
    });
    expect(
      priorityFlat.items.filter((item) => item.kind === 'header').map((item) => item.labelKey),
    ).toEqual(['1', '4', '0']);

    const sep = WORK_QUERY_BOARD_KEY_SEP;
    const lanes = nestWorkQueryListGroups(
      [
        { key: `todo${sep}b`, tasks: [task('b')], total: 1 },
        { key: `todo${sep}none`, tasks: [task('n')], total: 1 },
        { key: `todo${sep}a`, tasks: [task('a')], total: 1 },
      ],
      true,
    );
    const names: Record<string, string> = { a: 'Ada', b: 'Bea', none: 'Unassigned' };
    const laneFlat = flattenWorkQueryVirtualItems({
      allTasks: [task('a'), task('b'), task('n')],
      collapsed: new Set(),
      groups: lanes,
      laneRankOf: (key) => (key === 'none' ? Number.MAX_SAFE_INTEGER : 0),
      laneTitleOf: (key) => names[key] ?? key,
      nestRows: false,
      primaryAxis: 'status',
    });
    expect(laneFlat.items.filter((item) => item.depth === 1).map((item) => item.labelKey)).toEqual([
      'a',
      'b',
      'none',
    ]);
  });
});

describe('stickyVirtualSections', () => {
  it('keeps a collapsed header as an empty sticky group', () => {
    const groups = nestWorkQueryListGroups(
      [{ hasMore: true, key: 'todo', tasks: [task('a')], total: 2 }],
      false,
    );
    const flat = flattenWorkQueryVirtualItems({
      allTasks: [task('a')],
      collapsed: new Set(['todo']),
      groups,
      nestRows: false,
      primaryAxis: 'status',
    });
    const sections = stickyVirtualSections(flat.items);
    expect(sections?.groupCounts).toEqual([0]);
    expect(sections?.headers.map((stack) => stack.map((header) => header.labelKey))).toEqual([
      ['todo'],
    ]);
    expect(sections?.items).toEqual([]);
  });

  it('sticks the parent header with each lane and leaves rows in the group', () => {
    const sep = WORK_QUERY_BOARD_KEY_SEP;
    const groups = nestWorkQueryListGroups(
      [
        { hasMore: false, key: `todo${sep}a`, tasks: [task('a')], total: 1 },
        { hasMore: true, key: `todo${sep}b`, tasks: [task('b')], total: 2 },
      ],
      true,
    );
    const flat = flattenWorkQueryVirtualItems({
      allTasks: [task('a'), task('b')],
      collapsed: new Set(),
      groups,
      laneAxis: 'assignee',
      nestRows: false,
      primaryAxis: 'status',
    });
    const sections = stickyVirtualSections(flat.items);
    expect(sections?.headers.map((stack) => stack.map((header) => header.depth))).toEqual([
      [0, 1],
      [0, 1],
    ]);
    expect(sections?.items.every((item) => item.kind !== 'header')).toBe(true);
    expect(sections?.groupCounts).toEqual([1, 2]);
  });
});

describe('workQueryVirtualPeekRows', () => {
  const rowItem = (taskId: string, key = `row:${taskId}`, parentContext = false) =>
    ({ key, kind: 'row', parentContext, taskId }) as never;
  const header = { kind: 'header' } as never;
  const taskById = new Map([
    ['a', { id: 'a', identifier: 'T-1' }],
    ['b', { id: 'b', identifier: 'T-2' }],
  ]) as never;

  it('lists row keys in window order with identifier and window index', () => {
    const { idOf, ids, indexOf } = workQueryVirtualPeekRows(
      [header, rowItem('a'), header, rowItem('b')],
      taskById,
    );
    expect(ids).toEqual(['row:a', 'row:b']);
    expect(idOf.get('row:b')).toBe('T-2');
    expect(indexOf.get('row:a')).toBe(1);
    expect(indexOf.get('row:b')).toBe(3);
  });

  it('skips parent-context repeats, load-more rows and unresolved tasks', () => {
    const { ids } = workQueryVirtualPeekRows(
      [rowItem('a', 'ctx', true), { kind: 'loadMore' } as never, rowItem('missing'), rowItem('b')],
      taskById,
    );
    expect(ids).toEqual(['row:b']);
  });

  it('keeps an Issue listed in two sections as two rows with distinct positions', () => {
    const { idOf, ids, indexOf } = workQueryVirtualPeekRows(
      [header, rowItem('a', 'x:row:a'), rowItem('b', 'x:row:b'), header, rowItem('a', 'y:row:a')],
      taskById,
    );
    expect(ids).toEqual(['x:row:a', 'x:row:b', 'y:row:a']);
    expect(idOf.get('y:row:a')).toBe('T-1');
    expect(indexOf.get('y:row:a')).toBe(4);
  });

  it('orders group headers (by collapse key) between the rows they own', () => {
    const headerOf = (collapseKey: string) => ({ collapseKey, kind: 'header' }) as never;
    const { order } = workQueryVirtualPeekRows(
      [headerOf('g1'), rowItem('a', 'g1:row:a'), headerOf('g2'), rowItem('a', 'ctx', true)],
      taskById,
    );
    expect(order).toEqual([
      { key: 'g1', kind: 'header' },
      { key: 'g1:row:a', kind: 'row' },
      { key: 'g2', kind: 'header' },
    ]);
  });

  it('contributes no rows for a collapsed section', () => {
    const { items } = flattenWorkQueryVirtualItems({
      allTasks: [],
      collapsed: new Set(['blocking']),
      groups: [
        { children: [], hasMore: false, key: 'urgent', tasks: [task('a')], total: 1 },
        { children: [], hasMore: false, key: 'blocking', tasks: [task('b')], total: 1 },
      ],
      nestRows: false,
      primaryAxis: 'attention',
    });
    const { ids } = workQueryVirtualPeekRows(items, taskById);
    expect(ids).toEqual(['urgent:row:a']);
  });
});

describe('collapsing a later group (peek layout)', () => {
  const rows = (prefix: string, count: number) =>
    Array.from({ length: count }, (_, index) => task(`${prefix}${index + 1}`));
  const groups = [
    { children: [], hasMore: false, key: 'urgent', tasks: rows('u', 6), total: 6 },
    { children: [], hasMore: false, key: 'blocking', tasks: rows('b', 3), total: 3 },
    { children: [], hasMore: false, key: 'rest', tasks: rows('r', 2), total: 2 },
  ];
  const flatten = (collapsed: string[]) =>
    flattenWorkQueryVirtualItems({
      allTasks: [],
      collapsed: new Set(collapsed),
      groups,
      nestRows: false,
      primaryAxis: 'attention',
    }).items;
  const build = (collapsed: string[]) => stickyVirtualSections(flatten(collapsed))!;
  const byId = new Map(groups.flatMap((group) => group.tasks).map((item) => [item.id, item]));

  it('leaves earlier rows alone and gives the collapsed group zero rows', () => {
    const open = build([]);
    const closed = build(['blocking']);
    expect(closed.groupCounts).toEqual([6, 0, 2]);
    expect(closed.items.slice(0, 6)).toEqual(open.items.slice(0, 6));
    expect(closed.items.map((item) => item.taskId)).toEqual([
      ...rows('u', 6).map((item) => item.id),
      'r1',
      'r2',
    ]);
  });

  it('keeps peek rows equal to the rows the window lays out', () => {
    const closed = build(['blocking']);
    const { ids } = workQueryVirtualPeekRows(closed.items, byId);
    expect(ids).toEqual(closed.items.map((item) => item.key));
    expect(ids.some((key) => key.startsWith('blocking:'))).toBe(false);
  });

  it('keys every flat slot: group slots and rows, headers counted', () => {
    const closed = build(['blocking']);
    const keys = stickyFlatKeys(closed);
    expect(keys).toHaveLength(closed.groupCounts.reduce((sum, count) => sum + count + 1, 0));
    expect(new Set(keys).size).toBe(keys.length);
    // Slot 7 is the collapsed group's own slot, 8 the next group's, 9 its first row.
    expect(keys[0]).toMatch(/^group:0:/);
    expect(keys[1]).toBe('urgent:row:u1');
    expect(keys[7]).toMatch(/^group:1:header:blocking/);
    expect(keys[8]).toMatch(/^group:2:/);
    expect(keys[9]).toBe('rest:row:r1');
  });

  it('knows which collapse hides the peeked Issue', () => {
    const items = flatten([]);
    expect(groupHidesIssue(items, byId, 'blocking', 'b2')).toBe(true);
    expect(groupHidesIssue(items, byId, 'blocking', 'u1')).toBe(false);
    expect(groupHidesIssue(items, byId, 'blocking', null)).toBe(false);
  });

  it('a lane collapse and its parent both hide a lane row', () => {
    const sep = WORK_QUERY_BOARD_KEY_SEP;
    const nested = nestWorkQueryListGroups(
      [
        { key: `todo${sep}me`, tasks: [task('a')], total: 1 },
        { key: `todo${sep}you`, tasks: [task('c')], total: 1 },
      ],
      true,
    );
    const { items } = flattenWorkQueryVirtualItems({
      allTasks: [],
      collapsed: new Set(),
      groups: nested,
      laneAxis: 'assignee',
      nestRows: false,
      primaryAxis: 'status',
    });
    const index = new Map([task('a'), task('c')].map((item) => [item.id, item]));
    expect(groupHidesIssue(items, index, 'todo', 'a')).toBe(true);
    expect(groupHidesIssue(items, index, `todo${sep}me`, 'a')).toBe(true);
    expect(groupHidesIssue(items, index, `todo${sep}me`, 'c')).toBe(false);
  });
});

describe('indexWorkQueryVirtualTasks', () => {
  it('resolves grouped-page tasks that the flat lists do not carry', () => {
    const grouped = [task('a'), task('b')];
    const index = indexWorkQueryVirtualTasks([[], [], grouped]);
    expect([...index.keys()]).toEqual(['a', 'b']);
  });

  it('prefers the later source when a task appears twice', () => {
    const first = { id: 'a', identifier: 'OLD' } as never;
    const second = { id: 'a', identifier: 'NEW' } as never;
    expect(indexWorkQueryVirtualTasks([[first], [second]]).get('a')).toBe(second);
  });
});
