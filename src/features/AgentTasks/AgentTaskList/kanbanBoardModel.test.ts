import { describe, expect, it } from 'vitest';

import type { TaskGroupItem, TaskListItem } from '@/store/task/slices/list/initialState';

import {
  buildKanbanColumnMap,
  buildKanbanColumns,
  buildKanbanGroupQuery,
  canDropTaskIntoKanbanColumn,
  computeKanbanPosition,
  effectiveTaskPosition,
  findKanbanColumn,
  getKanbanAssigneeUpdate,
  getKanbanColumnHeaderVariant,
  getKanbanMoveAnchors,
  getKanbanTaskPatch,
  KANBAN_STATUS_COLUMN_KEY,
  KANBAN_WORKFLOW_COLUMN_KEY,
  kanbanBoardCapabilities,
  kanbanColumnAllowsCreate,
  type KanbanColumnDefinition,
  kanbanColumnMoveScope,
  kanbanCreateTaskProjectId,
  kanbanStatusColumnsExcludedBy,
  normalizeKanbanGroupBy,
  placeKanbanCardInColumn,
  preserveKanbanColumnOrder,
  resolveKanbanDragTask,
  resolveKanbanDropColumn,
  STATUS_KANBAN_COLUMNS,
  taskKanbanColumnKey,
  taskMatchesKanbanColumn,
} from './kanbanBoardModel';

const task = (
  id: string,
  assigneeAgentId?: string | null,
  assigneeUserId?: string | null,
  overrides: Partial<TaskListItem> = {},
): TaskListItem =>
  ({
    assigneeAgentId,
    assigneeUserId,
    automationMode: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    createdByUserId: 'creator-1',
    id,
    identifier: `T-${id}`,
    position: null,
    priority: 0,
    status: 'backlog',
    visibility: 'public',
    ...overrides,
  }) as TaskListItem;

const group = (
  key: string,
  tasks: TaskListItem[],
  assigneeAgentId?: string | null,
  assigneeUserId?: string | null,
): TaskGroupItem =>
  ({
    assigneeAgentId,
    assigneeUserId,
    hasMore: false,
    key,
    limit: 50,
    offset: 0,
    tasks,
    total: tasks.length,
  }) as TaskGroupItem;

const taskMapOf = (tasks: TaskListItem[]) => new Map(tasks.map((item) => [item.identifier, item]));

