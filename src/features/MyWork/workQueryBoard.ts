import type { TaskWorkflowCategory, WorkQueryGroupBy } from '@orvilo/types';
import {
  prefixWorkQueryBoardKey,
  rawWorkQueryBoardKey,
  WORK_QUERY_BOARD_KEY_SEP,
  WORK_QUERY_PRIORITY_KEYS,
  WORK_QUERY_STATUS_COLUMNS,
  WORK_QUERY_WORKFLOW_COLUMNS,
} from '@orvilo/types';

import {
  boardCellKey,
  externalTaskColumnKey,
  type KanbanColumnDefinition,
  parseBoardCellKey,
  type WorkQueryBoardGroupBy,
  workQueryKeyForKanbanColumn,
} from '@/features/AgentTasks/AgentTaskList/kanbanBoardModel';
import type { TaskGroupItem } from '@/store/task/slices/list/initialState';

import type { WorkQueryGroupPage, WorkQueryResultTask } from './workQueryPaging';

export const MY_WORK_BOARD_MODES = [
  'activity',
  'assigned',
  'created',
  'delegated',
  'subscribed',
] as const;

export const isMyWorkBoardMode = (mode: string): boolean =>
  (MY_WORK_BOARD_MODES as readonly string[]).includes(mode);

export interface WorkQueryBoardTask {
  domainRevision: number;
  id: string;
  identifier: string;
  status?: string | null;
  teamId?: string | null;
  workflowCategory?: string | null;
  workflowStateId?: string | null;
  workflowStateRefId?: string | null;
}

export type WorkQueryMovePlan =
  | { type: 'noop' }
  | {
      expectedDomainRevision: number;
      groupBy: WorkQueryBoardGroupBy;
      targetKey: string;
      type: 'local';
    }
  | { status: 'canceled' | 'completed'; task: WorkQueryBoardTask; type: 'cascade' };

/**
 * Bucket a work-query board page under the shared kanban's column keys.
 * Groups are 1:1 with the board columns (`wf:<category>` / `st:<status>`) —
 * business categories and run states never fold into each other, so an
 * in-review issue never renders as "needs input" and a failed run never
 * looks paused.
 */
export const workQueryBoardGroups = (
  groups: readonly WorkQueryGroupPage<WorkQueryResultTask>[] | undefined,
  groupBy: WorkQueryBoardGroupBy,
  laneAxis?: WorkQueryBoardGroupBy,
): TaskGroupItem[] => {
  return (groups ?? []).map((group): TaskGroupItem => {
    const tasks = group.tasks.map((task) => ({
      ...task,
      participants: task.participants ?? [],
    }));
    let key = prefixWorkQueryBoardKey(groupBy, group.key);
    if (laneAxis) {
      const separator = group.key.indexOf(WORK_QUERY_BOARD_KEY_SEP);
      const columnRaw = separator === -1 ? group.key : group.key.slice(0, separator);
      const laneRaw = separator === -1 ? group.key : group.key.slice(separator + 1);
      key = boardCellKey(
        prefixWorkQueryBoardKey(groupBy, columnRaw),
        prefixWorkQueryBoardKey(laneAxis, laneRaw),
      );
    }
    return {
      hasMore: group.hasMore,
      key,
      limit: tasks.length,
      offset: 0,
      tasks,
      total: group.total,
    };
  });
};

/**
 * The board column a work-query row belongs in — same membership rule the
 * shared board's external groups use (`wf:` business category / `st:` raw
 * execution status). List headers and the board never disagree.
 */
export const workQueryTaskColumnKey = (
  task: Pick<WorkQueryBoardTask, 'status' | 'workflowCategory' | 'workflowStateId'>,
  groupBy: WorkQueryBoardGroupBy,
): string =>
  externalTaskColumnKey(
    { status: task.status, workflowCategory: task.workflowCategory } as never,
    groupBy,
  );

/**
 * `none` stays a flat list — the normalized query decides grouping, the UI
 * never re-buckets under status. Missing `groupBy` follows the status
 * dimension for backwards compatibility with pre-groupBy saved views.
 */
export type WorkQueryListGroupBy =
  | 'activityDate'
  | 'agent'
  | 'assignee'
  | 'attention'
  | 'cycle'
  | 'milestone'
  | 'none'
  | 'priority'
  | 'project'
  | 'status'
  | 'workflowCategory';

export const workQueryListGroupBy = (
  groupBy: WorkQueryGroupBy | undefined,
): WorkQueryListGroupBy => {
  if (
    groupBy === 'none' ||
    groupBy === 'attention' ||
    groupBy === 'status' ||
    groupBy === 'workflowCategory' ||
    groupBy === 'priority' ||
    groupBy === 'assignee' ||
    groupBy === 'agent' ||
    groupBy === 'milestone' ||
    groupBy === 'project' ||
    groupBy === 'cycle' ||
    groupBy === 'activityDate'
  ) {
    return groupBy;
  }
  return 'status';
};

const groupKeyOrder = (groupBy: WorkQueryBoardGroupBy): readonly string[] => {
  if (groupBy === 'workflowCategory') return WORK_QUERY_WORKFLOW_COLUMNS;
  if (groupBy === 'priority') return WORK_QUERY_PRIORITY_KEYS;
  if (groupBy === 'status') return WORK_QUERY_STATUS_COLUMNS;
  return [];
};

