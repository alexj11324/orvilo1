import { WORK_QUERY_BOARD_KEY_SEP } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import {
  flattenWorkQueryVirtualItems,
  nestWorkQueryListGroups,
} from './workQueryVirtualList';

const task = (id: string) =>
  ({ id, identifier: id, parentTaskId: null }) as never;

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
    expect(flat.items.filter((item) => item.kind === 'header').map((item) => item.labelKey)).toEqual(
      ['day:0', 'week:1'],
    );
  });
});
