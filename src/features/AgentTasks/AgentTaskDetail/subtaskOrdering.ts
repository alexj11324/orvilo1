import type { TaskDetailSubtask, TaskWorkflowCategory } from '@orvilo/types';
import { WORK_QUERY_WORKFLOW_COLUMNS } from '@orvilo/types';

// The Issue board's column order IS the canonical status order — the same
// sequence the Issue Status picker menu and every `wf:` board render.
const WORKFLOW_RANK = new Map<string, number>(
  WORK_QUERY_WORKFLOW_COLUMNS.map((category, index): [string, number] => [category, index]),
);

/** Rows without a projected category bucket as backlog, like the picker does. */
const workflowRank = (category: TaskWorkflowCategory | null | undefined): number =>
  WORKFLOW_RANK.get(category ?? 'backlog') ?? WORKFLOW_RANK.size;

/**
 * The orderings the Sub-issues sort menu offers — the subset of the task
 * list's order vocabulary (`TaskOrderBy`) the `TaskDetailSubtask` projection
 * actually carries: there is no `createdAt` on the projection, and its dual
 * agent/member assignee channels share no display key to sort on, so Linear's
 * "Assignee" and "Created" orderings stay unoffered.
 */
export type SubtaskOrdering = 'manual' | 'priority' | 'status' | 'updatedAt';

/** Menu order — manual first because it is the server's own order. */
export const SUBTASK_ORDERINGS: readonly SubtaskOrdering[] = [
  'manual',
  'status',
  'priority',
  'updatedAt',
];

// Urgent → high → normal → low → none — the same ranking the task list's
// priority ordering applies (see PRIORITY_RANK_MAP in listViewOptions).
const PRIORITY_RANK: Record<number, number> = {
  0: 4,
  1: 0,
  2: 1,
  3: 2,
  4: 3,
};

const priorityRank = (priority: number | null | undefined): number =>
  PRIORITY_RANK[priority ?? 0] ?? PRIORITY_RANK[0];

/** Rows without a parseable timestamp sink to the end. */
const updatedTime = (updatedAt: string | undefined): number => {
  if (!updatedAt) return 0;
  const time = new Date(updatedAt).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const ORDERING_COMPARE: Record<
  Exclude<SubtaskOrdering, 'manual'>,
  (a: TaskDetailSubtask, b: TaskDetailSubtask) => number
> = {
  priority: (a, b) => priorityRank(a.priority) - priorityRank(b.priority),
  status: (a, b) => workflowRank(a.workflowCategory) - workflowRank(b.workflowCategory),
  // Date orderings run newest-first, matching the task list's default.
  updatedAt: (a, b) => updatedTime(b.updatedAt) - updatedTime(a.updatedAt),
};

/**
 * Stable ordering at every level of the sub-issue tree — the order Linear's
 * sub-issue sort control applies. Rows that compare equal keep their
 * incoming position (Array.prototype.sort is stable), so switching never
 * reshuffles siblings that already tie. 'manual' keeps the server's own
 * order untouched. The input array and tasks are not mutated.
 */
export const sortSubtasks = (
  subtasks: readonly TaskDetailSubtask[],
  ordering: SubtaskOrdering,
): TaskDetailSubtask[] => {
  if (ordering === 'manual') return [...subtasks];
  const compare = ORDERING_COMPARE[ordering];
  return [...subtasks]
    .sort(compare)
    .map((task) =>
      task.children?.length ? { ...task, children: sortSubtasks(task.children, ordering) } : task,
    );
};

/** Status ordering under its wave-1 name — the tree sorts by board column. */
export const sortSubtasksByStatus = (subtasks: readonly TaskDetailSubtask[]): TaskDetailSubtask[] =>
  sortSubtasks(subtasks, 'status');
