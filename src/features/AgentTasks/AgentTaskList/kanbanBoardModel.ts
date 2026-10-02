import { closestCenter, type CollisionDetection, pointerWithin } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import {
  prefixWorkQueryBoardKey,
  rawWorkQueryBoardKey,
  type TaskMoveScope,
  type TaskStatus,
  type TaskWorkflowCategory,
  type TeamWorkflowStateItem,
  WORK_QUERY_BOARD_KEY_SEP,
  WORK_QUERY_BOARD_NONE_KEY,
  WORK_QUERY_PRIORITY_KEYS,
  WORK_QUERY_STATUS_COLUMNS,
  WORK_QUERY_WORKFLOW_COLUMNS,
  type WorkQueryBoardAxis,
  workQueryBoardAxisOfKey,
  type WorkQuerySortMode,
} from '@orvilo/types';
import { cssVar } from 'antd-style';
import { CircleAlert, OctagonAlert } from 'lucide-react';

import {
  type StatusVisual,
  TASK_STATUS_VISUALS,
  WORKFLOW_CATEGORY_VISUALS,
} from '@/components/ExecutionStatus';
import type {
  TaskGroupItem,
  TaskKanbanGroupBy,
  TaskListItem,
} from '@/store/task/slices/list/initialState';

import type { TaskGroupBy, TaskGroupMeta } from './listViewOptions';
import {
  effectiveTaskPosition,
  getTaskAssigneeGroupMeta,
  getTaskGroupMeta,
  getTaskMemberGroupMeta,
  getTaskPriorityGroupMeta,
  sortGroupEntries,
} from './listViewOptions';

// The position helper now lives with the other view-option primitives (the
// "Manual" list ordering reads it too); re-export keeps existing imports here.
export { effectiveTaskPosition };

export interface KanbanColumnDefinition {
  droppable: boolean;
  groupMeta?: TaskGroupMeta;
  key: string;
  targetStatus: TaskStatus | null;
  targetWorkflowCategory?: TaskWorkflowCategory;
  workflowCategories?: TaskWorkflowCategory[];
}

export interface KanbanAssigneeUpdate {
  assigneeAgentId?: string | null;
  assigneeUserId?: string | null;
}

export type KanbanColumnHeaderVariant = 'fallback' | 'group' | 'loading';

export const getKanbanColumnHeaderVariant = ({
  hasGroupMeta,
  loading,
}: {
  hasGroupMeta: boolean;
  loading?: boolean;
}): KanbanColumnHeaderVariant => {
  if (loading) return 'loading';
  return hasGroupMeta ? 'group' : 'fallback';
};

/**
 * The Issue board's columns — one per workflow category, nothing else. Issue
 * Status is `workflowCategory`/`workflowStateRefId`, full stop: execution
 * run states never fold into columns (`in_progress` is one column, not a
 * running+scheduled bucket; `in_review` is one column, not a paused+failed
 * bucket). A Runs view grouping by raw execution state is the work-query
 * `st:` axis ({@link RAW_STATUS_KANBAN_COLUMNS}), not this board.
 */
export const ISSUE_WORKFLOW_COLUMNS: KanbanColumnDefinition[] = WORK_QUERY_WORKFLOW_COLUMNS.map(
  (category) => ({
    droppable: true,
    key: category,
    targetStatus: null,
    targetWorkflowCategory: category,
    workflowCategories: [category],
  }),
);

/** The Issue column a workflow category targets. */
export const kanbanColumnForWorkflowCategory = (
  category: TaskWorkflowCategory,
): KanbanColumnDefinition | undefined =>
  ISSUE_WORKFLOW_COLUMNS.find((column) => column.targetWorkflowCategory === category);

export const normalizeKanbanGroupBy = (groupBy: TaskGroupBy): TaskKanbanGroupBy =>
  groupBy === 'assignee' || groupBy === 'member' || groupBy === 'priority' ? groupBy : 'status';

export interface KanbanGroupQueryInput {
  agentId?: string;
  excludeStatuses?: readonly TaskStatus[];
  groupBy: TaskKanbanGroupBy;
  /**
   * Set on the "My tasks" board; mutually exclusive with the other scopes.
   * 'delegated' = tasks the caller delegated to agents (active grant).
   */
  myTaskScope?: 'assigned' | 'created' | 'delegated';
  /** `null` narrows to tasks with no project — the "No project" chip. */
  projectId?: string | null;
}

export interface KanbanGroupQuery {
  agentId?: string;
  allAgents?: boolean;
  automated?: boolean;
  excludeStatuses?: readonly TaskStatus[];
  groupBy: TaskKanbanGroupBy;
  projectId?: string | null;
  scope?: 'assigned' | 'created' | 'delegated';
}

/**
 * The grouped query one board runs, picked from the scope it was mounted with.
 *
 * Every board except "My tasks" pins `automated: false`, keeping the tasks that
 * still fire on their own out of the columns — they belong to the scheduled
 * roll-up. "My tasks" deliberately sends no automation filter, because its list
 * view sends none either: filtering only on the board side would make the
 * caller's scheduled and heartbeat tasks vanish on the list -> board switch of
 * one and the same collection.
 */
