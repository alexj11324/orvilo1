import { describe, expect, it } from 'vitest';

import { taskMilestoneById } from '@/features/Projects/milestoneFilter';
import type { TaskListItem } from '@/store/task/slices/list/initialState';

import {
  buildTaskRows,
  collapseSubTasks,
  compareTaskItems,
  DEFAULT_TASK_LIST_VIEW_OPTIONS,
  getVisibleTaskStatuses,
  groupTaskItems,
  HIDDEN_WHEN_COMPLETED_STATUSES,
  normalizeTaskListViewOptions,
  toStoredTaskListViewOptions,
} from './listViewOptions';

const task = (id: string, overrides: Partial<TaskListItem> = {}): TaskListItem =>
  ({
    createdAt: new Date('2026-01-01'),
    id,
    identifier: `T-${id}`,
    name: id,
    parentTaskId: null,
    priority: 0,
    status: 'backlog',
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }) as unknown as TaskListItem;

const byIdentifier = (a: TaskListItem, b: TaskListItem) => a.identifier.localeCompare(b.identifier);

const indexById = (items: TaskListItem[]) => new Map(items.map((item) => [item.id, item]));

describe('normalizeTaskListViewOptions', () => {
  it('shows parent and child issues nested in the default grouped list', () => {
    const options = normalizeTaskListViewOptions();

    expect(options.showSubTasks).toBe(true);
    expect(options.nestedSubTasks).toBe(true);
    const parent = task('parent');
    const child = task('child', { parentTaskId: parent.id });
    const items = [parent, child];
    const visible = options.showSubTasks ? items : collapseSubTasks(items);
    expect(
      buildTaskRows(visible, {
        compare: byIdentifier,
        nested: options.nestedSubTasks,
        taskById: indexById(items),
      }).map(({ task, depth }) => [task.id, depth]),
    ).toEqual([
      ['parent', 0],
      ['child', 1],
    ]);
  });

  it('restores the sub-task defaults for options persisted before the toggles existed', () => {
    const options = normalizeTaskListViewOptions({ groupBy: 'priority' });

    expect(options.showSubTasks).toBe(DEFAULT_TASK_LIST_VIEW_OPTIONS.showSubTasks);
    expect(options.nestedSubTasks).toBe(DEFAULT_TASK_LIST_VIEW_OPTIONS.nestedSubTasks);
  });

  it('preserves an explicit sub-task choice', () => {
    const options = normalizeTaskListViewOptions({ nestedSubTasks: false, showSubTasks: true });

    expect(options.showSubTasks).toBe(true);
    expect(options.nestedSubTasks).toBe(false);
  });

  it('keeps the milestone property on by default and honors a persisted off', () => {
    expect(normalizeTaskListViewOptions().showMilestone).toBe(true);
    // Options persisted before the property existed get the default, not `undefined`.
    expect(normalizeTaskListViewOptions({ groupBy: 'priority' }).showMilestone).toBe(true);
    expect(normalizeTaskListViewOptions({ showMilestone: false }).showMilestone).toBe(false);
  });

  it('accepts the milestone grouping and manual ordering persisted by the display panel', () => {
    const options = normalizeTaskListViewOptions({ groupBy: 'milestone', orderBy: 'manual' });

    expect(options.groupBy).toBe('milestone');
    expect(options.orderBy).toBe('manual');
  });
});

describe('toStoredTaskListViewOptions', () => {
  it('snapshots a normalized full options object — what "Set default" persists', () => {
    expect(toStoredTaskListViewOptions({ groupBy: 'milestone', orderBy: 'manual' })).toEqual(
      normalizeTaskListViewOptions({ groupBy: 'milestone', orderBy: 'manual' }),
    );
    expect(toStoredTaskListViewOptions({})).toEqual(DEFAULT_TASK_LIST_VIEW_OPTIONS);
  });
});

describe('automation mode grouping', () => {
  it('groups scheduled and heartbeat tasks separately with schedule first', () => {
    const schedule = task('schedule', { automationMode: 'schedule' });
    const heartbeat = task('heartbeat', { automationMode: 'heartbeat' });
    expect(
      groupTaskItems([heartbeat, schedule], 'automationMode').map(([group, items]) => [
        group.automationMode,
        items.map((item) => item.id),
      ]),
    ).toEqual([
      ['schedule', ['schedule']],
      ['heartbeat', ['heartbeat']],
    ]);
  });

  it('does not create an empty automation group', () => {
    const heartbeat = task('heartbeat', { automationMode: 'heartbeat' });
    const groups = groupTaskItems([heartbeat], 'automationMode');

    expect(groups.map(([group]) => group.key)).toEqual(['automationMode:heartbeat']);
  });
});

