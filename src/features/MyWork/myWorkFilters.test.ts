import { describe, expect, it } from 'vitest';

import {
  mergeWorkQueryFilters,
  myWorkActiveFilterCount,
  myWorkComposedQuery,
  workQueryFilterHasPredicates,
} from './myWorkFilters';

describe('myWorkComposedQuery', () => {
  it('returns null for modes the generic query endpoint cannot express', () => {
    for (const mode of ['subscribed', 'activity'] as const) {
      expect(
        myWorkComposedQuery({
          delegated: false,
          groupBy: 'none',
          layout: 'list',
          mode,
          noProject: false,
          ordering: 'default',
        }),
      ).toBeNull();
    }
  });

  it('keeps the mode predicate and AND-merges builder predicates', () => {
    const query = myWorkComposedQuery({
      delegated: false,
      filter: { all: [{ field: 'priority', op: 'eq', value: 1 }] },
      groupBy: 'none',
      layout: 'list',
      mode: 'assigned',
      noProject: false,
      ordering: 'default',
    });
    expect(query).not.toBeNull();
    expect(query?.filter?.all).toEqual([
      { field: 'assigneeUserId', op: 'eq', value: { ref: 'currentUser' } },
      { field: 'priority', op: 'eq', value: 1 },
    ]);
  });

  it('carries the resolved list grouping and display ordering', () => {
    const query = myWorkComposedQuery({
      delegated: false,
      groupBy: 'attention',
      layout: 'list',
      mode: 'assigned',
      noProject: false,
      ordering: 'createdAsc',
    });
    expect(query?.groupBy).toBe('attention');
    expect(query?.sort).toEqual([
      { direction: 'asc', field: 'createdAt' },
      { direction: 'asc', field: 'id' },
    ]);
  });

  it('keeps the mode sort when ordering is default', () => {
    const query = myWorkComposedQuery({
      delegated: false,
      groupBy: 'none',
      layout: 'list',
      mode: 'created',
      noProject: false,
      ordering: 'default',
    });
    expect(query?.sort).toEqual([
      { direction: 'desc', field: 'createdAt' },
      { direction: 'asc', field: 'id' },
    ]);
  });
});

describe('mergeWorkQueryFilters', () => {
  it('merges all/any sides independently', () => {
    expect(
      mergeWorkQueryFilters(
        { all: [{ field: 'a', op: 'eq', value: 1 }] },
        { any: [{ field: 'b', op: 'eq', value: 2 }] },
      ),
    ).toEqual({
      all: [{ field: 'a', op: 'eq', value: 1 }],
      any: [{ field: 'b', op: 'eq', value: 2 }],
    });
  });

  it('returns undefined when both sides are empty', () => {
    expect(mergeWorkQueryFilters(undefined, { all: [] })).toBeUndefined();
  });
});

describe('workQueryFilterHasPredicates', () => {
  it('treats missing and empty filters as inactive', () => {
    expect(workQueryFilterHasPredicates(undefined)).toBe(false);
    expect(workQueryFilterHasPredicates({ all: [] })).toBe(false);
    expect(workQueryFilterHasPredicates({ all: [{ field: 'a', op: 'eq', value: 1 }] })).toBe(true);
  });
});

describe('myWorkActiveFilterCount', () => {
  it('counts builder rows that produce predicates', () => {
    expect(myWorkActiveFilterCount({ any: [], rows: [], slots: [] })).toBe(0);
  });
});
