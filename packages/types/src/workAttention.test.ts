import { describe, expect, it } from 'vitest';

import {
  applyNoProjectFilter,
  classifyWorkAttentionActionUrl,
  NO_PROJECT_PREDICATE,
  normalizeWorkQuery,
  safeWorkAttentionActionUrl,
  type WorkQuery,
  workQueryFieldSpec,
  workQueryFieldSpecs,
} from './workAttention';

const assigned = (): WorkQuery => ({
  entityType: 'task',
  filter: { all: [{ field: 'assigneeUserId', op: 'eq', value: { ref: 'currentUser' } }] },
  schemaVersion: 1,
});

describe('applyNoProjectFilter', () => {
  it('adds projectId isNull without inventing a default projectId', () => {
    const next = applyNoProjectFilter(assigned(), true);
    expect(next.filter?.all).toContainEqual(NO_PROJECT_PREDICATE);
    expect(
      next.filter?.all?.some(
        (node) => 'field' in node && node.field === 'projectId' && node.op !== 'isNull',
      ),
    ).toBe(false);
  });

  it('is a no-op when disabled and the query has no project chip', () => {
    const query = assigned();
    expect(applyNoProjectFilter(query, false)).toEqual(query);
  });

  it('drops the chip without removing the rest of the filter', () => {
    const withChip = applyNoProjectFilter(assigned(), true);
    expect(applyNoProjectFilter(withChip, false)).toEqual(assigned());
  });
});

describe('classifyWorkAttentionActionUrl', () => {
  it('keeps same-app paths and allowlisted https, and fails closed otherwise', () => {
    expect(classifyWorkAttentionActionUrl('/inbox?tab=action')).toEqual({
      mode: 'internal',
      url: '/inbox?tab=action',
    });
    expect(classifyWorkAttentionActionUrl('https://github.com/org/repo/pull/1')).toEqual({
      mode: 'external',
      url: 'https://github.com/org/repo/pull/1',
    });
    expect(safeWorkAttentionActionUrl('javascript:alert(1)')).toBeNull();
    expect(safeWorkAttentionActionUrl('https://evil.example/phish')).toBeNull();
    expect(safeWorkAttentionActionUrl('//evil.example/phish')).toBeNull();
    expect(safeWorkAttentionActionUrl('/inbox\u0000/escape')).toBeNull();
    expect(safeWorkAttentionActionUrl('/inbox\\x')).toBeNull();
    expect(safeWorkAttentionActionUrl('https://user:pass@github.com/org/repo')).toBeNull();
    expect(safeWorkAttentionActionUrl('  /inbox  ')).toBe('/inbox');
  });
});

describe('workQueryFieldSpecs state fields', () => {
  it('offers workflowCategory as Status plus executionState, and marks legacy status deprecated', () => {
    const specs = workQueryFieldSpecs('task');
    expect(specs[0]?.field).toBe('workflowCategory');
    expect(workQueryFieldSpec('task', 'executionState')).toMatchObject({
      enumValues: expect.arrayContaining(['queued', 'running', 'succeeded', 'outcome_unknown']),
      valueKind: 'enum',
    });
    expect(workQueryFieldSpec('task', 'status')?.deprecated).toBe(true);
    expect(workQueryFieldSpec('task', 'workflowCategory')?.deprecated).toBeUndefined();
  });
});

describe('normalizeWorkQuery', () => {
  const v1 = (filter: WorkQuery['filter']): WorkQuery => ({
    entityType: 'task',
    filter,
    schemaVersion: 1,
  });

  it('migrates unambiguous status eq/neq onto workflowCategory', () => {
    const next = normalizeWorkQuery(
      v1({
        all: [
          { field: 'status', op: 'eq', value: 'completed' },
          { field: 'status', op: 'neq', value: 'backlog' },
          { field: 'status', op: 'eq', value: 'canceled' },
        ],
      }),
    );
    expect(next.schemaVersion).toBe(2);
    expect(next.filter?.all).toEqual([
      { field: 'workflowCategory', op: 'eq', value: 'done' },
      { field: 'workflowCategory', op: 'neq', value: 'backlog' },
      { field: 'workflowCategory', op: 'eq', value: 'canceled' },
    ]);
  });

  it('migrates execution-meaning statuses onto executionState', () => {
    const next = normalizeWorkQuery(
      v1({
        all: [
          { field: 'status', op: 'eq', value: 'running' },
          { field: 'status', op: 'eq', value: 'paused' },
          { field: 'status', op: 'eq', value: 'failed' },
          { field: 'status', op: 'eq', value: 'scheduled' },
        ],
      }),
    );
    expect(next.filter?.all).toEqual([
      { field: 'executionState', op: 'eq', value: 'running' },
      { field: 'executionState', op: 'eq', value: 'outcome_unknown' },
      { field: 'executionState', op: 'eq', value: 'failed' },
      { field: 'executionState', op: 'eq', value: 'queued' },
    ]);
  });

  it('splits a mixed status in-list into an OR across both layers, notIn into an AND', () => {
    const inNext = normalizeWorkQuery(
      v1({ all: [{ field: 'status', op: 'in', value: ['completed', 'running'] }] }),
    );
    expect(inNext.filter?.all).toEqual([
      {
        any: [
          { field: 'workflowCategory', op: 'in', value: ['done'] },
          { field: 'executionState', op: 'in', value: ['running'] },
        ],
      },
    ]);
    const notInNext = normalizeWorkQuery(
      v1({ all: [{ field: 'status', op: 'notIn', value: ['completed', 'running'] }] }),
    );
    expect(notInNext.filter?.all).toEqual([
      {
        all: [
          { field: 'workflowCategory', op: 'notIn', value: ['done'] },
          { field: 'executionState', op: 'notIn', value: ['running'] },
        ],
      },
    ]);
  });

  it('keeps an unmigratable member as the legacy read-only predicate', () => {
    const query = v1({ all: [{ field: 'status', op: 'in', value: ['completed', 'mystery'] }] });
    const next = normalizeWorkQuery(query);
    expect(next.schemaVersion).toBe(2);
    expect(next.filter).toEqual(query.filter);
  });

  it('migrates status predicates nested inside any/all groups', () => {
    const next = normalizeWorkQuery(
      v1({
        all: [
          { any: [{ field: 'status', op: 'eq', value: 'paused' }] },
          { all: [{ field: 'status', op: 'eq', value: 'running' }] },
        ],
      }),
    );
    expect(next.filter?.all).toEqual([
      { any: [{ field: 'executionState', op: 'eq', value: 'outcome_unknown' }] },
      { all: [{ field: 'executionState', op: 'eq', value: 'running' }] },
    ]);
  });

  it('leaves project queries alone — projects.status is a real field', () => {
    const query: WorkQuery = {
      entityType: 'project',
      filter: { all: [{ field: 'status', op: 'eq', value: 'paused' }] },
      schemaVersion: 1,
    };
    const next = normalizeWorkQuery(query);
    expect(next.schemaVersion).toBe(2);
    expect(next.filter).toEqual(query.filter);
  });

  it('is idempotent — a v2 query normalizes to itself', () => {
    const once = normalizeWorkQuery(
      v1({ all: [{ field: 'status', op: 'eq', value: 'completed' }] }),
    );
    expect(normalizeWorkQuery(once)).toEqual(once);
  });
});
