import type { TaskWorkflowCategory, TeamWorkflowStateItem } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import { WORKFLOW_CATEGORY_VISUALS } from '@/components/ExecutionStatus';
import type { TaskGroupItem, TaskListItem } from '@/store/task/slices/list/initialState';

import { kanbanColumnPagingAction } from './kanbanBoardModel';
import {
  buildKanbanColumnMap,
  buildKanbanColumns,
  buildKanbanGroupQuery,
  canDropTaskIntoKanbanColumn,
  COLUMN_I18N_KEYS,
  COLUMN_STATUS_VISUAL,
  computeKanbanPosition,
  effectiveTaskPosition,
  externalKanbanTaskPatch,
  externalVisibleKanbanColumns,
  findKanbanColumn,
  getKanbanAssigneeUpdate,
  getKanbanColumnHeaderVariant,
  getKanbanMoveAnchors,
  getKanbanTaskPatch,
  ISSUE_WORKFLOW_COLUMNS,
  issueStatusChoices,
  issueWorkflowStateChoices,
  kanbanBoardCapabilities,
  kanbanColumnAllowsCreate,
  kanbanColumnCreatePreset,
  type KanbanColumnDefinition,
  kanbanColumnForWorkflowCategory,
  kanbanColumnMoveScope,
  kanbanCreateTaskProjectId,
  normalizeKanbanGroupBy,
  placeKanbanCardInColumn,
  preserveKanbanColumnOrder,
  RAW_STATUS_KANBAN_COLUMNS,
  resolveKanbanDragTask,
  resolveKanbanDropColumn,
  taskKanbanColumnKey,
  taskMatchesKanbanColumn,
  taskStatusBoardColumnKey,
  taskStatusChoiceIsCurrent,
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
    // A stored 'milestone' pick travels here too — the board has no milestone
    // columns, so it lands on the same status fallback as 'none'.
    expect(normalizeKanbanGroupBy('milestone')).toBe('status');
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

  it('allows legacy private tasks to be dropped into any workspace member column', () => {
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
    expect(canDropTaskIntoKanbanColumn(privateTask, 'member', otherMemberColumn)).toBe(true);
  });

  describe('Issue workflow columns', () => {
    it('is exactly the seven workflow categories — no execution-status folds', () => {
      // The Issue board's membership is workflowCategory only: there is no
      // needsInput (paused+failed) or running (running+scheduled) bucket,
      // and no `st:` column.
      expect(ISSUE_WORKFLOW_COLUMNS.map((column) => column.key)).toEqual([
        'triage',
        'backlog',
        'todo',
        'in_progress',
        'in_review',
        'done',
        'canceled',
      ]);
      for (const column of ISSUE_WORKFLOW_COLUMNS) {
        expect(column.droppable).toBe(true);
        expect(column.targetStatus).toBeNull();
        expect(column.targetWorkflowCategory).toBe(column.key);
        expect(column.workflowCategories).toEqual([column.key]);
      }
    });

    it('keeps the raw execution columns only for the work-query `st:` Runs view', () => {
      expect(RAW_STATUS_KANBAN_COLUMNS.map((column) => column.key)).toEqual([
        'st:backlog',
        'st:scheduled',
        'st:running',
        'st:paused',
        'st:failed',
        'st:completed',
        'st:canceled',
      ]);
      for (const column of RAW_STATUS_KANBAN_COLUMNS) {
        expect(column.targetStatus).toBe(column.key.slice(3));
        expect(column.workflowCategories).toBeUndefined();
      }
    });

    it('buckets every task by workflowCategory — the legacy status never picks a column', () => {
      const failedExecution = task('exec', null, null, { status: 'failed' });
      const inReview = task('review', null, null, {
        status: 'paused',
        workflowCategory: 'in_review',
        workflowStateId: 'linear-state-review',
      });
      const linkedDone = task('linked', null, null, {
        status: 'paused',
        workflowCategory: 'done',
        workflowStateId: 'linear-state-done',
      });

      // No workflow state yet → the category bucket, never the execution fold.
      expect(taskKanbanColumnKey(failedExecution, 'status')).toBe('backlog');
      expect(taskKanbanColumnKey(inReview, 'status')).toBe('in_review');
      expect(taskKanbanColumnKey(linkedDone, 'status')).toBe('done');
      expect(taskMatchesKanbanColumn(linkedDone, 'status', 'in_review')).toBe(false);
    });

    it('writes only the workflow category on a column drop — never the legacy status', () => {
      const inReview = kanbanColumnForWorkflowCategory('in_review')!;
      const legacyTask = task('legacy');

      expect(canDropTaskIntoKanbanColumn(legacyTask, 'status', inReview)).toBe(true);
      expect(getKanbanTaskPatch('status', inReview)).toEqual({
        workflowCategory: 'in_review',
      });
    });

    it('treats an in-review task dropped back on its column as already inside', () => {
      const reviewTask = task('1', null, null, {
        status: 'paused',
        workflowCategory: 'in_review',
      });

      expect(taskMatchesKanbanColumn(reviewTask, 'status', 'in_review')).toBe(true);
      expect(taskMatchesKanbanColumn(reviewTask, 'status', 'backlog')).toBe(false);
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

    // Three-state projectId contract — `undefined` = unscoped, `null` = the
    // "No project" chip, a string = that project — across every board scope.
    // `null` must reach the query (the fetch keys a `:no-project` list for
    // it); a truthiness test would silently widen it to the unscoped query.
    it.each<{
      expected: ReturnType<typeof buildKanbanGroupQuery>;
      input: Parameters<typeof buildKanbanGroupQuery>[0];
      name: string;
    }>([
      {
        expected: { allAgents: true, automated: false, groupBy: 'status' },
        input: { groupBy: 'status' },
        name: 'global board, no project filter',
      },
      {
        expected: { automated: false, groupBy: 'status', projectId: null },
        input: { groupBy: 'status', projectId: null },
        name: 'global board keeps the No-project chip',
      },
      {
        expected: { automated: false, groupBy: 'status', projectId: 'proj_1' },
        input: { groupBy: 'status', projectId: 'proj_1' },
        name: 'project board',
      },
      {
        expected: { agentId: 'agt_1', automated: false, groupBy: 'status' },
        input: { agentId: 'agt_1', groupBy: 'status' },
        name: 'agent board, no project filter',
      },
      {
        // The project filter wins over agentId — the same precedence
        // `useFetchTaskGroupList` applies when deriving its list key.
        expected: { automated: false, groupBy: 'status', projectId: null },
        input: { agentId: 'agt_1', groupBy: 'status', projectId: null },
        name: 'agent board keeps the No-project chip',
      },
      {
        expected: { automated: false, groupBy: 'status', projectId: 'proj_1' },
        input: { agentId: 'agt_1', groupBy: 'status', projectId: 'proj_1' },
        name: 'project filter wins over agent board',
      },
      {
        expected: { groupBy: 'status', scope: 'assigned' },
        input: { groupBy: 'status', myTaskScope: 'assigned' },
        name: 'My tasks board, no project filter',
      },
      {
        expected: { groupBy: 'status', projectId: null, scope: 'delegated' },
        input: { groupBy: 'status', myTaskScope: 'delegated', projectId: null },
        name: 'My tasks board keeps the No-project chip',
      },
      {
        expected: { groupBy: 'status', projectId: 'proj_1', scope: 'created' },
        input: { groupBy: 'status', myTaskScope: 'created', projectId: 'proj_1' },
        name: 'My tasks board composes scope and project',
      },
    ])('builds the scoped query for $name', ({ expected, input }) => {
      expect(buildKanbanGroupQuery(input)).toEqual({
        excludeStatuses: undefined,
        ...expected,
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
    const defs = new Map(ISSUE_WORKFLOW_COLUMNS.map((column) => [column.key, column]));
    const keys = new Set(ISSUE_WORKFLOW_COLUMNS.map((column) => column.key));

    it('commits to the release column, not the mirror’s parked preview slot', () => {
      // Regression: the card previewed onto `done`, then the pointer moved to
      // `backlog` — the drop must write `backlog`, not the stale preview.
      const columns = { backlog: [], done: ['T-1'], in_progress: [] };
      expect(resolveKanbanDropColumn(task('1'), 'status', columns, 'backlog', keys, defs)).toBe(
        'backlog',
      );
    });

    it('rejects a release over a column with no workflow-category target', () => {
      // A column that is not an Issue column (no workflowCategory target) is
      // never a drop target on the Issue board — the preview move is ignored.
      const ghost: KanbanColumnDefinition = {
        droppable: true,
        key: 'ghost',
        targetStatus: 'paused',
      };
      const columns = { backlog: [], done: [], ghost: ['T-1'] };
      const ghostDefs = new Map([...defs, ['ghost', ghost] as const]);
      const ghostKeys = new Set([...keys, 'ghost']);
      expect(
        resolveKanbanDropColumn(task('1'), 'status', columns, 'ghost', ghostKeys, ghostDefs),
      ).toBeNull();
    });

    it('keeps a same-column reorder legal', () => {
      // Reordering a member writes position only — membership is checked
      // before the drop rules.
      const columns = { in_progress: ['T-1', 'T-2'] };
      expect(
        resolveKanbanDropColumn(
          task('1', undefined, undefined, { workflowCategory: 'in_progress' }),
          'status',
          columns,
          'T-2',
          keys,
          defs,
        ),
      ).toBe('in_progress');
    });

    it('returns null when the release is outside every column', () => {
      const columns = { backlog: ['T-1'] };
      expect(resolveKanbanDropColumn(task('1'), 'status', columns, 'bogus', keys, defs)).toBeNull();
    });
  });

  describe('kanbanColumnMoveScope', () => {
    it('scopes an Issue column by its workflow category only', () => {
      const column = kanbanColumnForWorkflowCategory('in_review')!;
      expect(kanbanColumnMoveScope('status', column)).toEqual({
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

  it('offers create on every column of a status-grouped board (Linear per-column +)', () => {
    expect(kanbanColumnAllowsCreate({ ...base, columnKey: 'in_progress' })).toBe(true);
    expect(
      kanbanColumnAllowsCreate({
        ...base,
        columnKey: 'wf:in_progress',
        createContext: { teamId: 'team-1' },
        external: true,
      }),
    ).toBe(true);
    expect(kanbanColumnAllowsCreate({ ...base, columnKey: 'backlog', groupBy: 'assignee' })).toBe(
      false,
    );
  });

  it('presets the clicked column dimension on the created issue', () => {
    // The bare Issue columns create in the canonical Issue Status — never the
    // legacy execution projection; only a `st:` Runs-view column still presets
    // `status`.
    expect(kanbanColumnCreatePreset('backlog')).toEqual({ workflowCategory: 'backlog' });
    expect(kanbanColumnCreatePreset('wf:in_progress')).toEqual({
      workflowCategory: 'in_progress',
    });
    expect(kanbanColumnCreatePreset('st:paused')).toEqual({ status: 'paused' });
    expect(kanbanColumnCreatePreset('pr:2')).toEqual({ priority: 2 });
    expect(kanbanColumnCreatePreset('as:none')).toEqual({ assigneeUserId: null });
    expect(kanbanColumnCreatePreset('ag:agt_1')).toEqual({ assigneeAgentId: 'agt_1' });
    expect(
      externalKanbanTaskPatch('agent', { droppable: true, key: 'ag:none', targetStatus: null }),
    ).toEqual({
      assigneeAgentId: null,
    });
    expect(kanbanColumnCreatePreset(`wf:todo${'\u001F'}pj:proj_1`)).toEqual({
      projectId: 'proj_1',
      workflowCategory: 'todo',
    });
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

describe('externalVisibleKanbanColumns', () => {
  const columns: KanbanColumnDefinition[] = ['wf:todo', 'wf:in_progress', 'wf:done'].map((key) => ({
    droppable: true,
    key,
    targetStatus: null,
  }));

  it('keeps only columns whose group carries tasks — empty and unreturned groups hide', () => {
    const visible = externalVisibleKanbanColumns(columns, [
      group('wf:todo', [task('1')]),
      group('wf:done', []),
    ]);
    expect(visible.map((column) => column.key)).toEqual(['wf:todo']);
  });

  it('counts paged groups by total, not by the loaded page length', () => {
    const paged = group('wf:todo', [task('1')]);
    paged.total = 40;
    const visible = externalVisibleKanbanColumns(columns, [paged]);
    expect(visible.map((column) => column.key)).toEqual(['wf:todo']);
  });

  it('keeps every column when the whole board is empty', () => {
    const visible = externalVisibleKanbanColumns(columns, [
      group('wf:todo', []),
      group('wf:done', []),
    ]);
    expect(visible.map((column) => column.key)).toEqual(columns.map((column) => column.key));
    expect(externalVisibleKanbanColumns(columns, [])).toEqual(columns);
  });
});

/**
 * The Issue status pickers (task detail rail, row glyphs, card context
 * menus, bulk bar, command palette) read the board's own columns through
 * `issueStatusChoices` — workflow categories only, 1:1 with the board:
 * same options, order, labels and icons. Execution statuses are never a
 * user pick (run state is read-only).
 */
describe('board-driven Issue status choices', () => {
  it('mirrors the Issue board columns 1:1 — same options, order, labels and glyphs', () => {
    const choices = issueStatusChoices();
    expect(choices.map((choice) => choice.column.key)).toEqual(
      ISSUE_WORKFLOW_COLUMNS.map((column) => column.key),
    );
    // triage leads — the column a hardcoded status list used to miss.
    expect(choices[0].column.key).toBe('triage');
    for (const choice of choices) {
      expect(COLUMN_I18N_KEYS[choice.column.key]).toBeTruthy();
      // The glyph a menu paints is the one the board header paints.
      expect(WORKFLOW_CATEGORY_VISUALS[choice.column.targetWorkflowCategory ?? 'backlog']).toBe(
        COLUMN_STATUS_VISUAL[choice.column.key],
      );
    }
  });

  it('makes every row a workflow move — execution statuses never appear', () => {
    const choices = issueStatusChoices();
    expect(choices.every((choice) => Boolean(choice.workflowCategory))).toBe(true);
    expect(choices.every((choice) => !('status' in choice))).toBe(true);
    // Linked or not, every column is pickable — an unlinked task's category
    // write goes through the same CAS path a drop does.
    expect(choices[0]).toMatchObject({
      column: { key: 'triage' },
      workflowCategory: 'triage',
    });
  });

  it('check-marks the board column the task sits in — by workflow category', () => {
    expect(taskStatusBoardColumnKey({ workflowCategory: 'in_review' })).toBe('in_review');
    expect(taskStatusBoardColumnKey({ workflowCategory: 'triage' })).toBe('triage');
    // An uncategorized task check-marks backlog regardless of its run state.
    expect(taskStatusBoardColumnKey({})).toBe('backlog');
    expect(taskStatusBoardColumnKey({ workflowCategory: 'in_progress' })).toBe('in_progress');
  });
});

describe('issueWorkflowStateChoices', () => {
  const state = (
    id: string,
    category: TaskWorkflowCategory,
    overrides: Partial<TeamWorkflowStateItem> = {},
  ): TeamWorkflowStateItem => ({
    category,
    id,
    name: `State ${id}`,
    position: 0,
    remoteStateId: null,
    teamId: 'team-1',
    workspaceId: 'ws-1',
    ...overrides,
  });

  it('orders rows by the board category order then catalog position', () => {
    const choices = issueWorkflowStateChoices([
      state('todo-b', 'todo', { position: 5 }),
      state('canceled-a', 'canceled'),
      state('todo-a', 'todo', { position: 1 }),
      state('triage-a', 'triage'),
    ]);
    expect(choices.map((choice) => choice.state?.id)).toEqual([
      'triage-a',
      'todo-a',
      'todo-b',
      'canceled-a',
    ]);
  });

  it('carries the shared model — ref id and category — on every row', () => {
    const choices = issueWorkflowStateChoices([state('tw-1', 'in_progress')]);
    expect(choices).toHaveLength(1);
    expect(choices[0].state?.id).toBe('tw-1');
    expect(choices[0].workflowCategory).toBe('in_progress');
    // The wf: column resolves the same moveBoard targetKey a category drop would.
    expect(choices[0].column.targetWorkflowCategory).toBe('in_progress');
    expect('status' in choices[0]).toBe(false);
  });

  it('keeps two custom states in one category individually pickable', () => {
    const choices = issueWorkflowStateChoices([
      state('doing', 'in_progress'),
      state('paused-waiting', 'in_progress'),
    ]);
    expect(choices).toHaveLength(2);
    expect(new Set(choices.map((choice) => choice.state?.id)).size).toBe(2);
    expect(choices.every((choice) => choice.workflowCategory === 'in_progress')).toBe(true);
  });
});

describe('taskStatusChoiceIsCurrent', () => {
  const state = (
    id: string,
    overrides: Partial<TeamWorkflowStateItem> = {},
  ): TeamWorkflowStateItem => ({
    category: 'todo',
    id,
    name: `State ${id}`,
    position: 0,
    remoteStateId: null,
    teamId: 'team-1',
    workspaceId: 'ws-1',
    ...overrides,
  });
  const columnChoice = issueWorkflowStateChoices([state('a')])[0];

  it('matches a state row by internal ref or provider id', () => {
    const choice = { ...columnChoice, state: state('tws_1', { remoteStateId: 'ls-1' }) };
    expect(taskStatusChoiceIsCurrent({ workflowStateRefId: 'tws_1' }, choice, 'other')).toBe(true);
    expect(taskStatusChoiceIsCurrent({ workflowStateId: 'ls-1' }, choice, 'other')).toBe(true);
    expect(
      taskStatusChoiceIsCurrent(
        { workflowStateId: 'ls-2', workflowStateRefId: 'tws_2' },
        choice,
        'other',
      ),
    ).toBe(false);
  });

  it('never treats a sibling state in the same category as current', () => {
    const current = { ...columnChoice, state: state('tws_1') };
    const sibling = { ...columnChoice, state: state('tws_2') };
    const task = { workflowStateRefId: 'tws_1' };
    expect(taskStatusChoiceIsCurrent(task, current, 'todo')).toBe(true);
    expect(taskStatusChoiceIsCurrent(task, sibling, 'todo')).toBe(false);
  });

  it('falls back to the column bucket for category rows', () => {
    const choice = issueStatusChoices()[0];
    expect(choice.state).toBeUndefined();
    expect(taskStatusChoiceIsCurrent({}, choice, choice.column.key)).toBe(true);
    expect(taskStatusChoiceIsCurrent({}, choice, 'elsewhere')).toBe(false);
  });
});

describe('column paging recovery', () => {
  it('offers the list when an internal column reaches its server limit', () => {
    expect(kanbanColumnPagingAction({ atLimit: true, external: false })).toBe('viewAll');
    expect(kanbanColumnPagingAction({ atLimit: false, external: false })).toBe('loadMore');
  });

  it('does not cap externally paginated cursor boards', () => {
    expect(kanbanColumnPagingAction({ atLimit: true, external: true })).toBe('loadMore');
  });
});
