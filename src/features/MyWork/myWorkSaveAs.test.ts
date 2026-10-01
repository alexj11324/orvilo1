import { describe, expect, it } from 'vitest';

import { isMyWorkSaveableMode, myWorkSaveAsQuery } from './myWorkSaveAs';

describe('isMyWorkSaveableMode', () => {
  it('keeps subscribed and activity because the AST carries the membership predicate', () => {
    expect(isMyWorkSaveableMode('assigned')).toBe(true);
    expect(isMyWorkSaveableMode('created')).toBe(true);
    // subscribed/activity compile to the same EXISTS the mode path injects,
    // so a saved view keeps the tab instead of widening to every task.
    expect(isMyWorkSaveableMode('subscribed')).toBe(true);
    expect(isMyWorkSaveableMode('activity')).toBe(true);
    expect(myWorkSaveAsQuery('subscribed').filter).toEqual({
      all: [{ field: 'subscribed', op: 'eq', value: { ref: 'currentUser' } }],
    });
    expect(myWorkSaveAsQuery('activity').filter).toEqual({
      all: [{ field: 'hasActivity', op: 'eq', value: { ref: 'currentUser' } }],
    });
    expect(isMyWorkSaveableMode('delegated')).toBe(false);
    expect(isMyWorkSaveableMode('review')).toBe(false);
  });
});

describe('myWorkSaveAsQuery', () => {
  it('stores currentUser refs instead of a snapshot of the saver', () => {
    expect(myWorkSaveAsQuery('assigned').filter).toEqual({
      all: [{ field: 'assigneeUserId', op: 'eq', value: { ref: 'currentUser' } }],
    });
    expect(myWorkSaveAsQuery('created').filter).toEqual({
      all: [{ field: 'createdByUserId', op: 'eq', value: { ref: 'currentUser' } }],
    });
    // Created keeps its createdAt ordering when saved as a view (UI02).
    expect(myWorkSaveAsQuery('created').sort).toEqual([
      { direction: 'desc', field: 'createdAt' },
      { direction: 'asc', field: 'id' },
    ]);
    expect(myWorkSaveAsQuery('assigned', 'board').layout).toBe('board');
    expect(myWorkSaveAsQuery('assigned', 'board').groupBy).toBe('workflowCategory');
  });
});
