import { describe, expect, it } from 'vitest';

import { isMyWorkSaveableMode, myWorkSaveAsQuery } from './myWorkSaveAs';

describe('isMyWorkSaveableMode', () => {
  it('refuses subscribed, activity and the retired modes', () => {
    expect(isMyWorkSaveableMode('assigned')).toBe(true);
    expect(isMyWorkSaveableMode('created')).toBe(true);
    // subscribed/activity resolve through mode-injected EXISTS clauses — a bare
    // AST save-as would silently widen them to every task.
    expect(isMyWorkSaveableMode('subscribed')).toBe(false);
    expect(isMyWorkSaveableMode('activity')).toBe(false);
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
    expect(myWorkSaveAsQuery('assigned', 'board').layout).toBe('board');
    expect(myWorkSaveAsQuery('assigned', 'board').groupBy).toBe('workflowCategory');
  });
});
