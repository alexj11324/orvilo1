import type { TaskListItem } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import {
  RAW_STATUS_KANBAN_COLUMNS,
  WORKFLOW_KANBAN_COLUMNS,
} from '@/features/AgentTasks/AgentTaskList/kanbanBoardModel';

import {
  cascadeStatusForBoardKey,
  isMyWorkBoardMode,
  workQueryBoardGroups,
  workQueryListGroupBy,
  workQueryListGroups,
  workQueryListSections,
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
  const found = [...WORKFLOW_KANBAN_COLUMNS, ...RAW_STATUS_KANBAN_COLUMNS].find(
    (item) => item.key === key,
  );
  if (!found) throw new Error(`missing column ${key}`);
  return found;
};

describe('workQueryBoardGroups', () => {
  it('keeps raw execution statuses in their own columns — paused never folds into failed', () => {
    const groups = workQueryBoardGroups(
      [
        { hasMore: false, key: 'paused', tasks: [task({ id: 'a' })], total: 1 },
        { hasMore: true, key: 'failed', tasks: [task({ id: 'b' })], total: 2 },
        { hasMore: false, key: 'completed', tasks: [task({ id: 'c' })], total: 1 },
      ],
      'status',
    );

    expect(groups.map((group) => group.key)).toEqual(['st:paused', 'st:failed', 'st:completed']);
    const paused = groups.find((group) => group.key === 'st:paused');
    expect(paused?.tasks.map((item) => item.id)).toEqual(['a']);
    expect(groups.find((group) => group.key === 'st:failed')?.hasMore).toBe(true);
    // TaskGroupItem (groupList) requires the loaded window; KanbanBoard's
    // external path pages via onLoadMoreGroup, but the object still has to
    // type-check (Push Typecheck 2cd067ae failed without these).
    expect(paused?.limit).toBe(1);
    expect(paused?.offset).toBe(0);
  });

  it('keeps business categories in their own wf: columns — in_review is never needsInput', () => {
    const groups = workQueryBoardGroups(
      [{ hasMore: false, key: 'in_review', tasks: [task()], total: 1 }],
      'workflowCategory',
    );

    expect(groups.map((group) => group.key)).toEqual(['wf:in_review']);
  });

  it('passes unknown keys through prefixed and survives empty input', () => {
    // An out-of-contract group key still surfaces as its own column key — the
    // board renders it non-droppable rather than silently dropping the rows.
    expect(
      workQueryBoardGroups([{ hasMore: false, key: 'bogus', tasks: [task()], total: 1 }], 'status'),
    ).toMatchObject([{ key: 'st:bogus' }]);
    expect(workQueryBoardGroups(undefined, 'status')).toEqual([]);
  });
});

describe('workQueryTargetKeyFromKanbanColumn', () => {
  it('maps wf: columns onto workflow-category targets', () => {
    expect(workQueryTargetKeyFromKanbanColumn('workflowCategory', column('wf:in_review'))).toBe(
      'in_review',
    );
    expect(workQueryTargetKeyFromKanbanColumn('workflowCategory', column('wf:in_progress'))).toBe(
      'in_progress',
    );
    expect(workQueryTargetKeyFromKanbanColumn('workflowCategory', column('wf:done'))).toBe('done');
  });

  it('maps st: columns onto the raw status', () => {
    expect(workQueryTargetKeyFromKanbanColumn('status', column('st:paused'))).toBe('paused');
    expect(workQueryTargetKeyFromKanbanColumn('status', column('st:running'))).toBe('running');
    expect(workQueryTargetKeyFromKanbanColumn('status', column('st:completed'))).toBe('completed');
    expect(workQueryTargetKeyFromKanbanColumn('status', column('st:failed'))).toBe('failed');
  });
});

describe('workQuerySourceKeysForKanbanColumn', () => {
  it('strips the column prefix so load-more talks in work-query group keys', () => {
    expect(workQuerySourceKeysForKanbanColumn('workflowCategory', 'wf:in_review')).toEqual([
      'in_review',
    ]);
    expect(workQuerySourceKeysForKanbanColumn('status', 'st:failed')).toEqual(['failed']);
    expect(workQuerySourceKeysForKanbanColumn('status', 'st:running')).toEqual(['running']);
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

  it('ignores keys that are not work-query columns', () => {
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
  it('puts a Linear In-review card in the wf:in_review column, not needsInput', () => {
    expect(
      workQueryTaskColumnKey(
        { status: 'running', workflowCategory: 'in_review', workflowStateId: 'state-1' },
        'workflowCategory',
      ),
    ).toBe('wf:in_review');
  });

  it('keeps run states distinct on a status board — paused, failed and running differ', () => {
    expect(workQueryTaskColumnKey({ status: 'paused', workflowCategory: 'todo' }, 'status')).toBe(
      'st:paused',
    );
    expect(workQueryTaskColumnKey({ status: 'failed', workflowCategory: 'todo' }, 'status')).toBe(
      'st:failed',
    );
    expect(workQueryTaskColumnKey({ status: 'running', workflowCategory: 'todo' }, 'status')).toBe(
      'st:running',
    );
  });
});

describe('workQueryListGroups', () => {
  it('honours an explicit `none` — the list stays flat, nothing re-groups it', () => {
    expect(workQueryListGroupBy(undefined)).toBe('status');
    expect(workQueryListGroupBy('none')).toBe('none');
    expect(workQueryListGroupBy('workflowCategory')).toBe('workflowCategory');
  });

  it('keeps business categories and run states apart in grouped lists', () => {
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

    // Both are `running` run-state now — an in-review issue only separates on
    // the business (workflowCategory) dimension.
    expect(groups.find((group) => group.key === 'running')?.tasks.map((item) => item.id)).toEqual([
      'a',
      'b',
    ]);
    const wfGroups = workQueryListGroups(
      [
        task({
          id: 'a',
          status: 'running',
          workflowCategory: 'in_review',
          workflowStateId: 'state-1',
        }),
        task({ id: 'b', status: 'running', workflowCategory: 'todo' }),
      ],
      'workflowCategory',
    );
    expect(
      wfGroups.find((group) => group.key === 'in_review')?.tasks.map((item) => item.id),
    ).toEqual(['a']);
    expect(wfGroups.find((group) => group.key === 'todo')?.tasks.map((item) => item.id)).toEqual([
      'b',
    ]);
  });

  it('prefers server group totals instead of rearranging the loaded page', () => {
    const sections = workQueryListSections(
      [
        {
          hasMore: true,
          key: 'running',
          tasks: [task({ id: 'page-1', status: 'running' })],
          total: 3,
        },
      ],
      [task({ id: 'page-1', status: 'running' }), task({ id: 'other', status: 'backlog' })],
      'status',
    );

    expect(sections).toHaveLength(1);
    expect(sections[0]?.key).toBe('running');
    expect(sections[0]?.total).toBe(3);
    expect(sections[0]?.hasMore).toBe(true);
    expect(sections[0]?.tasks.map((item) => item.id)).toEqual(['page-1']);
  });
});
