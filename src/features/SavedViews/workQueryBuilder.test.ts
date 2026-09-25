import type { WorkQuery } from '@orvilo/types';
import {
  WORK_QUERY_PROJECT_FIELD_SPECS,
  WORK_QUERY_TASK_FIELD_SPECS,
  workQueryFieldSpec,
} from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import {
  builderToFilter,
  comparableQuery,
  defaultRowValue,
  filterToBuilder,
  isRowComplete,
  newFilterRow,
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

  it('newFilterRow seeds the first registry field and op per entity', () => {
    const taskRow = newFilterRow('task');
    expect(taskRow.field).toBe(WORK_QUERY_TASK_FIELD_SPECS[0]!.field);
    expect(taskRow.op).toBe(WORK_QUERY_TASK_FIELD_SPECS[0]!.ops[0]);
    expect(taskRow.value).toBeUndefined();

    const projectRow = newFilterRow('project');
    expect(projectRow.field).toBe(WORK_QUERY_PROJECT_FIELD_SPECS[0]!.field);
    expect(projectRow.op).toBe(WORK_QUERY_PROJECT_FIELD_SPECS[0]!.ops[0]);
    // ids are unique across calls — React keys must never collide.
    expect(taskRow.id).not.toBe(projectRow.id);
  });

  it('defaultRowValue pre-fills currentUser only for user-kind specs', () => {
    expect(defaultRowValue(workQueryFieldSpec('task', 'assigneeUserId')!)).toEqual({
      ref: 'currentUser',
    });
    expect(defaultRowValue(workQueryFieldSpec('task', 'status')!)).toBeUndefined();
    expect(defaultRowValue(workQueryFieldSpec('project', 'teamId')!)).toBeUndefined();
  });

  it('builderToFilter returns undefined when nothing survives serialization', () => {
    expect(builderToFilter('task', { any: [], rows: [], slots: [] })).toBeUndefined();
    // A row left untouched after "Add filter" drops out — the saved query
    // carries no filter key at all rather than a half-built predicate.
    expect(
      builderToFilter('task', {
        any: [],
        rows: [{ field: 'status', id: 'x', op: 'eq' }],
        slots: [],
      }),
    ).toBeUndefined();
  });

  it('appends new rows after preserved slots in row order', () => {
    const retainedNode = { any: [{ field: 'teamId', op: 'eq', value: 't1' }] };
    const state = filterToBuilder('task', { all: [retainedNode] } as never);
    const next = builderToFilter('task', {
      ...state,
      rows: [
        { field: 'priority', id: 'r1', op: 'eq', value: 3 },
        { field: 'projectId', id: 'r2', op: 'isNull' },
      ],
    });
    expect(next).toEqual({
      all: [
        retainedNode,
        { field: 'priority', op: 'eq', value: 3 },
        { field: 'projectId', op: 'isNull' },
      ],
    });
  });

  it('keeps an in/notIn predicate with non-string members as a locked node', () => {
    const mixedIn = { field: 'priority', op: 'in', value: ['a', 2] };
    const state = filterToBuilder('task', { all: [mixedIn] } as never);
    expect(state.rows).toHaveLength(0);
    expect(state.slots).toEqual([{ node: mixedIn, type: 'node' }]);
    expect(builderToFilter('task', state)).toEqual({ all: [mixedIn] });
  });
});
