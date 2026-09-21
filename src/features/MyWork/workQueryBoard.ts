import type { TaskWorkflowCategory } from '@orvilo/types';
import { WORK_QUERY_STATUS_COLUMNS, WORK_QUERY_WORKFLOW_COLUMNS } from '@orvilo/types';

import {
  externalTaskColumnKey,
  type KanbanColumnDefinition,
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
): TaskGroupItem[] => {
  return (groups ?? []).map((group): TaskGroupItem => {
    const tasks = group.tasks.map((task) => ({
      ...task,
      participants: task.participants ?? [],
    }));
    return {
      hasMore: group.hasMore,
      key: `${groupBy === 'workflowCategory' ? 'wf' : 'st'}:${group.key}`,
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
export type WorkQueryListGroupBy = 'attention' | 'none' | 'status' | 'workflowCategory';

export const workQueryListGroupBy = (
  groupBy: 'attention' | 'none' | 'status' | 'workflowCategory' | undefined,
): WorkQueryListGroupBy => groupBy ?? 'status';

const groupKeyOrder = (groupBy: WorkQueryBoardGroupBy): readonly string[] =>
  groupBy === 'workflowCategory' ? WORK_QUERY_WORKFLOW_COLUMNS : WORK_QUERY_STATUS_COLUMNS;

export const workQueryListGroups = (
  tasks: readonly WorkQueryResultTask[],
  groupBy: WorkQueryBoardGroupBy,
): { key: string; tasks: WorkQueryResultTask[] }[] => {
  const buckets = new Map<string, WorkQueryResultTask[]>();
  for (const task of tasks) {
    const key =
      groupBy === 'workflowCategory'
        ? (task.workflowCategory ?? 'backlog')
        : (task.status ?? 'backlog');
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
  groupBy: 'attention' | WorkQueryBoardGroupBy,
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
  // so a groups-less response degrades to the status bucketing.
  return workQueryListGroups(tasks, groupBy === 'attention' ? 'status' : groupBy);
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
): string[] => [workQueryKeyForKanbanColumn(columnKey)];

export const workQueryMovePlan = (input: {
  groupBy: WorkQueryBoardGroupBy;
  targetKey: string;
  task: WorkQueryBoardTask;
}): WorkQueryMovePlan => {
  if (taskBoardGroupKey(input.task, input.groupBy) === input.targetKey) {
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
