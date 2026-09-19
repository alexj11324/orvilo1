import { describe, expect, it } from 'vitest';

import { isMyWorkSaveableMode, myWorkSaveAsQuery } from './myWorkSaveAs';

describe('isMyWorkSaveableMode', () => {
  it('refuses subscribed so a save-as cannot widen to every task', () => {
    expect(isMyWorkSaveableMode('assigned')).toBe(true);
    expect(isMyWorkSaveableMode('subscribed')).toBe(false);
  });
});

describe('myWorkSaveAsQuery', () => {
  it('stores currentUser refs instead of a snapshot of the saver', () => {
    expect(myWorkSaveAsQuery('assigned').filter).toEqual({
      all: [{ field: 'assigneeUserId', op: 'eq', value: { ref: 'currentUser' } }],
    });
    expect(myWorkSaveAsQuery('review').filter).toEqual({
      all: [{ field: 'reviewerUserId', op: 'eq', value: { ref: 'currentUser' } }],
    });
    expect(myWorkSaveAsQuery('assigned', 'board').layout).toBe('board');
    expect(myWorkSaveAsQuery('assigned', 'board').groupBy).toBe('workflowCategory');
  });
});
