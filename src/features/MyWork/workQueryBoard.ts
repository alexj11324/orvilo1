import type { TaskListItem, TaskStatus, TaskWorkflowCategory } from '@orvilo/types';
import { WORK_QUERY_STATUS_COLUMNS, WORK_QUERY_WORKFLOW_COLUMNS } from '@orvilo/types';

import {
  KANBAN_STATUS_COLUMN_KEY,
  KANBAN_WORKFLOW_COLUMN_KEY,
  type KanbanColumnDefinition,
  STATUS_KANBAN_COLUMNS,
} from '@/features/AgentTasks/AgentTaskList/kanbanBoardModel';
import type { TaskGroupItem } from '@/store/task/slices/list/initialState';

import type { WorkQueryGroupPage, WorkQueryResultTask } from './workQueryPaging';

export const MY_WORK_BOARD_MODES = ['assigned', 'delegated'] as const;

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
      groupBy: 'status' | 'workflowCategory';
      targetKey: string;
      type: 'local';
    }
  | { status: 'canceled' | 'completed'; task: WorkQueryBoardTask; type: 'cascade' };

/**
 * Bucket a work-query board page under the shared kanban's column keys so a
 * saved view or team board renders through the one KanbanBoard component:
 * raw statuses merge (`scheduled`→running, `paused`/`failed`→needsInput,
 * `completed`→done) and workflow categories map by name
 * (`in_progress`→running, `in_review`→needsInput). Columns with no matching
 * group simply render empty.
 */
export const workQueryBoardGroups = (
  groups: readonly WorkQueryGroupPage<WorkQueryResultTask>[] | undefined,
  groupBy: 'status' | 'workflowCategory',
): TaskGroupItem[] => {
  const byColumn = new Map<string, TaskGroupItem>();
  for (const group of groups ?? []) {
    const columnKey =
      groupBy === 'status'
        ? KANBAN_STATUS_COLUMN_KEY[group.key as TaskStatus]
        : KANBAN_WORKFLOW_COLUMN_KEY[group.key as TaskWorkflowCategory];
    if (!columnKey) continue;
    const tasks = group.tasks.map((task): TaskListItem => ({
      ...task,
      participants: task.participants ?? [],
    }));
    const existing = byColumn.get(columnKey);
    if (existing) {
      const mergedTasks = [...existing.tasks, ...tasks];
      byColumn.set(columnKey, {
        ...existing,
        hasMore: existing.hasMore || group.hasMore,
        limit: mergedTasks.length,
        tasks: mergedTasks,
        total: existing.total + group.total,
      });
    } else {
      byColumn.set(columnKey, {
        hasMore: group.hasMore,
        key: columnKey,
        limit: tasks.length,
        offset: 0,
        tasks,
        total: group.total,
      });
    }
  }
  return [...byColumn.values()];
};

/**
 * The Cordy column a work-query row belongs in — same membership rule the
 * shared board uses. Linear-linked cards (`workflowStateId`) follow the
 * workflow category (`in_review`→needsInput) even on a status-grouped list,
 * so list headers and the board do not disagree.
 */
export const workQueryTaskColumnKey = (
  task: Pick<WorkQueryBoardTask, 'status' | 'workflowCategory' | 'workflowStateId'>,
  groupBy: 'status' | 'workflowCategory',
): string => {
  if (groupBy === 'workflowCategory' || task.workflowStateId) {
    return KANBAN_WORKFLOW_COLUMN_KEY[task.workflowCategory as TaskWorkflowCategory] ?? 'backlog';
  }
  return KANBAN_STATUS_COLUMN_KEY[(task.status ?? 'backlog') as TaskStatus] ?? 'backlog';
};

/**
 * Ungrouped / status lists keep execution-status buckets; a view that
 * grouped by workflow category keeps that dimension. `none` and missing
 * `groupBy` follow the status board so My Work's list matches its kanban.
 */
export const workQueryListGroupBy = (
  groupBy: 'none' | 'status' | 'workflowCategory' | undefined,
): 'status' | 'workflowCategory' =>
  groupBy === 'workflowCategory' ? 'workflowCategory' : 'status';

export const workQueryListGroups = (
  tasks: readonly WorkQueryResultTask[],
  groupBy: 'status' | 'workflowCategory',
): { key: string; tasks: WorkQueryResultTask[] }[] => {
  const buckets = new Map<string, WorkQueryResultTask[]>();
  for (const task of tasks) {
    const key = workQueryTaskColumnKey(task, groupBy);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(task);
    else buckets.set(key, [task]);
  }
  return STATUS_KANBAN_COLUMNS.map((column) => ({
    key: column.key,
    tasks: buckets.get(column.key) ?? [],
  })).filter((group) => group.tasks.length > 0);
};

export const cascadeStatusForBoardKey = (
  groupBy: 'status' | 'workflowCategory',
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

export const taskBoardGroupKey = (
  task: WorkQueryBoardTask,
  groupBy: 'status' | 'workflowCategory',
) => (groupBy === 'status' ? (task.status ?? 'backlog') : (task.workflowCategory ?? 'backlog'));

const isAllowedTargetKey = (groupBy: 'status' | 'workflowCategory', targetKey: string) =>
  groupBy === 'workflowCategory'
    ? (WORK_QUERY_WORKFLOW_COLUMNS as readonly string[]).includes(targetKey)
    : (WORK_QUERY_STATUS_COLUMNS as readonly string[]).includes(targetKey);

/**
 * Convert a shared-kanban drop column into the work-query `moveBoard`
 * `targetKey`. Cordy merges several raw statuses (`running`+`scheduled`,
 * `paused`+`failed`); a drop onto that column writes the representative
 * (`running`, `paused`). Workflow boards use the column's category.
 */
export const workQueryTargetKeyFromKanbanColumn = (
  groupBy: 'status' | 'workflowCategory',
  column: Pick<KanbanColumnDefinition, 'key' | 'targetStatus' | 'targetWorkflowCategory'>,
): string | null => {
  const targetKey =
    groupBy === 'workflowCategory'
      ? (column.targetWorkflowCategory ?? null)
      : (column.targetStatus ?? (column.key === 'running' ? 'running' : null));
  if (!targetKey || !isAllowedTargetKey(groupBy, targetKey)) return null;
  return targetKey;
};

/**
 * Reverse of `workQueryBoardGroups`: the shared board's load-more button
 * speaks Cordy column keys, but the work-query cursor is keyed by the
 * original status / workflow-category group.
 */
export const workQuerySourceKeysForKanbanColumn = (
  groupBy: 'status' | 'workflowCategory',
  columnKey: string,
): string[] => {
  const table = groupBy === 'status' ? KANBAN_STATUS_COLUMN_KEY : KANBAN_WORKFLOW_COLUMN_KEY;
  return Object.entries(table)
    .filter(([, mapped]) => mapped === columnKey)
    .map(([source]) => source);
};

export const workQueryMovePlan = (input: {
  groupBy: 'status' | 'workflowCategory';
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
