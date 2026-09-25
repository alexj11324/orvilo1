import type { WorkQuery } from '@orvilo/types';
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
    expect(state.slots).toHaveLength(3);
    expect(state.any).toHaveLength(0);
    expect(state.rows).toHaveLength(3);
    const rebuilt = builderToFilter('task', state);
    expect(rebuilt).toEqual({ all: [...filter.all] });
  });

  it('keeps unknown fields, unsupported ops, and any-groups untouched', () => {
    const unknownPredicate = { field: 'delegatedByUserId', op: 'eq', value: 'x' };
    const anyGroup = { any: [{ field: 'status', op: 'eq', value: 'running' }] };
    const retainedOp = { field: 'reviewerUserId', op: 'neq', value: 'u2' };
    const state = filterToBuilder('task', {
      all: [unknownPredicate, retainedOp],
      any: anyGroup.any,
    } as never);
    expect(state.rows).toHaveLength(0);
    expect(state.slots).toEqual([
      { node: unknownPredicate, type: 'node' },
      { node: retainedOp, type: 'node' },
    ]);
    expect(state.any).toEqual(anyGroup.any);
    // The OR subtree stays under `any` — it must not be folded into `all`.
    expect(builderToFilter('task', state)).toEqual({
      all: [unknownPredicate, retainedOp],
      any: anyGroup.any,
    });
  });

  it('keeps a top-level any group under any after an edit round-trip (VW01)', () => {
    // "priority=Urgent OR assignee=me" — a rename-only save must not mutate
    // the boolean tree, and an unrelated row edit must not touch the `any`.
    const filter = {
      all: [{ field: 'status', op: 'eq', value: 'running' }],
      any: [
        { field: 'priority', op: 'eq', value: 3 },
        { field: 'assigneeUserId', op: 'eq', value: { ref: 'currentUser' } },
      ],
    } as const;
    const state = filterToBuilder('task', filter as never);
    expect(builderToFilter('task', state)).toEqual(filter);

    const edited = {
      ...state,
      rows: state.rows.map((row) => ({ ...row, value: 'paused' })),
    };
    expect(builderToFilter('task', edited)).toEqual({
      all: [{ field: 'status', op: 'eq', value: 'paused' }],
      any: [...filter.any],
    });
  });

  it('produces an identical AST for a rename-only edit so dirty stays false', () => {
    const query: WorkQuery = {
      entityType: 'task',
      filter: {
        all: [
          { any: [{ field: 'teamId', op: 'eq', value: 't1' }] },
          { field: 'status', op: 'eq', value: 'running' },
        ],
        any: [{ field: 'priority', op: 'eq', value: 3 }],
      },
      schemaVersion: 1,
    };
    const rebuilt = builderToFilter('task', filterToBuilder('task', query.filter));
    expect(rebuilt).toEqual(query.filter);
    expect(comparableQuery({ ...query, filter: rebuilt })).toBe(comparableQuery(query));
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
    expect(next).toEqual({ all: [retainedNode, { field: 'status', op: 'eq', value: 'running' }] });
  });

  it('project entity renders only project-registry fields', () => {
    const state = filterToBuilder('project', {
      all: [
        { field: 'status', op: 'eq', value: 'active' },
        { field: 'assigneeUserId', op: 'eq', value: 'u1' },
      ],
    } as never);
    expect(state.rows.map((row) => row.field)).toEqual(['status']);
    expect(state.slots).toEqual([
      { rowId: state.rows[0]!.id, type: 'row' },
      { node: { field: 'assigneeUserId', op: 'eq', value: 'u1' }, type: 'node' },
    ]);
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
