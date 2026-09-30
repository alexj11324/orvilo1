import { WORK_QUERY_TASK_FIELD_SPECS } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import type { BuilderState, FilterRow } from '@/features/SavedViews/workQueryBuilder';
import { builderToFilter } from '@/features/SavedViews/workQueryBuilder';

import {
  clearMyWorkDirectoryField,
  mergeWorkQueryFilters,
  MY_WORK_FILTER_DIRECTORY_FIELDS,
  myWorkActiveFilterCount,
  myWorkComposedQuery,
  myWorkDirectoryFieldActive,
  myWorkDirectoryNullaryActive,
  myWorkDirectorySelectedValues,
  toggleMyWorkDirectoryEnum,
  toggleMyWorkDirectoryMulti,
  toggleMyWorkDirectoryNullary,
  toggleMyWorkDirectoryValue,
  workQueryFilterHasPredicates,
} from './myWorkFilters';

const builderWith = (rows: FilterRow[]): BuilderState => ({ any: [], rows, slots: [] });

describe('myWorkComposedQuery', () => {
  it('expresses subscribed and activity as predicates the generic query can compile', () => {
    const subscribed = myWorkComposedQuery({
      delegated: false,
      groupBy: 'none',
      layout: 'list',
      mode: 'subscribed',
      noProject: false,
      ordering: 'default',
    });
    expect(subscribed?.filter?.all).toEqual([
      { field: 'subscribed', op: 'eq', value: { ref: 'currentUser' } },
    ]);
    const activity = myWorkComposedQuery({
      delegated: false,
      groupBy: 'none',
      layout: 'list',
      mode: 'activity',
      noProject: false,
      ordering: 'default',
    });
    expect(activity?.filter?.all).toEqual([
      { field: 'hasActivity', op: 'eq', value: { ref: 'currentUser' } },
    ]);
    expect(
      myWorkComposedQuery({
        delegated: false,
        groupBy: 'none',
        layout: 'list',
        mode: 'delegated',
        noProject: false,
        ordering: 'default',
      }),
    ).toBeNull();
  });

  it('puts a board lane and the completed window on the query', () => {
    const query = myWorkComposedQuery({
      completed: 'none',
      delegated: false,
      groupBy: 'workflowCategory',
      layout: 'board',
      mode: 'assigned',
      noProject: false,
      ordering: 'default',
      subGroupBy: 'priority',
    });
    expect(query?.groupBy).toBe('workflowCategory');
    expect(query?.subGroupBy).toBe('priority');
    expect(query?.filter?.all).toEqual([
      { field: 'assigneeUserId', op: 'eq', value: { ref: 'currentUser' } },
      { field: 'status', op: 'notIn', value: ['completed', 'canceled'] },
    ]);
    const conflict = myWorkComposedQuery({
      delegated: false,
      groupBy: 'workflowCategory',
      layout: 'board',
      mode: 'assigned',
      noProject: false,
      ordering: 'default',
      subGroupBy: 'status',
    });
    expect(conflict?.subGroupBy).toBeUndefined();
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
        { all: [{ field: 'teamId', op: 'eq', value: 'a' }] },
        { any: [{ field: 'status', op: 'eq', value: 'b' }] },
      ),
    ).toEqual({
      all: [{ field: 'teamId', op: 'eq', value: 'a' }],
      any: [{ field: 'status', op: 'eq', value: 'b' }],
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
    expect(workQueryFilterHasPredicates({ all: [{ field: 'teamId', op: 'eq', value: 'a' }] })).toBe(
      true,
    );
  });
});

describe('myWorkActiveFilterCount', () => {
  it('counts builder rows that produce predicates', () => {
    expect(myWorkActiveFilterCount({ any: [], rows: [], slots: [] })).toBe(0);
  });
});

