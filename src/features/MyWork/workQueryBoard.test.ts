import type { TaskListItem } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import { isMyWorkBoardMode, workQueryBoardGroups } from './workQueryBoard';
import type { WorkQueryResultTask } from './workQueryPaging';

describe('isMyWorkBoardMode', () => {
  it('offers a board only on assigned and delegated', () => {
    expect(isMyWorkBoardMode('assigned')).toBe(true);
    expect(isMyWorkBoardMode('delegated')).toBe(true);
    expect(isMyWorkBoardMode('review')).toBe(false);
  });
});

const task = (over: Partial<TaskListItem> = {}): WorkQueryResultTask =>
  ({ id: 'tsk_1', identifier: 'T-1', status: 'backlog', ...over }) as WorkQueryResultTask;

describe('workQueryBoardGroups', () => {
  it('merges raw-status groups into the shared board columns', () => {
    // paused + failed both land in needsInput; completed lands in done.
    const groups = workQueryBoardGroups(
      [
        { hasMore: false, key: 'paused', tasks: [task({ id: 'a' })], total: 1 },
        { hasMore: true, key: 'failed', tasks: [task({ id: 'b' })], total: 2 },
        { hasMore: false, key: 'completed', tasks: [task({ id: 'c' })], total: 1 },
      ],
      'status',
    );

    expect(groups).toHaveLength(2);
    const needsInput = groups.find((group) => group.key === 'needsInput');
    expect(needsInput?.tasks.map((item) => item.id)).toEqual(['a', 'b']);
    expect(needsInput?.total).toBe(3);
    expect(needsInput?.hasMore).toBe(true);
    expect(groups.find((group) => group.key === 'done')?.total).toBe(1);
  });

  it('maps workflow-category keys by name', () => {
    const groups = workQueryBoardGroups(
      [{ hasMore: false, key: 'in_review', tasks: [task()], total: 1 }],
      'workflowCategory',
    );

    expect(groups.map((group) => group.key)).toEqual(['needsInput']);
  });

  it('drops columns the board does not know and survives empty input', () => {
    expect(
      workQueryBoardGroups([{ hasMore: false, key: 'bogus', tasks: [task()], total: 1 }], 'status'),
    ).toEqual([]);
    expect(workQueryBoardGroups(undefined, 'status')).toEqual([]);
  });
});
