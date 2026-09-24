import { describe, expect, it } from 'vitest';

import {
  applyNoProjectFilter,
  applyShowTriageFilter,
  applyTriageViewDefault,
  classifyWorkAttentionActionUrl,
  NO_PROJECT_PREDICATE,
  safeWorkAttentionActionUrl,
  TRIAGE_EXCLUSION_FILTER,
  workQueryIncludesTriage,
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

describe('applyShowTriageFilter', () => {
  it('ANDs the NULL-inclusive triage exclusion when the option is off', () => {
    const next = applyShowTriageFilter(assigned(), false);
    // `triageStatus IS NULL OR triageStatus <> 'untriaged'` — NULL rows are
    // personal/legacy tasks that were never parked in triage; a bare `neq`
    // would drop them along with the queue.
    expect(next.filter?.all).toContainEqual(TRIAGE_EXCLUSION_FILTER);
    expect(next.filter?.all).toContainEqual({
      field: 'assigneeUserId',
      op: 'eq',
      value: { ref: 'currentUser' },
    });
  });

  it('keeps the query untouched when the option is on', () => {
    const query = assigned();
    expect(applyShowTriageFilter(query, true)).toEqual(query);
  });

  it('strips only the exclusion node when toggled back on', () => {
    const hidden = applyShowTriageFilter(assigned(), false);
    expect(applyShowTriageFilter(hidden, true)).toEqual(assigned());
    // A user-authored `any` group that happens to mention triageStatus is not
    // the display option's node and must survive the toggle.
    const userFilter: WorkQuery = {
      entityType: 'task',
      filter: {
        all: [
          {
            any: [
              { field: 'triageStatus', op: 'eq', value: 'declined' },
              { field: 'triageStatus', op: 'eq', value: 'duplicate' },
            ],
          },
        ],
      },
      schemaVersion: 1,
    };
    const toggled = applyShowTriageFilter(applyShowTriageFilter(userFilter, false), true);
    expect(toggled).toEqual(userFilter);
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