export const buildKanbanGroupQuery = ({
  agentId,
  excludeStatuses,
  groupBy,
  myTaskScope,
  projectId,
}: KanbanGroupQueryInput): KanbanGroupQuery => {
  // A project filter (id or `null` = "No project") composes with the "My
  // tasks" scope — My Work's chip narrows the caller's slice, not the board.
  if (myTaskScope) return { excludeStatuses, groupBy, projectId, scope: myTaskScope };
  // `projectId` is a three-state filter: `undefined` = unscoped, `null` =
  // the "No project" chip, a string = that project. The test is `!== undefined`,
  // not truthiness — `null` must reach the fetch (it keys the no-project list)
  // instead of silently widening the query to the agent / all-agents scope.
  // The project filter takes precedence over `agentId` here too, matching how
  // `useFetchTaskGroupList` derives its list key.
  if (projectId !== undefined) {
    return { automated: false, excludeStatuses, groupBy, projectId };
  }
  if (agentId) return { agentId, automated: false, excludeStatuses, groupBy };

  return { allAgents: true, automated: false, excludeStatuses, groupBy };
};

/**
 * Create-task only accepts a concrete project id. `null` is the board's
 * "No project" filter and must not be forwarded as a locked project.
 */
export const kanbanCreateTaskProjectId = (projectId?: string | null): string | undefined =>
  projectId ?? undefined;

export const buildKanbanColumns = (
  taskGroups: TaskGroupItem[],
  groupBy: TaskKanbanGroupBy,
): KanbanColumnDefinition[] => {
  if (groupBy === 'status') return ISSUE_WORKFLOW_COLUMNS;

  const groupEntries = taskGroups.map((group) => {
    const meta =
      groupBy === 'assignee'
        ? getTaskAssigneeGroupMeta(group.assigneeAgentId)
        : groupBy === 'member'
          ? getTaskMemberGroupMeta(group.assigneeUserId)
          : getTaskPriorityGroupMeta(group.priority);
    return [meta, group.tasks as TaskListItem[]] as [TaskGroupMeta, TaskListItem[]];
  });

  return sortGroupEntries(groupEntries, groupBy).map(([groupMeta]) => ({
    droppable: true,
    groupMeta,
    key: groupMeta.key,
    targetStatus: null,
  }));
};

/**
 * Work-query board columns — one column per business workflow category, the
 * `wf:` prefix keeps the key space apart from the execution-status columns
 * the task store boards use. `in_review` is its own column here; it never
 * folds into a run-state bucket.
 */
export const WORKFLOW_KANBAN_COLUMNS: KanbanColumnDefinition[] = WORK_QUERY_WORKFLOW_COLUMNS.map(
  (category) => ({
    droppable: true,
    key: `wf:${category}`,
    targetStatus: null,
    targetWorkflowCategory: category,
    workflowCategories: [category],
  }),
);

/** Same for raw execution-status groups — `st:` columns keep `paused` and
 * `failed` (and `scheduled` vs `running`) visibly distinct. */
export const RAW_STATUS_KANBAN_COLUMNS: KanbanColumnDefinition[] = WORK_QUERY_STATUS_COLUMNS.map(
  (status) => ({
    droppable: true,
    key: `st:${status}`,
    targetStatus: status,
    workflowCategories: undefined,
  }),
);

export type WorkQueryBoardGroupBy = WorkQueryBoardAxis;

export const PRIORITY_KANBAN_COLUMNS: KanbanColumnDefinition[] = WORK_QUERY_PRIORITY_KEYS.map(
  (key) => {
    const columnKey = prefixWorkQueryBoardKey('priority', key);
    return {
      droppable: true,
      groupMeta: { ...getTaskPriorityGroupMeta(Number(key)), key: columnKey },
      key: columnKey,
      targetStatus: null,
    };
  },
);

export interface KanbanBoardCapabilities {
  canMoveAcrossGroups: boolean;
  canReorderWithinGroup: boolean;
}

/**
 * Drag capabilities for an external (work-query) board. A `manual` sortMode
 * board owns its row order, so same-column drops may persist `position`.
 * A field-sorted view must never write manual position — same-column drops
 * are refused while cross-column moves stay legal, since they only change
 * the grouped field's value. `movable === false` disables both.
 */
export const kanbanBoardCapabilities = (input: {
  movable?: boolean;
  sortMode?: WorkQuerySortMode;
}): KanbanBoardCapabilities => {
  const movable = input.movable ?? true;
  return {
    canMoveAcrossGroups: movable,
    canReorderWithinGroup: movable && (input.sortMode ?? 'manual') === 'manual',
  };
};

export const externalKanbanColumns = (groupBy: WorkQueryBoardGroupBy): KanbanColumnDefinition[] => {
  if (groupBy === 'workflowCategory') return WORKFLOW_KANBAN_COLUMNS;
  if (groupBy === 'status') return RAW_STATUS_KANBAN_COLUMNS;
  if (groupBy === 'priority') return PRIORITY_KANBAN_COLUMNS;
  // Assignee and project columns exist only for keys the query returned.
  return [];
};

