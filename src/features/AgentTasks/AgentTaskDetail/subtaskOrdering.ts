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
 * Stable status-order sort at every level of the sub-issue tree — the order
 * Linear's sub-issue sort control applies. Rows inside one status bucket keep
 * their incoming position (Array.prototype.sort is stable), so toggling never
 * reshuffles siblings that already share a status. The input array and tasks
 * are not mutated.
 */
export const sortSubtasksByStatus = (subtasks: readonly TaskDetailSubtask[]): TaskDetailSubtask[] =>
  [...subtasks]
    .sort((a, b) => workflowRank(a.workflowCategory) - workflowRank(b.workflowCategory))
    .map((task) =>
      task.children?.length ? { ...task, children: sortSubtasksByStatus(task.children) } : task,
    );
