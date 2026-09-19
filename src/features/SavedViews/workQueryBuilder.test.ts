import { describe, expect, it } from 'vitest';

import {
  builderToFilter,
  comparableQuery,
  filterToBuilder,
  isRowComplete,
} from './workQueryBuilder';

describe('workQueryBuilder', () => {
  it('round-trips registry predicates through rows', () => {
    const filter = {
      all: [
        { field: 'status', op: 'in', value: ['backlog', 'running'] },
        { field: 'assigneeUserId', op: 'eq', value: { ref: 'currentUser' } },
        { field: 'projectId', op: 'isNull' },
      ],
    } as const;
    const state = filterToBuilder('task', filter as never);
    expect(state.retained).toHaveLength(0);
    expect(state.rows).toHaveLength(3);
    const rebuilt = builderToFilter('task', state);
    expect(rebuilt).toEqual({ all: [...filter.all] });
  });

  it('keeps unknown fields, unsupported ops, and any-groups as retained nodes', () => {
    const unknownPredicate = { field: 'delegatedByUserId', op: 'eq', value: 'x' };
    const anyGroup = { any: [{ field: 'status', op: 'eq', value: 'running' }] };
    const retainedOp = { field: 'reviewerUserId', op: 'neq', value: 'u2' };
    const state = filterToBuilder('task', {
      all: [unknownPredicate, retainedOp],
      any: anyGroup.any,
    } as never);
    expect(state.rows).toHaveLength(0);
    expect(state.retained).toEqual([unknownPredicate, retainedOp, ...anyGroup.any]);
    expect(builderToFilter('task', state)).toEqual({
      all: [unknownPredicate, retainedOp, ...anyGroup.any],
    });
  });

  it('drops incomplete rows on save without touching retained nodes', () => {
    const retainedNode = { any: [{ field: 'teamId', op: 'eq', value: 't1' }] };
    const state = filterToBuilder('task', { all: [retainedNode] } as never);
    const next = builderToFilter('task', {
      ...state,
      rows: [
        { field: 'status', id: 'a', op: 'eq', value: undefined },
        { field: 'status', id: 'b', op: 'eq', value: 'running' },
      ],
    });
    expect(next).toEqual({ all: [{ field: 'status', op: 'eq', value: 'running' }, retainedNode] });
  });

  it('project entity renders only project-registry fields', () => {
    const state = filterToBuilder('project', {
      all: [
        { field: 'status', op: 'eq', value: 'active' },
        { field: 'assigneeUserId', op: 'eq', value: 'u1' },
      ],
    } as never);
    expect(state.rows.map((row) => row.field)).toEqual(['status']);
    expect(state.retained).toEqual([{ field: 'assigneeUserId', op: 'eq', value: 'u1' }]);
  });

  it('isRowComplete follows the op arity', () => {
    expect(isRowComplete({ field: 'status', id: '1', op: 'isNull' })).toBe(true);
    expect(isRowComplete({ field: 'status', id: '1', op: 'eq' })).toBe(false);
    expect(isRowComplete({ field: 'status', id: '1', op: 'in', value: [] })).toBe(false);
    expect(isRowComplete({ field: 'status', id: '1', op: 'in', value: ['backlog'] })).toBe(true);
  });

  it('comparableQuery ignores object key order and drops undefined', () => {
    const a = {
      entityType: 'task',
      filter: { all: [{ field: 'status', op: 'eq' }] },
      schemaVersion: 1,
    };
    const b = {
      schemaVersion: 1,
      filter: { all: [{ op: 'eq', field: 'status', value: undefined }] },
      entityType: 'task',
    };
    expect(comparableQuery(a as never)).toBe(comparableQuery(b as never));
  });
});
