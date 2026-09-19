import { describe, expect, it } from 'vitest';

import {
  parseWorkQueryDraft,
  stringifyWorkQueryDraft,
  workQueryFromDraft,
} from './savedViewQueryDraft';

const assigned: Parameters<typeof stringifyWorkQueryDraft>[0] = {
  entityType: 'task',
  filter: { all: [{ field: 'assigneeUserId', op: 'eq', value: { ref: 'currentUser' } }] },
  schemaVersion: 1,
};

describe('parseWorkQueryDraft', () => {
  it('round-trips currentUser refs instead of baking in a user id', () => {
    const parsed = parseWorkQueryDraft(stringifyWorkQueryDraft(assigned));
    expect(parsed).toEqual({ ok: true, query: assigned });
  });

  it('rejects broken JSON and unknown schema instead of widening to every task', () => {
    expect(parseWorkQueryDraft('')).toEqual({ ok: false, reason: 'empty' });
    expect(parseWorkQueryDraft('{')).toEqual({ ok: false, reason: 'invalid_json' });
    expect(parseWorkQueryDraft(JSON.stringify({ entityType: 'task', schemaVersion: 2 }))).toEqual({
      ok: false,
      reason: 'invalid_query',
    });
  });
});

describe('workQueryFromDraft', () => {
  it('keeps the saved view entity type even if the draft tries to change it', () => {
    expect(
      workQueryFromDraft(JSON.stringify({ entityType: 'project', schemaVersion: 1 }), 'task'),
    ).toEqual({
      entityType: 'task',
      schemaVersion: 1,
    });
  });
});
