// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { workQuerySchema } from '../workAttention';

describe('workQuerySchema', () => {
  it('keeps predicate field/op/value through top-level and nested groups (VW01)', () => {
    // Regression: the all/any node union must try the predicate schema first —
    // otherwise the all-optional filter object swallows every predicate and
    // zod key-stripping stores bare `{}` nodes, wiping filters on any save.
    const filter = {
      all: [
        { field: 'teamId', op: 'eq', value: 'team_alpha' },
        { any: [{ field: 'status', op: 'eq', value: 'running' }] },
      ],
      any: [
        { field: 'priority', op: 'eq', value: 3 },
        { field: 'assigneeUserId', op: 'eq', value: { ref: 'currentUser' } },
      ],
    } as const;

    const parsed = workQuerySchema.parse({
      entityType: 'task',
      filter,
      schemaVersion: 1,
    });

    expect(parsed.filter).toEqual(filter);
  });

  it('still accepts pure filter nodes and rejects unknown predicates', () => {
    expect(
      workQuerySchema.safeParse({
        entityType: 'task',
        filter: { all: [{ any: [{ all: [{ field: 'id', op: 'isNull' }] }] }] },
        schemaVersion: 1,
      }).success,
    ).toBe(true);

    expect(
      workQuerySchema.safeParse({
        entityType: 'task',
        filter: { all: [{ field: 'notARealField', op: 'eq', value: 'x' }] },
        schemaVersion: 1,
      }).success,
    ).toBe(false);
  });
});
