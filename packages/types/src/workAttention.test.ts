import { describe, expect, it } from 'vitest';

import {
  applyNoProjectFilter,
  classifyWorkAttentionActionUrl,
  NO_PROJECT_PREDICATE,
  safeWorkAttentionActionUrl,
  type WorkQuery,
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