/** Column definition for one prefixed board key (`wf:done`, `pr:1`, `as:none`, …). */
export const columnDefForBoardKey = (key: string): KanbanColumnDefinition => {
  const axis = workQueryBoardAxisOfKey(key);
  const raw = rawWorkQueryBoardKey(key);
  if (axis === 'workflowCategory') {
    return {
      droppable: true,
      key,
      targetStatus: null,
      targetWorkflowCategory: raw as TaskWorkflowCategory,
      workflowCategories: [raw as TaskWorkflowCategory],
    };
  }
  if (axis === 'status') {
    return { droppable: true, key, targetStatus: raw as TaskStatus };
  }
  if (axis === 'priority') {
    return {
      droppable: true,
      groupMeta: { ...getTaskPriorityGroupMeta(Number(raw)), key },
      key,
      targetStatus: null,
    };
  }
  if (axis === 'assignee') {
    const meta = getTaskMemberGroupMeta(raw === WORK_QUERY_BOARD_NONE_KEY ? null : raw);
    return { droppable: true, groupMeta: { ...meta, key }, key, targetStatus: null };
  }
  if (axis === 'agent') {
    const meta = getTaskAssigneeGroupMeta(raw === WORK_QUERY_BOARD_NONE_KEY ? null : raw);
    return { droppable: true, groupMeta: { ...meta, key }, key, targetStatus: null };
  }
  return {
    droppable: true,
    groupMeta: {
      groupBy: 'none',
      key,
      label: raw === WORK_QUERY_BOARD_NONE_KEY ? '' : raw,
    },
    key,
    targetStatus: null,
  };
};

export const parseBoardCellKey = (key: string): { columnKey: string; laneKey?: string } => {
  const index = key.indexOf(WORK_QUERY_BOARD_KEY_SEP);
  if (index === -1) return { columnKey: key };
  return { columnKey: key.slice(0, index), laneKey: key.slice(index + 1) };
};

export const boardCellKey = (columnKey: string, laneKey: string): string =>
  `${columnKey}${WORK_QUERY_BOARD_KEY_SEP}${laneKey}`;

/**
 * Visual columns for a work-query board. Fixed axes (status, workflow,
 * priority) keep their full set; assignee/project columns are the distinct
 * column halves of the returned groups.
 */
export const externalBoardColumns = (
  groupBy: WorkQueryBoardGroupBy,
  groups: readonly { key: string }[],
): KanbanColumnDefinition[] => {
  const fixed = externalKanbanColumns(groupBy);
  if (fixed.length > 0) {
    const covered = new Set(fixed.map((column) => column.key));
    const extras: KanbanColumnDefinition[] = [];
    for (const group of groups) {
      const columnKey = parseBoardCellKey(group.key).columnKey;
      if (covered.has(columnKey)) continue;
      covered.add(columnKey);
      extras.push({ ...columnDefForBoardKey(columnKey), droppable: false });
    }
    return [...fixed, ...extras];
  }
  const seen = new Set<string>();
  const columns: KanbanColumnDefinition[] = [];
  for (const group of groups) {
    const columnKey = parseBoardCellKey(group.key).columnKey;
    if (seen.has(columnKey)) continue;
    seen.add(columnKey);
    columns.push(columnDefForBoardKey(columnKey));
  }
  return columns;
};

/** Swimlane headers. Finite axes use their canonical columns; the rest follow the groups. */
export const externalBoardLanes = (
  laneAxis: WorkQueryBoardGroupBy | undefined,
  groups: readonly { key: string }[],
): KanbanColumnDefinition[] => {
  if (!laneAxis) return [];
  const fixed = externalKanbanColumns(laneAxis);
  if (fixed.length > 0) return fixed;
  const seen = new Set<string>();
  const lanes: KanbanColumnDefinition[] = [];
  for (const group of groups) {
    const laneKey = parseBoardCellKey(group.key).laneKey;
    if (!laneKey || seen.has(laneKey)) continue;
    seen.add(laneKey);
    lanes.push(columnDefForBoardKey(laneKey));
  }
  return lanes;
};

export const COLUMN_I18N_KEYS: Record<string, string> = {
  'backlog': 'taskList.kanban.backlog',
  'blocking': 'taskList.attention.blocking',
  'canceled': 'taskList.kanban.canceled',
  'done': 'taskList.kanban.done',
  'in_progress': 'taskList.kanban.inProgress',
  'in_review': 'taskList.kanban.inReview',
  'st:backlog': 'taskList.kanban.backlog',
  'st:canceled': 'taskList.kanban.canceled',
  'st:completed': 'taskList.kanban.done',
  'st:failed': 'taskList.kanban.failed',
  'st:paused': 'taskList.kanban.paused',
  'st:running': 'taskList.kanban.running',
  'st:scheduled': 'taskList.kanban.scheduled',
  'todo': 'taskList.kanban.todo',
  'triage': 'taskList.kanban.triage',
  'urgent': 'taskList.attention.urgent',
  'wf:backlog': 'taskList.kanban.backlog',
  'wf:canceled': 'taskList.kanban.canceled',
  'wf:done': 'taskList.kanban.done',
  'wf:in_progress': 'taskList.kanban.inProgress',
  'wf:in_review': 'taskList.kanban.inReview',
  'wf:todo': 'taskList.kanban.todo',
  'wf:triage': 'taskList.kanban.triage',
};

/**
 * Per-column header glyphs. Workflow-category columns — the merged status
 * board's buckets and the `wf:` work-query columns — read
 * `WORKFLOW_CATEGORY_VISUALS` so a header never disagrees with the category
 * badge on its cards. `st:` keys keep the raw execution-status family for
 * status-grouped surfaces; attention buckets (`urgent`/`blocking`) are not
 * statuses and keep their own marks.
 */
