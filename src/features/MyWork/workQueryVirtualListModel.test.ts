import { WORK_QUERY_BOARD_KEY_SEP } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import { myWorkPriorityGroupRank } from './myWorkDisplay';
import {
  flattenWorkQueryVirtualItems,
  nestWorkQueryListGroups,
  stickyVirtualSections,
} from './workQueryVirtualListModel';

const task = (id: string) => ({ id, identifier: id, parentTaskId: null }) as never;

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