describe('milestone grouping', () => {
  // The catalog arrives unordered; `sortOrder` is the project's own ordering.
  const milestoneById = taskMilestoneById([
    { id: 'ms-beta', name: 'Beta', sortOrder: 1 },
    { date: '2026-10-01', id: 'ms-alpha', name: 'Alpha', sortOrder: 0 },
  ]);

  it('buckets tasks by milestone and orders the groups by the catalog order', () => {
    const inBeta = task('beta', { projectMilestoneId: 'ms-beta' });
    const inAlpha = task('alpha', { projectMilestoneId: 'ms-alpha' });
    const inNone = task('none', { projectMilestoneId: null });

    expect(
      groupTaskItems([inBeta, inNone, inAlpha], 'milestone', 'asc', milestoneById).map(
        ([meta, items]) => [meta.key, meta.label, items.map((item) => item.id)],
      ),
    ).toEqual([
      ['milestone:ms-alpha', 'Alpha', ['alpha']],
      ['milestone:ms-beta', 'Beta', ['beta']],
      // "No milestone" always trails the named groups.
      ['milestone:none', expect.any(String), ['none']],
    ]);
  });

  it('keeps a milestone the catalog does not know out of "No milestone"', () => {
    const stale = task('stale', { projectMilestoneId: 'ms-gone' });
    const unlinked = task('unlinked', { projectMilestoneId: null });

    const groups = groupTaskItems([unlinked, stale], 'milestone', 'asc', milestoneById);

    expect(groups.map(([meta]) => meta.key)).toEqual(['milestone:ms-gone', 'milestone:none']);
    // The group still carries the raw id, so its label can be honest about
    // which link it buckets.
    expect(groups[0][0].milestoneId).toBe('ms-gone');
    expect(groups[1][0].milestoneId).toBeNull();
  });

  it('still groups by milestone id when no catalog was supplied at all', () => {
    const linked = task('linked', { projectMilestoneId: 'ms-alpha' });
    const unlinked = task('unlinked');

    const groups = groupTaskItems([linked, unlinked], 'milestone');

    expect(groups.map(([meta]) => meta.key)).toEqual(['milestone:ms-alpha', 'milestone:none']);
  });
});

describe('manual ordering', () => {
  it('orders by the persisted board position, untouched rows falling back to newest-first', () => {
    const options = { ...DEFAULT_TASK_LIST_VIEW_OPTIONS, orderBy: 'manual' as const };
    const dragged = task('dragged', { position: 5 });
    const untouchedNewer = task('untouchedNewer', {
      createdAt: new Date('2026-02-01'),
      position: null,
    });
    const untouchedOlder = task('untouchedOlder', {
      createdAt: new Date('2026-01-01'),
      position: null,
    });

    expect(
      [dragged, untouchedOlder, untouchedNewer]
        .sort((a, b) => compareTaskItems(a, b, options))
        .map((item) => item.id),
    ).toEqual(['untouchedNewer', 'untouchedOlder', 'dragged']);
  });

  it('lets the direction toggle flip the manual order like the other orderings', () => {
    const options = {
      ...DEFAULT_TASK_LIST_VIEW_OPTIONS,
      orderBy: 'manual' as const,
      orderDirection: 'desc' as const,
    };
    const low = task('low', { position: -100 });
    const high = task('high', { position: -50 });

    expect(
      [low, high].sort((a, b) => compareTaskItems(a, b, options)).map((item) => item.id),
    ).toEqual(['high', 'low']);
  });
});

describe('assignment grouping', () => {
  it('groups agent and member assignments independently', () => {
    const dualAssigned = task('dual', {
      assigneeAgentId: 'agent-1',
      assigneeUserId: 'user-1',
    });
    const memberOnly = task('member-only', { assigneeUserId: 'user-1' });

    expect(
      groupTaskItems([dualAssigned, memberOnly], 'assignee').map(([group, items]) => [
        group.key,
        items.map((item) => item.id),
      ]),
    ).toEqual([
      ['assignee:agent-1', ['dual']],
      ['assignee:unassigned', ['member-only']],
    ]);
    expect(
      groupTaskItems([dualAssigned, memberOnly], 'member').map(([group, items]) => [
        group.key,
        items.map((item) => item.id),
      ]),
    ).toEqual([['member:user-1', ['dual', 'member-only']]]);
  });
});