export const COLUMN_STATUS_VISUAL: Record<string, StatusVisual> = {
  // Attention buckets (Linear My issues) are not execution statuses — urgent
  // keeps the app's urgent glyph, blocking the stop-marked one.
  'blocking': { color: cssVar.colorError, icon: OctagonAlert },
  'urgent': { color: cssVar.orange, icon: CircleAlert },
  // The Issue board's columns are the workflow categories — the header reads
  // the same canonical map the card's status mark uses.
  'backlog': WORKFLOW_CATEGORY_VISUALS.backlog,
  'canceled': WORKFLOW_CATEGORY_VISUALS.canceled,
  'done': WORKFLOW_CATEGORY_VISUALS.done,
  'in_progress': WORKFLOW_CATEGORY_VISUALS.in_progress,
  'in_review': WORKFLOW_CATEGORY_VISUALS.in_review,
  'todo': WORKFLOW_CATEGORY_VISUALS.todo,
  'triage': WORKFLOW_CATEGORY_VISUALS.triage,
  // Raw execution-status columns (`st:`) — each run state keeps its own
  // glyph instead of merging into a shared column.
  'st:backlog': TASK_STATUS_VISUALS.backlog,
  'st:canceled': TASK_STATUS_VISUALS.canceled,
  'st:completed': TASK_STATUS_VISUALS.completed,
  'st:failed': TASK_STATUS_VISUALS.failed,
  'st:paused': TASK_STATUS_VISUALS.paused,
  'st:running': TASK_STATUS_VISUALS.running,
  'st:scheduled': TASK_STATUS_VISUALS.scheduled,
  // Work-query workflow columns (`wf:`) — same canonical map.
  'wf:backlog': WORKFLOW_CATEGORY_VISUALS.backlog,
  'wf:canceled': WORKFLOW_CATEGORY_VISUALS.canceled,
  'wf:done': WORKFLOW_CATEGORY_VISUALS.done,
  'wf:in_progress': WORKFLOW_CATEGORY_VISUALS.in_progress,
  'wf:in_review': WORKFLOW_CATEGORY_VISUALS.in_review,
  'wf:todo': WORKFLOW_CATEGORY_VISUALS.todo,
  'wf:triage': WORKFLOW_CATEGORY_VISUALS.triage,
};

/**
 * Linear parity: a work-query board hides a column whose group is empty —
 * the reference team-issues board only renders categories that hold issues.
 * Columns the query never returned count as empty too. A board where every
 * column is empty keeps all of them — the status-board contract still wants
 * its column chrome (and `+` pills) rather than a blank area.
 */
export const externalVisibleKanbanColumns = (
  columns: KanbanColumnDefinition[],
  taskGroups: Pick<TaskGroupItem, 'key' | 'total'>[],
): KanbanColumnDefinition[] => {
  const totals = new Map(taskGroups.map((group) => [group.key, group.total]));
  const visible = columns.filter((column) => (totals.get(column.key) ?? 0) > 0);
  return visible.length === 0 ? columns : visible;
};

/** The work-query group key a column represents — strips the axis prefix. */
export const workQueryKeyForKanbanColumn = (columnKey: string): string =>
  rawWorkQueryBoardKey(parseBoardCellKey(columnKey).columnKey);

/** The column a work-query task belongs in for the given grouping. */
export const externalTaskColumnKey = (
  task: Pick<
    TaskListItem,
    'assigneeAgentId' | 'assigneeUserId' | 'priority' | 'projectId' | 'status' | 'workflowCategory'
  >,
  groupBy: WorkQueryBoardGroupBy,
): string => {
  switch (groupBy) {
    case 'workflowCategory': {
      return prefixWorkQueryBoardKey('workflowCategory', task.workflowCategory ?? 'backlog');
    }
    case 'status': {
      return prefixWorkQueryBoardKey('status', task.status ?? 'backlog');
    }
    case 'priority': {
      return prefixWorkQueryBoardKey('priority', String(task.priority ?? 0));
    }
    case 'assignee': {
      return prefixWorkQueryBoardKey('assignee', task.assigneeUserId ?? WORK_QUERY_BOARD_NONE_KEY);
    }
    case 'agent': {
      return prefixWorkQueryBoardKey('agent', task.assigneeAgentId ?? WORK_QUERY_BOARD_NONE_KEY);
    }
    case 'project': {
      return prefixWorkQueryBoardKey('project', task.projectId ?? WORK_QUERY_BOARD_NONE_KEY);
    }
  }
};

/** Membership predicate for externally-supplied (work-query) columns and cells. */
export const taskMatchesExternalColumn = (
  task: TaskListItem,
  groupBy: WorkQueryBoardGroupBy,
  columnKey: string,
): boolean => {
  const parsed = parseBoardCellKey(columnKey);
  const columnAxis = workQueryBoardAxisOfKey(parsed.columnKey) ?? groupBy;
  if (externalTaskColumnKey(task, columnAxis) !== parsed.columnKey) return false;
  if (!parsed.laneKey) return true;
  const laneAxis = workQueryBoardAxisOfKey(parsed.laneKey);
  return laneAxis ? externalTaskColumnKey(task, laneAxis) === parsed.laneKey : false;
};