describe('kanbanBoardModel', () => {
  it('uses assignee, member and priority as board dimensions and falls back from no grouping', () => {
    expect(normalizeKanbanGroupBy('assignee')).toBe('assignee');
    expect(normalizeKanbanGroupBy('member')).toBe('member');
    expect(normalizeKanbanGroupBy('priority')).toBe('priority');
    expect(normalizeKanbanGroupBy('none')).toBe('status');
  });

  it('keeps the column header in skeleton mode for every loading group shape', () => {
    expect(getKanbanColumnHeaderVariant({ hasGroupMeta: false, loading: true })).toBe('loading');
    expect(getKanbanColumnHeaderVariant({ hasGroupMeta: true, loading: true })).toBe('loading');
    expect(getKanbanColumnHeaderVariant({ hasGroupMeta: true })).toBe('group');
    expect(getKanbanColumnHeaderVariant({ hasGroupMeta: false })).toBe('fallback');
  });

  it('builds assignee columns including the unassigned group', () => {
    const groups = [
      group('assignee:agent-1', [task('1', 'agent-1')], 'agent-1'),
      group('assignee:unassigned', [task('2', null)], null),
    ];

    const columns = buildKanbanColumns(groups, 'assignee');

    expect(columns.map((column) => column.key).sort()).toEqual(
      ['assignee:unassigned', 'assignee:agent-1'].sort(),
    );
    expect(
      columns.find((column) => column.key === 'assignee:unassigned')?.groupMeta?.assigneeId,
    ).toBeUndefined();
    expect(columns.find((column) => column.key === 'assignee:agent-1')?.groupMeta?.assigneeId).toBe(
      'agent-1',
    );
  });

  it('builds member columns independently from agent assignees', () => {
    const groups = [
      group('member:user-1', [task('1', 'agent-1', 'user-1')], undefined, 'user-1'),
      group('member:unassigned', [task('2', 'agent-1', null)], undefined, null),
    ];

    const columns = buildKanbanColumns(groups, 'member');

    expect(columns.map((column) => column.key).sort()).toEqual(
      ['member:unassigned', 'member:user-1'].sort(),
    );
    expect(
      columns.find((column) => column.key === 'member:user-1')?.groupMeta?.assigneeUserId,
    ).toBe('user-1');
  });

  it('patches the task assignee when moving between assignee columns', () => {
    const assignedTask = task('1', 'agent-1', 'user-1');
    const groups = [
      group('assignee:agent-1', [assignedTask], 'agent-1'),
      group('assignee:unassigned', [], null),
    ];
    const targetColumn = buildKanbanColumns(groups, 'assignee').find(
      (column) => column.key === 'assignee:unassigned',
    )!;
    const patch = getKanbanTaskPatch('assignee', targetColumn)!;

    expect(patch).toEqual({ assigneeAgentId: null });
    // The update only carries the dimension that changes — the member
    // assignee stays untouched.
    expect(getKanbanAssigneeUpdate(assignedTask, patch)).toEqual({ assigneeAgentId: null });
  });

  it('patches only the member when moving between member columns', () => {
    const assignedTask = task('1', 'agent-1', 'user-1');
    const groups = [
      group('member:user-1', [assignedTask], undefined, 'user-1'),
      group('member:unassigned', [], undefined, null),
    ];
    const targetColumn = buildKanbanColumns(groups, 'member').find(
      (column) => column.key === 'member:unassigned',
    )!;

    expect(getKanbanTaskPatch('member', targetColumn)).toEqual({ assigneeUserId: null });
    expect(
      getKanbanAssigneeUpdate(assignedTask, getKanbanTaskPatch('member', targetColumn)!),
    ).toEqual({ assigneeUserId: null });
  });

  it('persists only the assignment dimension that changed', () => {
    expect(
      getKanbanAssigneeUpdate(task('1', null, 'user-1'), { assigneeAgentId: 'agent-1' }),
    ).toEqual({ assigneeAgentId: 'agent-1' });
    expect(getKanbanAssigneeUpdate(task('2', 'agent-1'), { assigneeUserId: 'user-1' })).toEqual({
      assigneeUserId: 'user-1',
    });
    expect(
      getKanbanAssigneeUpdate(task('3', null, 'user-1'), { assigneeUserId: 'user-1' }),
    ).toBeUndefined();
  });

  it('allows automated tasks to move between member columns', () => {
    const columns = buildKanbanColumns(
      [
        group('member:unassigned', [], undefined, null),
        group('member:user-1', [], undefined, 'user-1'),
      ],
      'member',
    );
    const unassignedColumn = columns.find((column) => column.key === 'member:unassigned')!;
    const memberColumn = columns.find((column) => column.key === 'member:user-1')!;
    const automatedTask = task('automated', null, null, { automationMode: 'schedule' });

    expect(canDropTaskIntoKanbanColumn(automatedTask, 'member', memberColumn)).toBe(true);
    expect(canDropTaskIntoKanbanColumn(automatedTask, 'member', unassignedColumn)).toBe(true);
  });

  it('only allows private tasks to be dropped into their creator member column', () => {
    const columns = buildKanbanColumns(
      [
        group('member:creator-1', [], undefined, 'creator-1'),
        group('member:user-2', [], undefined, 'user-2'),
      ],
      'member',
    );
    const creatorColumn = columns.find((column) => column.key === 'member:creator-1')!;
    const otherMemberColumn = columns.find((column) => column.key === 'member:user-2')!;
    const privateTask = task('private', null, null, { visibility: 'private' });

    expect(canDropTaskIntoKanbanColumn(privateTask, 'member', creatorColumn)).toBe(true);
    expect(canDropTaskIntoKanbanColumn(privateTask, 'member', otherMemberColumn)).toBe(false);
  });

  describe('status columns', () => {
    it('keeps legacy execution statuses in their merged columns', () => {
      expect(KANBAN_STATUS_COLUMN_KEY.failed).toBe('needsInput');
      expect(KANBAN_STATUS_COLUMN_KEY.paused).toBe('needsInput');
      expect(KANBAN_STATUS_COLUMN_KEY.scheduled).toBe('running');
      expect(KANBAN_STATUS_COLUMN_KEY.completed).toBe('done');
      expect(taskKanbanColumnKey(task('1', null, null, { status: 'failed' }), 'status')).toBe(
        'needsInput',
      );
    });

    it('uses business workflow categories for linked tasks even when execution disagrees', () => {
      const linkedDone = task('linked', null, null, {
        status: 'paused',
        workflowCategory: 'done',
        workflowStateId: 'linear-state-done',
      });

      expect(KANBAN_WORKFLOW_COLUMN_KEY.done).toBe('done');
      expect(taskKanbanColumnKey(linkedDone, 'status')).toBe('done');
      expect(taskMatchesKanbanColumn(linkedDone, 'status', 'needsInput')).toBe(false);
    });

    it('keeps execution-only running closed while linked tasks can target mapped workflow states', () => {
      const running = STATUS_KANBAN_COLUMNS.find((column) => column.key === 'running')!;
      const needsInput = STATUS_KANBAN_COLUMNS.find((column) => column.key === 'needsInput')!;
      const legacyTask = task('legacy');
      const linkedTask = task('linked', null, null, {
        workflowCategory: 'backlog',
        workflowStateId: 'linear-state-backlog',
      });

      expect(running.droppable).toBe(true);
      expect(running.targetStatus).toBeNull();
      expect(canDropTaskIntoKanbanColumn(legacyTask, 'status', running)).toBe(false);
      expect(canDropTaskIntoKanbanColumn(linkedTask, 'status', running)).toBe(true);
      expect(needsInput.droppable).toBe(true);
      expect(needsInput.targetStatus).toBe('paused');
      expect(getKanbanTaskPatch('status', needsInput, linkedTask)).toEqual({
        workflowCategory: 'in_review',
      });
    });

    it('treats a failed task dropped back on needsInput as already inside — no status rewrite', () => {
      const failedTask = task('1', null, null, { status: 'failed' });

      expect(taskMatchesKanbanColumn(failedTask, 'status', 'needsInput')).toBe(true);
      expect(taskMatchesKanbanColumn(failedTask, 'status', 'backlog')).toBe(false);
    });

    it('excludes a column only when every member status is filtered out', () => {
      expect(kanbanStatusColumnsExcludedBy(['completed', 'canceled'])).toEqual(
        new Set(['done', 'canceled']),
      );
      // needsInput survives a partial exclusion (failed still shows).
      expect(kanbanStatusColumnsExcludedBy(['paused'])).toEqual(new Set());
      expect(kanbanStatusColumnsExcludedBy(undefined)).toEqual(new Set());
    });
  });

  describe('drag mirror', () => {
    it('builds a column map that keeps empty columns as drop targets', () => {
      const columns = buildKanbanColumnMap(
        ['backlog', 'done', 'canceled'],
        [group('backlog', [task('1'), task('2')])],
      );

      expect(columns).toEqual({ backlog: ['T-1', 'T-2'], canceled: [], done: [] });
    });

    it('finds the column of a card id or a column key', () => {
      const columns = { backlog: ['T-1'], done: ['T-2'] };
      const keys = new Set(['backlog', 'done']);

      expect(findKanbanColumn(columns, 'T-1', keys)).toBe('backlog');
      expect(findKanbanColumn(columns, 'done', keys)).toBe('done');
      expect(findKanbanColumn(columns, 'T-missing', keys)).toBeNull();
    });

    it('moves a card across columns and derives anchors + position for the drop', () => {
      // Simulates the board's handleDragOver: T-3 leaves backlog for the
      // middle of done.
      const a = task('1', null, null, { position: 10 });
      const b = task('2', null, null, { position: 20 });
      const moving = task('3', null, null, { position: 30 });
      const map = taskMapOf([a, b, moving]);
      const columns = { backlog: ['T-3'], done: ['T-1', 'T-2'] };
      const keys = new Set(['backlog', 'done']);

      const nextDone = [...columns.done];
      nextDone.splice(1, 0, 'T-3');
      const next = { ...columns, backlog: [], done: nextDone };

      expect(findKanbanColumn(next, 'T-3', keys)).toBe('done');
      expect(getKanbanMoveAnchors(next.done, 'T-3')).toEqual({
        afterId: 'T-2',
        beforeId: 'T-1',
      });
      expect(computeKanbanPosition(next.done, 'T-3', map)).toBe(15);
    });

    it('computes edge positions off the neighbouring card only', () => {
      const map = taskMapOf([
        task('1', null, null, { position: 10 }),
        task('2', null, null, { position: 20 }),
      ]);

      expect(computeKanbanPosition(['T-9', 'T-1', 'T-2'], 'T-9', map)).toBe(9);
      expect(computeKanbanPosition(['T-1', 'T-2', 'T-9'], 'T-9', map)).toBe(21);
      // Alone in a column it keeps its own effective position — a same-slot
      // drop is a no-op.
      expect(computeKanbanPosition(['T-1'], 'T-1', map)).toBe(10);
    });

    it('falls back to -epoch(createdAt) for rows that were never dragged', () => {
      const untouched = task('1');
      const dragged = task('2', null, null, { position: 5 });

      expect(effectiveTaskPosition(dragged)).toBe(5);
      expect(effectiveTaskPosition(untouched)).toBe(
        -new Date('2024-01-01T00:00:00.000Z').getTime() / 1000,
      );
      // An untouched row sorts as if its position were the creation fallback.
      const map = taskMapOf([untouched]);
      expect(computeKanbanPosition(['T-9', 'T-1'], 'T-9', map)).toBe(
        effectiveTaskPosition(untouched) - 1,
      );
    });

    it('derives anchors for the first, middle and last slots', () => {
      const ids = ['A', 'B', 'C'];

      expect(getKanbanMoveAnchors(ids, 'A')).toEqual({ afterId: 'B', beforeId: null });
      expect(getKanbanMoveAnchors(ids, 'B')).toEqual({ afterId: 'C', beforeId: 'A' });
      expect(getKanbanMoveAnchors(ids, 'C')).toEqual({ afterId: null, beforeId: 'B' });
      expect(getKanbanMoveAnchors(['A'], 'A')).toEqual({ afterId: null, beforeId: null });
    });

    it('preserves the rendered column order on resync and drops vanished keys', () => {
      const previous = { backlog: ['T-1'], done: [], running: ['T-2'] };
      const refreshed = { backlog: ['T-2'], done: ['T-1'], needsInput: ['T-3'] };

      expect(preserveKanbanColumnOrder(previous, refreshed)).toEqual({
        backlog: ['T-2'],
        done: ['T-1'],
        needsInput: ['T-3'],
      });
    });

    describe('placeKanbanCardInColumn', () => {
      it('removes the card from a stale preview column when released elsewhere', () => {
        // Regression: the drag-over preview parked T-1 in `done`, but the
        // pointer released over `canceled`. Without the sweep the id stays in
        // `done` too and the card renders twice while the move settles.
        const next = placeKanbanCardInColumn(
          { backlog: ['T-9'], canceled: ['T-2'], done: ['T-1', 'T-3'] },
          'canceled',
          'T-1',
          'T-2',
        );

        expect(next.done).toEqual(['T-3']);
        expect(next.canceled).toEqual(['T-1', 'T-2']);
        expect(next.backlog).toEqual(['T-9']);
      });

      it('reorders inside the same column when already parked there', () => {
        const next = placeKanbanCardInColumn({ col: ['A', 'B', 'C'] }, 'col', 'A', 'C');

        expect(next.col).toEqual(['B', 'C', 'A']);
      });

      it('appends to the column end when released over the column itself', () => {
        const next = placeKanbanCardInColumn({ a: ['T-1'], b: ['T-2', 'T-3'] }, 'b', 'T-1', 'b');

        expect(next.a).toEqual([]);
        expect(next.b).toEqual(['T-2', 'T-3', 'T-1']);
      });
    });
  });

  describe('buildKanbanGroupQuery', () => {
    it('sends no automation filter on the "My tasks" board', () => {
      // Regression: the board pinned `automated: false` while the My tasks list
      // view sends none, so a scheduled or heartbeat task assigned to the
      // caller vanished the moment they switched that collection to board.
      const query = buildKanbanGroupQuery({ groupBy: 'status', myTaskScope: 'assigned' });

      expect(query).not.toHaveProperty('automated');
      expect(query).toEqual({ excludeStatuses: undefined, groupBy: 'status', scope: 'assigned' });
    });

    it('keeps excluding automation on the project, agent and all-agents boards', () => {
      // Those three do belong to the scheduled roll-up, so their columns stay
      // free of self-firing tasks.
      expect(buildKanbanGroupQuery({ groupBy: 'status', projectId: 'proj_1' })).toMatchObject({
        automated: false,
        projectId: 'proj_1',
      });
      expect(buildKanbanGroupQuery({ agentId: 'agt_1', groupBy: 'status' })).toMatchObject({
        agentId: 'agt_1',
        automated: false,
      });
      expect(buildKanbanGroupQuery({ groupBy: 'status' })).toMatchObject({
        allAgents: true,
        automated: false,
      });
    });

    it('prefers the My tasks scope over the agent scopes, but keeps the project filter', () => {
      // My Work's board composes scope + project: "Delegated × No project" is a
      // real query, so projectId rides along while agentId is dropped.
      const query = buildKanbanGroupQuery({
        agentId: 'agt_1',
        groupBy: 'status',
        myTaskScope: 'created',
        projectId: 'proj_1',
      });

      expect(query).toEqual({
        excludeStatuses: undefined,
        groupBy: 'status',
        projectId: 'proj_1',
        scope: 'created',
      });
    });

    it('keeps a null No-project filter on My tasks without locking create-task', () => {
      // Regression: My Work passes projectId: null into KanbanBoard. The grouped
      // query must keep that IS NULL filter, but createTaskModal only accepts a
      // concrete id (`string | undefined`) — forwarding null failed typecheck.
      expect(
        buildKanbanGroupQuery({
          groupBy: 'status',
          myTaskScope: 'assigned',
          projectId: null,
        }),
      ).toEqual({
        excludeStatuses: undefined,
        groupBy: 'status',
        projectId: null,
        scope: 'assigned',
      });
      expect(kanbanCreateTaskProjectId(null)).toBeUndefined();
      expect(kanbanCreateTaskProjectId(undefined)).toBeUndefined();
      expect(kanbanCreateTaskProjectId('proj_1')).toBe('proj_1');
    });

    it('carries the status exclusions through every scope', () => {
      const excludeStatuses = ['completed'] as const;

      expect(
        buildKanbanGroupQuery({ excludeStatuses, groupBy: 'status', myTaskScope: 'assigned' }),
      ).toMatchObject({ excludeStatuses });
      expect(buildKanbanGroupQuery({ excludeStatuses, groupBy: 'status' })).toMatchObject({
        excludeStatuses,
      });
    });
  });

  describe('resolveKanbanDragTask', () => {
    it('reads the task from drag data when the node is still mounted', () => {
      const dragged = task('1');
      const map = new Map([[dragged.identifier, dragged]]);
      const active = { data: { current: { task: dragged } }, id: dragged.identifier };
      expect(resolveKanbanDragTask(active, map)).toBe(dragged);
    });

    it('falls back to the snapshot map when the dragged node unmounted mid-drag', () => {
      // Regression: parking the card onto a hidden column unmounts its
      // sortable node, and dnd-kit clears `data.current` — the drop must
      // still resolve the task or it silently writes nothing.
      const dragged = task('1');
      const map = new Map([[dragged.identifier, dragged]]);
      const active = { data: { current: {} }, id: dragged.identifier };
      expect(resolveKanbanDragTask(active, map)).toBe(dragged);
    });

    it('returns undefined when neither source knows the id', () => {
      const active = { data: { current: {} }, id: 'ghost' };
      expect(resolveKanbanDragTask(active, new Map())).toBeUndefined();
    });
  });

  describe('resolveKanbanDropColumn', () => {
    const defs = new Map(STATUS_KANBAN_COLUMNS.map((column) => [column.key, column]));
    const keys = new Set(STATUS_KANBAN_COLUMNS.map((column) => column.key));

    it('commits to the release column, not the mirror’s parked preview slot', () => {
      // Regression: the card previewed onto `done`, then the pointer moved to
      // `backlog` — the drop must write `backlog`, not the stale preview.
      const columns = { backlog: [], done: ['T-1'], running: [] };
      expect(resolveKanbanDropColumn(task('1'), 'status', columns, 'backlog', keys, defs)).toBe(
        'backlog',
      );
    });

    it('rejects a legacy release over a column with no execution-status target', () => {
      // The preview moved the id into `running` before the last over was
      // rejected — the release column is still the truth.
      const columns = { backlog: [], done: [], running: ['T-1'] };
      expect(
        resolveKanbanDropColumn(task('1'), 'status', columns, 'running', keys, defs),
      ).toBeNull();
    });

    it('keeps a same-column reorder inside `running` legal', () => {
      // `running` is closed to incoming legacy status writes, but reordering a
      // member writes position only — membership is checked first.
      const columns = { running: ['T-1', 'T-2'] };
      expect(
        resolveKanbanDropColumn(
          task('1', undefined, undefined, { status: 'running' }),
          'status',
          columns,
          'T-2',
          keys,
          defs,
        ),
      ).toBe('running');
    });

    it('returns null when the release is outside every column', () => {
      const columns = { backlog: ['T-1'] };
      expect(resolveKanbanDropColumn(task('1'), 'status', columns, 'bogus', keys, defs)).toBeNull();
    });
  });

  describe('kanbanColumnMoveScope', () => {
    it('scopes a workflow column by linked category or legacy execution statuses', () => {
      const column = STATUS_KANBAN_COLUMNS.find((c) => c.key === 'needsInput')!;
      expect(kanbanColumnMoveScope('status', column)).toEqual({
        statuses: ['paused', 'failed'],
        workflowCategories: ['in_review'],
      });
    });

    it('scopes an assignee column by agent, member column by user', () => {
      const groups = [
        group('assignee:agent-1', [], 'agent-1'),
        group('assignee:unassigned', [], null),
      ];
      const columns = buildKanbanColumns(groups, 'assignee');
      const byKey = new Map<string, KanbanColumnDefinition>(
        columns.map((column) => [column.key, column]),
      );

      expect(kanbanColumnMoveScope('assignee', byKey.get('assignee:agent-1')!)).toEqual({
        assigneeAgentId: 'agent-1',
      });
      expect(kanbanColumnMoveScope('assignee', byKey.get('assignee:unassigned')!)).toEqual({
        assigneeAgentId: null,
        assigneeUserId: null,
      });
    });

    it('scopes member and priority columns by their membership field', () => {
      const memberColumns = buildKanbanColumns([group('member:u-1', [], null, 'u-1')], 'member');
      expect(kanbanColumnMoveScope('member', memberColumns[0]!)).toEqual({
        assigneeUserId: 'u-1',
      });

      const priorityColumn: KanbanColumnDefinition = {
        droppable: true,
        groupMeta: { groupBy: 'priority', key: 'priority:4', label: '', priority: 4 },
        key: 'priority:4',
        targetStatus: null,
      };
      expect(kanbanColumnMoveScope('priority', priorityColumn)).toEqual({ priority: 4 });
    });
  });
});

