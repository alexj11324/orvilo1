import { closestCenter, type CollisionDetection, pointerWithin } from '@dnd-kit/core';
import type { TaskStatus } from '@orvilo/types';

import type {
  TaskGroupItem,
  TaskKanbanGroupBy,
  TaskListItem,
} from '@/store/task/slices/list/initialState';

import type { TaskGroupBy, TaskGroupMeta } from './listViewOptions';
import {
  getTaskAssigneeGroupMeta,
  getTaskGroupMeta,
  getTaskMemberGroupMeta,
  getTaskPriorityGroupMeta,
  sortGroupEntries,
} from './listViewOptions';

export interface KanbanColumnDefinition {
  droppable: boolean;
  groupMeta?: TaskGroupMeta;
  key: string;
  targetStatus: 'backlog' | 'canceled' | 'completed' | 'paused' | null;
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

export const STATUS_KANBAN_COLUMNS: KanbanColumnDefinition[] = [
  { droppable: true, key: 'backlog', targetStatus: 'backlog' },
  { droppable: false, key: 'running', targetStatus: null },
  // The column mixes paused + failed; a drop from outside lands on `paused`,
  // the user-selectable representative ("Pending review").
  { droppable: true, key: 'needsInput', targetStatus: 'paused' },
  { droppable: true, key: 'done', targetStatus: 'completed' },
  { droppable: true, key: 'canceled', targetStatus: 'canceled' },
];

/** Raw statuses bucketed inside each merged status column. */
export const KANBAN_COLUMN_STATUSES: Record<string, TaskStatus[]> = {
  backlog: ['backlog'],
  canceled: ['canceled'],
  done: ['completed'],
  needsInput: ['paused', 'failed'],
  running: ['running', 'scheduled'],
};

/**
 * Status columns the view filter removed entirely. A column whose member
 * statuses are all excluded returns no rows and can never show a dropped
 * card — it is neither rendered nor a drop target (unlike a *user-hidden*
 * column, which stays droppable through the hidden panel).
 */
export const kanbanStatusColumnsExcludedBy = (
  excludeStatuses: readonly TaskStatus[] | undefined,
): Set<string> => {
  if (!excludeStatuses?.length) return new Set();
  const excluded = new Set(excludeStatuses);
  return new Set(
    STATUS_KANBAN_COLUMNS.filter((column) =>
      KANBAN_COLUMN_STATUSES[column.key]?.every((status) => excluded.has(status)),
    ).map((column) => column.key),
  );
};

export const normalizeKanbanGroupBy = (groupBy: TaskGroupBy): TaskKanbanGroupBy =>
  groupBy === 'assignee' || groupBy === 'member' || groupBy === 'priority' ? groupBy : 'status';

export interface KanbanGroupQueryInput {
  agentId?: string;
  excludeStatuses?: readonly TaskStatus[];
  groupBy: TaskKanbanGroupBy;
  /** Set on the "My tasks" board; mutually exclusive with the other scopes. */
  myTaskScope?: 'assigned' | 'created';
  projectId?: string;
}

export interface KanbanGroupQuery {
  agentId?: string;
  allAgents?: boolean;
  automated?: boolean;
  excludeStatuses?: readonly TaskStatus[];
  groupBy: TaskKanbanGroupBy;
  projectId?: string;
  scope?: 'assigned' | 'created';
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
  if (myTaskScope) return { excludeStatuses, groupBy, scope: myTaskScope };
  if (projectId) return { automated: false, excludeStatuses, groupBy, projectId };
  if (agentId) return { agentId, automated: false, excludeStatuses, groupBy };

  return { allAgents: true, automated: false, excludeStatuses, groupBy };
};

export const buildKanbanColumns = (
  taskGroups: TaskGroupItem[],
  groupBy: TaskKanbanGroupBy,
): KanbanColumnDefinition[] => {
  if (groupBy === 'status') return STATUS_KANBAN_COLUMNS;

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
  if (groupBy === 'status' && column.targetStatus) {
    return { status: column.targetStatus as TaskStatus };
  }
};

export const canDropTaskIntoKanbanColumn = (
  task: TaskListItem,
  groupBy: TaskKanbanGroupBy,
  column: KanbanColumnDefinition,
): boolean => {
  if (!column.droppable) return false;
  if (groupBy !== 'member' || column.groupMeta?.groupBy !== 'member') return true;

  const targetAssigneeUserId = column.groupMeta.assigneeUserId;
  if (!targetAssigneeUserId) return true;

  return task.visibility !== 'private' || task.createdByUserId === targetAssigneeUserId;
};

// ── Drag & drop ──────────────────────────────────────────────────

/**
 * The column a task belongs to when the board groups by status. The five
 * rendered columns merge the raw statuses (`needsInput` holds paused +
 * failed, `running` holds running + scheduled).
 */
export const KANBAN_STATUS_COLUMN_KEY: Record<TaskStatus, string> = {
  backlog: 'backlog',
  canceled: 'canceled',
  completed: 'done',
  failed: 'needsInput',
  paused: 'needsInput',
  running: 'running',
  scheduled: 'running',
};

/**
 * The column key a task buckets under for the current grouping. For status
 * boards this is the merged column (`task.status` → column key); for the
 * property groupings it is the same key `getTaskGroupMeta` produces and the
 * server returns as the group key.
 */
export const taskKanbanColumnKey = (task: TaskListItem, groupBy: TaskKanbanGroupBy): string => {
  if (groupBy === 'status') return KANBAN_STATUS_COLUMN_KEY[task.status as TaskStatus] ?? 'backlog';
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
 * The board ordering key a row renders at. Rows never dragged carry
 * `position: null` and fall back to `-epoch(createdAt)` — the same fallback
 * the server applies — so untouched rows keep their newest-first order.
 */
export const effectiveTaskPosition = (task: TaskListItem): number => {
  if (task.position !== null && task.position !== undefined) return task.position;
  const createdAt = task.createdAt;
  const time = createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();
  return -(time / 1000);
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