/** Drop-target rules for external columns: a work-query board accepts every
 * task in either dimension (status writes and workflow-category writes are
 * both legal on unlinked tasks). */
export const canDropTaskIntoExternalColumn = (
  _task: TaskListItem,
  column: KanbanColumnDefinition,
): boolean => column.droppable;

/** Fields a work-query drop may write. Kept narrower than `TaskListItem` so it
 * spreads into `taskService.update` without dragging unrelated card fields. */
export interface ExternalKanbanFieldPatch {
  assigneeAgentId?: string | null;
  assigneeUserId?: string | null;
  priority?: number;
  projectId?: string | null;
  status?: TaskStatus;
  workflowCategory?: TaskWorkflowCategory;
}

/** Card-override patch for one axis of a work-query drop. */
export const externalKanbanTaskPatch = (
  groupBy: WorkQueryBoardGroupBy,
  column: KanbanColumnDefinition,
): ExternalKanbanFieldPatch | undefined => {
  const axis = workQueryBoardAxisOfKey(column.key) ?? groupBy;
  const raw = rawWorkQueryBoardKey(column.key);
  switch (axis) {
    case 'workflowCategory': {
      return {
        workflowCategory: (column.targetWorkflowCategory ?? raw) as TaskWorkflowCategory,
      };
    }
    case 'status': {
      const status = (column.targetStatus ?? raw) as TaskStatus;
      return status ? { status } : undefined;
    }
    case 'priority': {
      const priority = Number(raw);
      return Number.isInteger(priority) ? { priority } : undefined;
    }
    case 'assignee': {
      return { assigneeUserId: raw === WORK_QUERY_BOARD_NONE_KEY ? null : raw };
    }
    case 'agent': {
      return { assigneeAgentId: raw === WORK_QUERY_BOARD_NONE_KEY ? null : raw };
    }
    case 'project': {
      return { projectId: raw === WORK_QUERY_BOARD_NONE_KEY ? null : raw };
    }
  }
};

/** Field patch for a cell, covering the column axis and the lane axis together. */
export const externalKanbanCellPatch = (cellKey: string): ExternalKanbanFieldPatch => {
  const parsed = parseBoardCellKey(cellKey);
  const stub = (key: string): KanbanColumnDefinition => ({
    droppable: true,
    key,
    targetStatus: null,
  });
  return {
    ...externalKanbanTaskPatch('status', stub(parsed.columnKey)),
    ...(parsed.laneKey ? externalKanbanTaskPatch('status', stub(parsed.laneKey)) : {}),
  };
};

const moveScopeForBoardKey = (key: string): TaskMoveScope => {
  const axis = workQueryBoardAxisOfKey(key);
  const raw = rawWorkQueryBoardKey(key);
  if (axis === 'workflowCategory') return { workflowCategories: [raw as TaskWorkflowCategory] };
  if (axis === 'status') return { statuses: [raw as TaskStatus] };
  if (axis === 'priority') return { priority: Number(raw) };
  if (axis === 'assignee') {
    return { assigneeUserId: raw === WORK_QUERY_BOARD_NONE_KEY ? null : raw };
  }
  if (axis === 'agent') {
    return { assigneeAgentId: raw === WORK_QUERY_BOARD_NONE_KEY ? null : raw };
  }
  return {};
};

/** Move scope for an external column or cell. Project lanes have no position scope. */
export const externalKanbanColumnMoveScope = (
  _groupBy: WorkQueryBoardGroupBy,
  column: KanbanColumnDefinition,
): TaskMoveScope | undefined => {
  const parsed = parseBoardCellKey(column.key);
  const columnScope = moveScopeForBoardKey(parsed.columnKey);
  const laneScope = parsed.laneKey ? moveScopeForBoardKey(parsed.laneKey) : {};
  const scope = { ...columnScope, ...laneScope };
  if (
    !scope.workflowCategories?.length &&
    !scope.statuses?.length &&
    scope.priority === undefined &&
    !('assigneeUserId' in scope) &&
    !('assigneeAgentId' in scope)
  ) {
    return undefined;
  }
  return scope;
};

/**
 * Board-column create gate. "My tasks" offers no create entry (its list view
 * has none either): a task created there carries neither the member
 * assignment nor — under `created` — any guarantee it lands in the column it
 * was started from. An external (work-query) board only shows it when the
 * caller declared where the card belongs.
 *
 * Every column on a status-grouped board offers `+` (Linear parity): the
 * clicked column's dimension value presets the new issue via
 * {@link kanbanColumnCreatePreset}.
 */
export const kanbanColumnAllowsCreate = (input: {
  columnKey: string;
  createContext?: { teamId?: string; teamOptions?: { id: string; name: string }[] };
  external?: boolean;
  groupBy: string;
  myTaskScope?: boolean;
}): boolean =>
  input.groupBy === 'status' &&
  !input.myTaskScope &&
  (!input.external ||
    Boolean(input.createContext?.teamId) ||
    (input.createContext?.teamOptions?.length ?? 0) > 0);

/**
 * The create preset a `+` click on a column carries — `wf:`/`st:` work-query
 * keys map back to their dimension, internal status columns to `status`.
 */