describe('kanbanBoardCapabilities', () => {
  it('manual boards allow both reorder and cross-group moves', () => {
    expect(kanbanBoardCapabilities({ movable: true, sortMode: 'manual' })).toEqual({
      canMoveAcrossGroups: true,
      canReorderWithinGroup: true,
    });
  });

  it('defaults an unset sortMode to manual', () => {
    expect(kanbanBoardCapabilities({ movable: true })).toEqual({
      canMoveAcrossGroups: true,
      canReorderWithinGroup: true,
    });
  });

  it('field-sorted views refuse same-column position writes but keep moves', () => {
    expect(kanbanBoardCapabilities({ movable: true, sortMode: 'field' })).toEqual({
      canMoveAcrossGroups: true,
      canReorderWithinGroup: false,
    });
  });

  it('movable=false disables both capabilities regardless of sortMode', () => {
    for (const sortMode of ['field', 'manual', undefined] as const) {
      expect(kanbanBoardCapabilities({ movable: false, sortMode })).toEqual({
        canMoveAcrossGroups: false,
        canReorderWithinGroup: false,
      });
    }
  });
});

describe('kanbanColumnAllowsCreate', () => {
  const base = { groupBy: 'status', myTaskScope: false };

  it('offers create on the backlog column of store and work-query boards', () => {
    expect(kanbanColumnAllowsCreate({ ...base, columnKey: 'backlog' })).toBe(true);
    // Team boards render `wf:`-prefixed columns — matching only the raw
    // 'backlog' key silently removed their create entry.
    expect(
      kanbanColumnAllowsCreate({
        ...base,
        columnKey: 'wf:backlog',
        createContext: { teamId: 'team-1' },
        external: true,
      }),
    ).toBe(true);
  });

  it('refuses create on non-backlog columns and non-status groupings', () => {
    expect(kanbanColumnAllowsCreate({ ...base, columnKey: 'in_progress' })).toBe(false);
    expect(
      kanbanColumnAllowsCreate({
        ...base,
        columnKey: 'wf:in_progress',
        createContext: { teamId: 'team-1' },
        external: true,
      }),
    ).toBe(false);
    expect(kanbanColumnAllowsCreate({ ...base, columnKey: 'backlog', groupBy: 'assignee' })).toBe(
      false,
    );
  });

  it('refuses create in my-task scope and on external boards without a team context', () => {
    expect(kanbanColumnAllowsCreate({ ...base, columnKey: 'backlog', myTaskScope: true })).toBe(
      false,
    );
    expect(kanbanColumnAllowsCreate({ ...base, columnKey: 'wf:backlog', external: true })).toBe(
      false,
    );
    expect(
      kanbanColumnAllowsCreate({
        ...base,
        columnKey: 'wf:backlog',
        createContext: { teamOptions: [{ id: 'team-1', name: 'Team' }] },
        external: true,
      }),
    ).toBe(true);
  });
});
