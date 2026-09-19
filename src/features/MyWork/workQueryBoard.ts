import type { TaskListItem, TaskStatus, TaskWorkflowCategory } from '@orvilo/types';

import {
  KANBAN_STATUS_COLUMN_KEY,
  KANBAN_WORKFLOW_COLUMN_KEY,
} from '@/features/AgentTasks/AgentTaskList/kanbanBoardModel';
import type { TaskGroupItem } from '@/store/task/slices/list/initialState';

import type { WorkQueryGroupPage } from './workQueryPaging';
import type { WorkQueryResultTask } from './WorkQueryResults';

export const MY_WORK_BOARD_MODES = ['assigned', 'delegated'] as const;

export const isMyWorkBoardMode = (mode: string): boolean =>
  (MY_WORK_BOARD_MODES as readonly string[]).includes(mode);

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
      existing.tasks = [...existing.tasks, ...tasks];
      existing.total += group.total;
      existing.hasMore ||= group.hasMore;
    } else {
      byColumn.set(columnKey, {
        hasMore: group.hasMore,
        key: columnKey,
        tasks,
        total: group.total,
      });
    }
  }
  return [...byColumn.values()];
};