export const kanbanColumnCreatePreset = (
  columnKey: string,
): {
  assigneeAgentId?: string | null;
  assigneeUserId?: string | null;
  priority?: number;
  projectId?: string | null;
  status?: TaskStatus;
  workflowCategory?: TaskWorkflowCategory;
} => {
  const parsed = parseBoardCellKey(columnKey);
  const preset: ReturnType<typeof kanbanColumnCreatePreset> = {};
  const apply = (key: string) => {
    const axis = workQueryBoardAxisOfKey(key);
    const raw = rawWorkQueryBoardKey(key);
    if (axis === 'workflowCategory') preset.workflowCategory = raw as TaskWorkflowCategory;
    else if (axis === 'status') preset.status = raw as TaskStatus;
    else if (axis === 'priority') preset.priority = Number(raw);
    else if (axis === 'assignee') {
      preset.assigneeUserId = raw === WORK_QUERY_BOARD_NONE_KEY ? null : raw;
    } else if (axis === 'agent') {
      preset.assigneeAgentId = raw === WORK_QUERY_BOARD_NONE_KEY ? null : raw;
    } else if (axis === 'project') {
      preset.projectId = raw === WORK_QUERY_BOARD_NONE_KEY ? null : raw;
    }
  };
  if (workQueryBoardAxisOfKey(parsed.columnKey)) apply(parsed.columnKey);
  else preset.workflowCategory = parsed.columnKey as TaskWorkflowCategory;
  if (parsed.laneKey) apply(parsed.laneKey);
  return preset;
};

export const getKanbanAssigneeUpdate = (
  task: TaskListItem,
  patch: Partial<TaskListItem>,
): KanbanAssigneeUpdate | undefined => {
  const update: KanbanAssigneeUpdate = {};
  if ('assigneeAgentId' in patch) update.assigneeAgentId = patch.assigneeAgentId ?? null;
  if ('assigneeUserId' in patch) update.assigneeUserId = patch.assigneeUserId ?? null;

  if (
    (update.assigneeAgentId === undefined ||
      (task.assigneeAgentId ?? null) === update.assigneeAgentId) &&
    (update.assigneeUserId === undefined || (task.assigneeUserId ?? null) === update.assigneeUserId)
  ) {
    return;
  }

  return update;
};

export const getKanbanTaskPatch = (
  groupBy: TaskKanbanGroupBy,
  column: KanbanColumnDefinition,
): Partial<TaskListItem> | undefined => {
  if (groupBy === 'assignee' && column.groupMeta?.groupBy === 'assignee') {
    return { assigneeAgentId: column.groupMeta.assigneeId ?? null };
  }
  if (groupBy === 'member' && column.groupMeta?.groupBy === 'member') {
    return { assigneeUserId: column.groupMeta.assigneeUserId ?? null };
  }
  if (groupBy === 'priority' && column.groupMeta?.groupBy === 'priority') {
    return { priority: column.groupMeta.priority ?? 0 };
  }
  if (groupBy === 'status' && column.targetWorkflowCategory) {
    // Issue board columns write the canonical Issue Status only — never the
    // legacy `status` projection (settlement owns execution transitions).
    return { workflowCategory: column.targetWorkflowCategory };
  }
};

export const canDropTaskIntoKanbanColumn = (
  task: TaskListItem,
  groupBy: TaskKanbanGroupBy,
  column: KanbanColumnDefinition,
): boolean => {
  if (!column.droppable) return false;
  if (groupBy === 'status') {
    return Boolean(column.targetWorkflowCategory);
  }
  if (groupBy !== 'member' || column.groupMeta?.groupBy !== 'member') return true;

  const targetAssigneeUserId = column.groupMeta.assigneeUserId;
  if (!targetAssigneeUserId) return true;

  return task.visibility !== 'private' || task.createdByUserId === targetAssigneeUserId;
};

/**
 * The membership fields pinning `column`'s scope, sent with a drop as
 * `moveScope` so the server can find the true neighbour past the loaded page
 * edge and respace the column when fractional positions collapse. Present
 * keys constrain; `null` means the unassigned column, not "no constraint".
 */
export const kanbanColumnMoveScope = (
  groupBy: TaskKanbanGroupBy,
  column: KanbanColumnDefinition,
): TaskMoveScope | undefined => {
  if (groupBy === 'status') {
    return column.workflowCategories
      ? { workflowCategories: column.workflowCategories }
      : undefined;
  }
  const meta = column.groupMeta;
  if (!meta) return undefined;
  if (groupBy === 'assignee') {
    if (meta.assigneeId) return { assigneeAgentId: meta.assigneeId };
    if (meta.assigneeUserId) {
      // A user-assignee column matches the server's `assignee:user:<id>` key —
      // no agent assignee, only the member one.
      return { assigneeAgentId: null, assigneeUserId: meta.assigneeUserId };
    }
    return { assigneeAgentId: null, assigneeUserId: null };
  }
  if (groupBy === 'member') return { assigneeUserId: meta.assigneeUserId ?? null };
  return { priority: meta.priority ?? 0 };
};

// ── Drag & drop ──────────────────────────────────────────────────

/**
 * The column key a task buckets under for the current grouping. The Issue
 * board buckets by `workflowCategory` — the canonical Issue Status — for
 * every task, linked or not; the legacy `status` never picks a column.
 * For the property groupings it is the same key `getTaskGroupMeta` produces
 * and the server returns as the group key.
 */
