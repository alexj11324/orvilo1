import type { TaskListItem } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import { STATUS_KANBAN_COLUMNS } from '@/features/AgentTasks/AgentTaskList/kanbanBoardModel';

import {
  cascadeStatusForBoardKey,
  isMyWorkBoardMode,
  workQueryBoardGroups,
  workQueryListGroupBy,
  workQueryListGroups,
  workQueryMovePlan,
  workQuerySourceKeysForKanbanColumn,
  workQueryTargetKeyFromKanbanColumn,
  workQueryTaskColumnKey,
} from './workQueryBoard';
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

const boardTask = {
  domainRevision: 3,
  id: 'tsk_1',
  identifier: 'T-1',
  status: 'backlog',
  teamId: 'team_1',
  workflowCategory: 'todo',
  workflowStateId: null as string | null,
};

const column = (key: string) => {
  const found = STATUS_KANBAN_COLUMNS.find((item) => item.key === key);
  if (!found) throw new Error(`missing column ${key}`);
  return found;
};

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
    // TaskGroupItem (groupList) requires the loaded window; KanbanBoard's
    // external path pages via onLoadMoreGroup, but the object still has to
    // type-check (Push Typecheck 2cd067ae failed without these).
    expect(needsInput?.limit).toBe(2);
    expect(needsInput?.offset).toBe(0);
    expect(groups.find((group) => group.key === 'done')?.total).toBe(1);
    expect(groups.find((group) => group.key === 'done')?.limit).toBe(1);
    expect(groups.find((group) => group.key === 'done')?.offset).toBe(0);
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

describe('workQueryTargetKeyFromKanbanColumn', () => {
  it('maps Cordy columns onto work-query workflow keys', () => {
    expect(workQueryTargetKeyFromKanbanColumn('workflowCategory', column('needsInput'))).toBe(
      'in_review',
    );
    expect(workQueryTargetKeyFromKanbanColumn('workflowCategory', column('running'))).toBe(
      'in_progress',
    );
    expect(workQueryTargetKeyFromKanbanColumn('workflowCategory', column('done'))).toBe('done');
  });

  it('uses the representative status for merged Cordy columns', () => {
    expect(workQueryTargetKeyFromKanbanColumn('status', column('needsInput'))).toBe('paused');
    expect(workQueryTargetKeyFromKanbanColumn('status', column('running'))).toBe('running');
    expect(workQueryTargetKeyFromKanbanColumn('status', column('done'))).toBe('completed');
    expect(workQueryTargetKeyFromKanbanColumn('status', column('todo'))).toBeNull();
  });
});

describe('workQuerySourceKeysForKanbanColumn', () => {
  it('reverses merged columns so load-more talks in work-query group keys', () => {
    expect(workQuerySourceKeysForKanbanColumn('workflowCategory', 'needsInput')).toEqual([
      'in_review',
    ]);
    expect(workQuerySourceKeysForKanbanColumn('status', 'needsInput')).toEqual([
      'failed',
      'paused',
    ]);
    expect(workQuerySourceKeysForKanbanColumn('status', 'running')).toEqual([
      'running',
      'scheduled',
    ]);
  });
});

describe('workQueryMovePlan', () => {
  it('sends Linear-linked category moves through the versioned board command', () => {
    expect(
      workQueryMovePlan({
        groupBy: 'workflowCategory',
        targetKey: 'in_review',
        task: { ...boardTask, workflowStateId: 'state-1' },
      }),
    ).toEqual({
      expectedDomainRevision: 3,
      groupBy: 'workflowCategory',
      targetKey: 'in_review',
      type: 'local',
    });
  });

  it('does not cascade Linear-linked Done drops so the exact state can be chosen', () => {
    expect(
      workQueryMovePlan({
        groupBy: 'workflowCategory',
        targetKey: 'done',
        task: { ...boardTask, workflowStateId: 'state-1' },
      }),
    ).toEqual({
      expectedDomainRevision: 3,
      groupBy: 'workflowCategory',
      targetKey: 'done',
      type: 'local',
    });
  });

  it('routes local Done drops through the completion cascade instead of a raw status write', () => {
    expect(
      workQueryMovePlan({
        groupBy: 'workflowCategory',
        targetKey: 'done',
        task: boardTask,
      }),
    ).toEqual({ status: 'completed', task: boardTask, type: 'cascade' });
  });

  it('uses a versioned local patch for ordinary category moves', () => {
    expect(
      workQueryMovePlan({
        groupBy: 'workflowCategory',
        targetKey: 'backlog',
        task: boardTask,
      }),
    ).toEqual({
      expectedDomainRevision: 3,
      groupBy: 'workflowCategory',
      targetKey: 'backlog',
      type: 'local',
    });
  });

  it('ignores Cordy keys that are not work-query columns', () => {
    expect(
      workQueryMovePlan({
        groupBy: 'status',
        targetKey: 'todo',
        task: boardTask,
      }),
    ).toEqual({ type: 'noop' });
  });
});

describe('cascadeStatusForBoardKey', () => {
  it('maps Done and Canceled columns onto the completion gate', () => {
    expect(cascadeStatusForBoardKey('workflowCategory', 'done')).toBe('completed');
    expect(cascadeStatusForBoardKey('status', 'canceled')).toBe('canceled');
    expect(cascadeStatusForBoardKey('workflowCategory', 'todo')).toBeNull();
  });
});

describe('workQueryTaskColumnKey', () => {
  it('puts Linear-linked In review cards in needsInput, matching the board', () => {
    expect(
      workQueryTaskColumnKey(
        { status: 'running', workflowCategory: 'in_review', workflowStateId: 'state-1' },
        'status',
      ),
    ).toBe('needsInput');
  });

  it('keeps unlinked execution status on a status list', () => {
    expect(workQueryTaskColumnKey({ status: 'running', workflowCategory: 'todo' }, 'status')).toBe(
      'running',
    );
  });

  it('groups a workflow view by category even without a linked state', () => {
    expect(
      workQueryTaskColumnKey({ status: 'running', workflowCategory: 'todo' }, 'workflowCategory'),
    ).toBe('todo');
  });
});

describe('workQueryListGroups', () => {
  it('defaults ungrouped lists to the status board, not workflow', () => {
    expect(workQueryListGroupBy(undefined)).toBe('status');
    expect(workQueryListGroupBy('none')).toBe('status');
    expect(workQueryListGroupBy('workflowCategory')).toBe('workflowCategory');
  });

  it('does not park a Linear In-review card under Running', () => {
    const groups = workQueryListGroups(
      [
        task({
          id: 'a',
          status: 'running',
          workflowCategory: 'in_review',
          workflowStateId: 'state-1',
        }),
        task({ id: 'b', status: 'running' }),
      ],
      'status',
    );

    expect(
      groups.find((group) => group.key === 'needsInput')?.tasks.map((item) => item.id),
    ).toEqual(['a']);
    expect(groups.find((group) => group.key === 'running')?.tasks.map((item) => item.id)).toEqual([
      'b',
    ]);
  });
});