describe('filter directory', () => {
  it('offers only fields the task field spec covers', () => {
    for (const field of MY_WORK_FILTER_DIRECTORY_FIELDS) {
      expect(WORK_QUERY_TASK_FIELD_SPECS.some((spec) => spec.field === field)).toBe(true);
    }
  });

  it('single-selects a scalar value through one eq row', () => {
    const picked = toggleMyWorkDirectoryValue(builderWith([]), 'projectId', 'p1');
    expect(myWorkDirectorySelectedValues(picked, 'projectId')).toEqual(['p1']);
    // Picking another value replaces the row; picking the selected one clears it.
    const swapped = toggleMyWorkDirectoryValue(picked, 'projectId', 'p2');
    expect(myWorkDirectorySelectedValues(swapped, 'projectId')).toEqual(['p2']);
    expect(swapped.rows).toHaveLength(1);
    const cleared = toggleMyWorkDirectoryValue(swapped, 'projectId', 'p2');
    expect(myWorkDirectoryFieldActive(cleared, 'projectId')).toBe(false);
  });

  it('treats the currentUser ref as a scalar pick', () => {
    const picked = toggleMyWorkDirectoryValue(builderWith([]), 'assigneeUserId', {
      ref: 'currentUser',
    });
    expect(myWorkDirectorySelectedValues(picked, 'assigneeUserId')).toEqual([
      { ref: 'currentUser' },
    ]);
    // Re-picking "me" clears — the ref comparison is structural.
    const cleared = toggleMyWorkDirectoryValue(picked, 'assigneeUserId', {
      ref: 'currentUser',
    });
    expect(myWorkDirectoryFieldActive(cleared, 'assigneeUserId')).toBe(false);
  });

  it('collects priority picks into one numeric in predicate', () => {
    const picked = toggleMyWorkDirectoryMulti(
      toggleMyWorkDirectoryMulti(builderWith([]), 'priority', 1),
      'priority',
      4,
    );
    expect(builderToFilter('task', picked)).toEqual({
      all: [{ field: 'priority', op: 'in', value: [1, 4] }],
    });
  });

  it('collects enum picks into a single in predicate', () => {
    const picked = toggleMyWorkDirectoryEnum(
      toggleMyWorkDirectoryEnum(builderWith([]), 'status', 'backlog'),
      'status',
      'running',
    );
    expect(myWorkDirectorySelectedValues(picked, 'status')).toEqual(['backlog', 'running']);
    expect(picked.rows).toHaveLength(1);
    // Removing both values drops the row entirely.
    const off = toggleMyWorkDirectoryEnum(
      toggleMyWorkDirectoryEnum(picked, 'status', 'backlog'),
      'status',
      'running',
    );
    expect(myWorkDirectoryFieldActive(off, 'status')).toBe(false);
  });

  it('compiles directory picks through builderToFilter', () => {
    const picked = toggleMyWorkDirectoryEnum(builderWith([]), 'status', 'backlog');
    expect(builderToFilter('task', picked)).toEqual({
      all: [{ field: 'status', op: 'in', value: ['backlog'] }],
    });
    const scalar = toggleMyWorkDirectoryValue(builderWith([]), 'priority', 1);
    expect(builderToFilter('task', scalar)).toEqual({
      all: [{ field: 'priority', op: 'eq', value: 1 }],
    });
  });

  it("makes nullary picks exclusive with the field's directory rows", () => {
    const withValue = toggleMyWorkDirectoryValue(builderWith([]), 'assigneeUserId', 'u1');
    const nulled = toggleMyWorkDirectoryNullary(withValue, 'assigneeUserId', 'isNull');
    expect(myWorkDirectoryNullaryActive(nulled, 'assigneeUserId', 'isNull')).toBe(true);
    expect(myWorkDirectorySelectedValues(nulled, 'assigneeUserId')).toEqual([]);
    const off = toggleMyWorkDirectoryNullary(nulled, 'assigneeUserId', 'isNull');
    expect(myWorkDirectoryFieldActive(off, 'assigneeUserId')).toBe(false);
  });

  it('keeps builder-authored non-directory rows through toggles and clears', () => {
    const authored: FilterRow = { field: 'status', id: 'r1', op: 'neq', value: 'canceled' };
    const toggled = toggleMyWorkDirectoryEnum(builderWith([authored]), 'status', 'backlog');
    expect(toggled.rows).toContain(authored);
    const cleared = clearMyWorkDirectoryField(toggled, 'status');
    // `neq` is not a directory op — the authored row survives the clear.
    expect(cleared.rows).toEqual([authored]);
    expect(myWorkDirectoryFieldActive(cleared, 'status')).toBe(true);
  });
});