export const taskKanbanColumnKey = (task: TaskListItem, groupBy: TaskKanbanGroupBy): string => {
  if (groupBy === 'status') {
    return task.workflowCategory ?? 'backlog';
  }
  return getTaskGroupMeta(task, groupBy).key;
};

/**
 * "Is this card already in that column?" — a membership question. For status
 * columns a `failed` task already sits in `needsInput` even though the
 * column's write target is `paused`; dropping it back must not rewrite the
 * status.
 */
export const taskMatchesKanbanColumn = (
  task: TaskListItem,
  groupBy: TaskKanbanGroupBy,
  columnKey: string,
): boolean => taskKanbanColumnKey(task, groupBy) === columnKey;

/**
 * One pickable Issue-status row a board-driven menu renders — the board's
 * column plus the workflow category a pick on it commits. Every row is a
 * workflow move (the same `moveIssueWorkflow` command a board drop runs);
 * execution statuses never appear — they are read-only run state.
 *
 * `state` upgrades the row to the shared Issue status model — an exact
 * `team_workflow_states` entry. A pick then commits `{category,
 * workflowStateRefId}` through the same CAS command a board drop uses
 * instead of the category-only write, so two custom states inside one
 * category stay individually selectable.
 */
export interface TaskStatusChoice {
  column: KanbanColumnDefinition;
  state?: TeamWorkflowStateItem;
  workflowCategory?: TaskWorkflowCategory;
}

/**
 * A team's own workflow states as menu choices — the Issue status model
 * (`{teamId, workflowStateRefId, category, name, color}`; color/glyph read
 * from the state's category). Rows keep the board's category order then the
 * catalog's position, and carry the category's `wf:` column so a pick
 * resolves the same `targetKey` a category drop would — the precise ref
 * travels on the choice itself.
 */
export const issueWorkflowStateChoices = (
  states: readonly TeamWorkflowStateItem[],
): TaskStatusChoice[] =>
  WORK_QUERY_WORKFLOW_COLUMNS.flatMap((category) => {
    const column = WORKFLOW_KANBAN_COLUMNS.find((item) => item.targetWorkflowCategory === category);
    return states
      .filter((state) => state.category === category)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((state) => ({ column: column!, state, workflowCategory: category }));
  });

/**
 * Does a pick on `choice` land the task exactly where it already sits?
 * Precise-state rows compare the live ref (or the provider id it mirrors);
 * column rows compare against the task's board bucket. A second state inside
 * the task's own category is never a noop — it writes the ref swap.
 */
export const taskStatusChoiceIsCurrent = (
  task: {
    workflowStateId?: string | null;
    workflowStateRefId?: string | null;
  },
  choice: TaskStatusChoice,
  currentColumnKey: string,
): boolean => {
  if (!choice.state) return choice.column.key === currentColumnKey;
  return (
    choice.state.id === task.workflowStateRefId ||
    choice.state.remoteStateId === (task.workflowStateId ?? undefined)
  );
};

/**
 * The Issue board's columns as menu choices, in board order — workflow
 * categories only. Execution statuses are never pickable on the Issue
 * surface (runs live on `TaskExecutionBadge` and the work-query `st:` axis).
 */
export const issueStatusChoices = (): TaskStatusChoice[] =>
  ISSUE_WORKFLOW_COLUMNS.map((column) => ({
    column,
    workflowCategory: column.targetWorkflowCategory,
  }));

/**
 * The board column a task sits in on the Issue board — the row a
 * board-driven menu check-marks. Every task buckets by `workflowCategory`
 * (the canonical Issue Status), linked or not — same rule as
 * {@link taskKanbanColumnKey}.
 */
export const taskStatusBoardColumnKey = (task: {
  workflowCategory?: TaskWorkflowCategory | null;
}): string => task.workflowCategory ?? 'backlog';

/**
 * Column map for the board's local drag mirror: column key → ordered task
 * identifiers. Hidden columns are included so they stay valid drop targets.
 */
export const buildKanbanColumnMap = (
  columnKeys: readonly string[],
  taskGroups: TaskGroupItem[],
): Record<string, string[]> => {
  const columns: Record<string, string[]> = {};
  for (const key of columnKeys) columns[key] = [];
  for (const group of taskGroups) {
    if (columns[group.key]) {
      columns[group.key] = group.tasks.map((task) => task.identifier);
    }
  }
  return columns;
};

/** Which column contains `id` — `id` itself may be a column key. */
export const findKanbanColumn = (
  columns: Record<string, string[]>,
  id: string,
  columnKeys: ReadonlySet<string>,
): string | null => {
  if (columnKeys.has(id)) return id;
  for (const [columnKey, ids] of Object.entries(columns)) {
    if (ids.includes(id)) return columnKey;
  }
  return null;
};

/**
 * The task behind a drag event. `active.data.current.task` reads empty once
 * the mirror parks the card on an unmounted (hidden) column — dnd-kit clears
 * the ref when the sortable node unmounts — so fall back to the pre-drag
 * snapshot map, which keeps every row's identity regardless of mounts.
 */
export const resolveKanbanDragTask = (
  active: { data: { current?: Record<string, unknown> }; id: unknown },
  taskMap: ReadonlyMap<string, TaskListItem>,
): TaskListItem | undefined =>
  (active.data.current?.task as TaskListItem | undefined) ?? taskMap.get(String(active.id));