export const workQueryListGroups = (
  tasks: readonly WorkQueryResultTask[],
  groupBy: WorkQueryBoardGroupBy,
): { key: string; tasks: WorkQueryResultTask[] }[] => {
  const buckets = new Map<string, WorkQueryResultTask[]>();
  for (const task of tasks) {
    const key = rawWorkQueryBoardKey(externalTaskColumnKey(task, groupBy));
    const bucket = buckets.get(key);
    if (bucket) bucket.push(task);
    else buckets.set(key, [task]);
  }
  const order = groupKeyOrder(groupBy);
  const ordered = order
    .map((key) => ({ key, tasks: buckets.get(key) ?? [] }))
    .filter((group) => group.tasks.length > 0);
  const extras = [...buckets.keys()]
    .filter((key) => !order.includes(key))
    .sort()
    .map((key) => ({ key, tasks: buckets.get(key)! }));
  return [...ordered, ...extras];
};

/**
 * Prefer the server's grouped page (full-set totals, per-column cursors).
 * Client rebucketing is only a fallback when the query is still a flat list.
 */
export const workQueryListSections = (
  groups: readonly WorkQueryGroupPage<WorkQueryResultTask>[] | undefined,
  tasks: readonly WorkQueryResultTask[],
  groupBy: WorkQueryListGroupBy,
): {
  hasMore?: boolean;
  key: string;
  tasks: WorkQueryResultTask[];
  total?: number;
}[] => {
  if (groups && groups.length > 0) {
    return groups
      .filter((group) => group.total > 0 || group.tasks.length > 0)
      .map((group) => ({
        hasMore: group.hasMore,
        key: group.key,
        tasks: group.tasks,
        total: group.total,
      }));
  }
  // 'attention' can't be derived client-side (it reads the dependency graph),
  // so a groups-less response degrades to its tail axis — workflow state.
  // Activity, cycle and project have no client bucket.
  if (
    groupBy === 'activityDate' ||
    groupBy === 'agent' ||
    groupBy === 'cycle' ||
    groupBy === 'milestone' ||
    groupBy === 'project' ||
    groupBy === 'none'
  ) {
    return [];
  }
  return workQueryListGroups(tasks, groupBy === 'attention' ? 'workflowCategory' : groupBy);
};

export const cascadeStatusForBoardKey = (
  groupBy: WorkQueryBoardGroupBy,
  key: string,
): 'canceled' | 'completed' | null => {
  if (groupBy === 'workflowCategory') {
    if (key === 'done') return 'completed';
    if (key === 'canceled') return 'canceled';
    return null;
  }
  if (key === 'completed' || key === 'canceled') return key;
  return null;
};

export const taskBoardGroupKey = (task: WorkQueryBoardTask, groupBy: WorkQueryBoardGroupBy) =>
  groupBy === 'status' ? (task.status ?? 'backlog') : (task.workflowCategory ?? 'backlog');

const isAllowedTargetKey = (groupBy: WorkQueryBoardGroupBy, targetKey: string) =>
  groupBy === 'workflowCategory'
    ? (WORK_QUERY_WORKFLOW_COLUMNS as readonly string[]).includes(targetKey)
    : (WORK_QUERY_STATUS_COLUMNS as readonly string[]).includes(targetKey);

/**
 * Convert a shared-kanban drop column into the work-query `moveBoard`
 * `targetKey`. Columns are raw dimension members — the `wf:`/`st:` prefix
 * only names the axis, the write target is the raw status or category.
 */
export const workQueryTargetKeyFromKanbanColumn = (
  groupBy: WorkQueryBoardGroupBy,
  column: Pick<KanbanColumnDefinition, 'key' | 'targetStatus' | 'targetWorkflowCategory'>,
): string | null => {
  const targetKey =
    groupBy === 'workflowCategory'
      ? (column.targetWorkflowCategory ?? null)
      : (column.targetStatus ?? workQueryKeyForKanbanColumn(column.key));
  if (!targetKey || !isAllowedTargetKey(groupBy, targetKey)) return null;
  return targetKey;
};

/**
 * Reverse of `workQueryBoardGroups`: the shared board's load-more button
 * speaks column keys; the work-query cursor is keyed by the raw group key.
 */
export const workQuerySourceKeysForKanbanColumn = (
  _groupBy: WorkQueryBoardGroupBy,
  columnKey: string,
): string[] => {
  const parsed = parseBoardCellKey(columnKey);
  const column = rawWorkQueryBoardKey(parsed.columnKey);
  if (!parsed.laneKey) return [column];
  return [`${column}${WORK_QUERY_BOARD_KEY_SEP}${rawWorkQueryBoardKey(parsed.laneKey)}`];
};

export const workQueryMovePlan = (input: {
  groupBy: WorkQueryBoardGroupBy;
  targetKey: string;
  /**
   * An exact `team_workflow_states` ref a precise pick carries. A move
   * into the same column is only a noop when the current ref already
   * matches — two states sharing one category still write the pick.
   */
  targetWorkflowStateRefId?: string;
  task: WorkQueryBoardTask;
}): WorkQueryMovePlan => {
  const refStillDiffers =
    input.targetWorkflowStateRefId !== undefined &&
    input.targetWorkflowStateRefId !== input.task.workflowStateRefId;
  if (!refStillDiffers && taskBoardGroupKey(input.task, input.groupBy) === input.targetKey) {
    return { type: 'noop' };
  }
  if (!isAllowedTargetKey(input.groupBy, input.targetKey)) {
    return { type: 'noop' };
  }
  const cascade = cascadeStatusForBoardKey(input.groupBy, input.targetKey);
  if (cascade && !input.task.workflowStateId) {
    return { status: cascade, task: input.task, type: 'cascade' };
  }
  return {
    expectedDomainRevision: input.task.domainRevision,
    groupBy: input.groupBy,
    targetKey: input.targetKey,
    type: 'local',
  };
};

export type { TaskWorkflowCategory, WorkQueryBoardGroupBy };
