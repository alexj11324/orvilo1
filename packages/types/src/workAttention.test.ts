import { describe, expect, it } from 'vitest';

import { applyNoProjectFilter, NO_PROJECT_PREDICATE, type WorkQuery } from './workAttention';

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