/**
 * The column a drop actually commits to — the RELEASE column, not wherever
 * the mirror's last accepted preview left the card. A rejected drag-over can
 * park the card on an earlier valid column, so the preview is only a hint.
 *
 * `droppable: false` bars cross-column entry only: a same-column reorder
 * stays legal in columns that accept no status write (`running`), so
 * membership is checked before the droppable gate.
 */
export const resolveKanbanDropColumn = (
  task: TaskListItem,
  groupBy: TaskKanbanGroupBy,
  columns: Record<string, string[]>,
  overId: string,
  columnKeys: ReadonlySet<string>,
  columnDefs: ReadonlyMap<string, KanbanColumnDefinition>,
  externalGroupBy?: WorkQueryBoardGroupBy,
): string | null => {
  const overCol = findKanbanColumn(columns, overId, columnKeys);
  const def = overCol ? columnDefs.get(overCol) : undefined;
  if (!overCol || !def) return null;
  if (externalGroupBy) {
    if (taskMatchesExternalColumn(task, externalGroupBy, overCol)) return overCol;
    if (!canDropTaskIntoExternalColumn(task, def)) return null;
    return overCol;
  }
  if (taskMatchesKanbanColumn(task, groupBy, overCol)) return overCol;
  if (!def.droppable || !canDropTaskIntoKanbanColumn(task, groupBy, def)) return null;
  return overCol;
};

/**
 * The position a card dropped at `activeId`'s index should take: midpoint of
 * the neighbours, or just past the edge card. Mirrors the server's
 * `computeMovePosition` so the optimistic placement matches the refetched
 * order.
 */
export const computeKanbanPosition = (
  ids: readonly string[],
  activeId: string,
  taskMap: ReadonlyMap<string, TaskListItem>,
): number => {
  const index = ids.indexOf(activeId);
  if (index === -1) return 0;
  const getPos = (id: string) => {
    const task = taskMap.get(id);
    return task ? effectiveTaskPosition(task) : 0;
  };
  if (ids.length === 1) return getPos(activeId);
  if (index === 0) return getPos(ids[1]!) - 1;
  if (index === ids.length - 1) return getPos(ids[index - 1]!) + 1;
  return (getPos(ids[index - 1]!) + getPos(ids[index + 1]!)) / 2;
};

/** The anchor cards framing `activeId`'s slot in `ids` (its predecessor and successor). */
export const getKanbanMoveAnchors = (
  ids: readonly string[],
  activeId: string,
): { afterId: string | null; beforeId: string | null } => {
  const index = ids.indexOf(activeId);
  return {
    afterId: index >= 0 && index < ids.length - 1 ? ids[index + 1]! : null,
    beforeId: index > 0 ? ids[index - 1]! : null,
  };
};

/**
 * Settle `activeId` at the pointer's release position inside `columnKey`.
 *
 * The identifier is removed from every OTHER column first: a release over a
 * column different from the last accepted drag-over preview would otherwise
 * leave the card parked in both and render the task twice while the move
 * settles — and a failed post-settle refetch could keep the duplicate.
 */
export const placeKanbanCardInColumn = (
  columns: Record<string, string[]>,
  columnKey: string,
  activeId: string,
  overId: string,
): Record<string, string[]> => {
  let finalIds = [...(columns[columnKey] ?? [])];
  const fromIndex = finalIds.indexOf(activeId);
  const overIndex = finalIds.indexOf(overId); // -1 when `over` is the column itself
  if (fromIndex === -1) {
    finalIds.splice(overIndex >= 0 ? overIndex : finalIds.length, 0, activeId);
  } else if (overIndex !== -1 && fromIndex !== overIndex) {
    finalIds = arrayMove(finalIds, fromIndex, overIndex);
  }
  const next = { ...columns };
  for (const key of Object.keys(next)) {
    if (key !== columnKey && next[key]!.includes(activeId)) {
      next[key] = next[key]!.filter((id) => id !== activeId);
    }
  }
  next[columnKey] = finalIds;
  return next;
};

/**
 * Collision detection for the board: `pointerWithin` first so a card under
 * the pointer wins over its column (enables insertion feedback); columns are
 * the fallback when the pointer sits between cards or on empty space;
 * `closestCenter` covers edge cases where the pointer leaves every container.
 */
export const makeKanbanCollision = (columnKeys: ReadonlySet<string>): CollisionDetection => {
  return (args) => {
    const within = pointerWithin(args);
    if (within.length > 0) {
      const cards = within.filter((collision) => !columnKeys.has(collision.id as string));
      if (cards.length > 0) return cards;
      return within;
    }
    return closestCenter(args);
  };
};

/**
 * Merge a refreshed column map into the previous one, keeping the previous
 * column ORDER so a resync never re-arranges columns the user sees.
 */
export const preserveKanbanColumnOrder = (
  previous: Record<string, string[]>,
  refreshed: Record<string, string[]>,
): Record<string, string[]> =>
  Object.fromEntries(
    [...new Set([...Object.keys(previous), ...Object.keys(refreshed)])]
      .filter((key) => key in refreshed)
      .map((key) => [key, refreshed[key]!]),
  );

export const kanbanColumnPagingAction = ({
  atLimit,
  external,
}: {
  atLimit: boolean;
  external: boolean;
}): 'loadMore' | 'viewAll' => (atLimit && !external ? 'viewAll' : 'loadMore');