describe('collapseSubTasks', () => {
  it('drops a sub-task whose parent is already listed', () => {
    const items = [task('parent'), task('child', { parentTaskId: 'parent' })];

    expect(collapseSubTasks(items).map((item) => item.id)).toEqual(['parent']);
  });

  it('drops every level of a nested chain the root stands for', () => {
    const items = [
      task('root'),
      task('child', { parentTaskId: 'root' }),
      task('grandchild', { parentTaskId: 'child' }),
    ];

    expect(collapseSubTasks(items).map((item) => item.id)).toEqual(['root']);
  });

  it('keeps a sub-task whose parent is absent from the list', () => {
    // A goal's child: the parent is filtered out server-side, so no listed row
    // stands for it and hiding it would drop it from the page entirely.
    const items = [task('orphan', { parentTaskId: 'goal-task' }), task('solo')];

    expect(collapseSubTasks(items).map((item) => item.id)).toEqual(['orphan', 'solo']);
  });
});

describe('buildTaskRows', () => {
  it('leaves every task at the top level when nesting is off', () => {
    const items = [task('parent'), task('child', { parentTaskId: 'parent' })];
    const rows = buildTaskRows(items, {
      compare: byIdentifier,
      nested: false,
      taskById: indexById(items),
    });

    expect(rows.map((row) => [row.task.id, row.depth])).toEqual([
      ['parent', 0],
      ['child', 0],
    ]);
  });

  it('indents a sub-task under the parent it shares a group with', () => {
    const items = [
      task('child', { parentTaskId: 'parent' }),
      task('parent'),
      task('grandchild', { parentTaskId: 'child' }),
    ];
    const rows = buildTaskRows(items, {
      compare: byIdentifier,
      nested: true,
      taskById: indexById(items),
    });

    expect(rows.map((row) => [row.task.id, row.depth, row.isParentContext])).toEqual([
      ['parent', 0, false],
      ['child', 1, false],
      ['grandchild', 2, false],
    ]);
  });

  it('anchors a sub-task under a muted context row when its parent sits elsewhere', () => {
    const parent = task('parent', { status: 'backlog' });
    const child = task('child', { parentTaskId: 'parent', status: 'running' });
    const rows = buildTaskRows([child], {
      compare: byIdentifier,
      nested: true,
      taskById: indexById([parent, child]),
    });

    expect(rows.map((row) => [row.task.id, row.depth, row.isParentContext])).toEqual([
      ['parent', 0, true],
      ['child', 1, false],
    ]);
  });

  it('gathers siblings from other groups under a single context row', () => {
    const parent = task('parent');
    const first = task('first', { parentTaskId: 'parent' });
    const second = task('second', { parentTaskId: 'parent' });
    const rows = buildTaskRows([second, first], {
      compare: byIdentifier,
      nested: true,
      taskById: indexById([parent, first, second]),
    });

    expect(rows.map((row) => [row.task.id, row.depth])).toEqual([
      ['parent', 0],
      ['first', 1],
      ['second', 1],
    ]);
  });

  it('keeps a sub-task at the top level when its parent is off the list entirely', () => {
    const orphan = task('orphan', { parentTaskId: 'missing' });
    const rows = buildTaskRows([orphan], {
      compare: byIdentifier,
      nested: true,
      taskById: indexById([orphan]),
    });

    expect(rows).toEqual([{ depth: 0, isParentContext: false, task: orphan }]);
  });

  it('renders every task once when the parent chain loops back on itself', () => {
    const a = task('a', { parentTaskId: 'b' });
    const b = task('b', { parentTaskId: 'a' });
    const rows = buildTaskRows([a, b], {
      compare: byIdentifier,
      nested: true,
      taskById: indexById([a, b]),
    });

    expect(rows.map((row) => row.task.id).sort()).toEqual(['a', 'b']);
  });

  it('orders siblings with the list comparator', () => {
    const options = { ...DEFAULT_TASK_LIST_VIEW_OPTIONS, orderBy: 'title' as const };
    const parent = task('parent', { name: 'A parent' });
    const beta = task('beta', { name: 'Beta', parentTaskId: 'parent' });
    const alpha = task('alpha', { name: 'Alpha', parentTaskId: 'parent' });
    const rows = buildTaskRows([parent, beta, alpha], {
      compare: (a, b) => compareTaskItems(a, b, options),
      nested: true,
      taskById: indexById([parent, beta, alpha]),
    });

    expect(rows.map((row) => row.task.id)).toEqual(['parent', 'alpha', 'beta']);
  });
});

describe('getVisibleTaskStatuses', () => {
  it('translates hideCompleted into the server status filter, before pagination', () => {
    const statuses = getVisibleTaskStatuses({ hideCompleted: true });
    expect(statuses).toBeDefined();
    for (const hidden of HIDDEN_WHEN_COMPLETED_STATUSES) expect(statuses).not.toContain(hidden);
    expect(statuses).toContain('backlog');
    expect(statuses).toContain('running');
  });

  it('applies no narrowing when completed tasks are shown', () => {
    expect(getVisibleTaskStatuses({ hideCompleted: false })).toBeUndefined();
  });
});
