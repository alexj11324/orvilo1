import type { TaskListItem } from '@orvilo/types';

import { buildTaskRows, type TaskRow } from '@/features/AgentTasks/AgentTaskList/listViewOptions';

import type { WorkQueryResultTask } from './workQueryPaging';

/**
 * Derive visible nesting only from parents present in the same rendered set.
 * A missing parent means the row stands on its own; a malformed cycle also
 * falls back to depth zero instead of pushing rows indefinitely to the right.
 */
export const workQueryHierarchyRows = (
  groupTasks: WorkQueryResultTask[],
  allTasks: WorkQueryResultTask[],
): TaskRow[] => {
  const hydratedTasks: TaskListItem[] = allTasks.map((task) => ({
    ...task,
    participants: task.participants ?? [],
  }));
  const taskById = new Map(hydratedTasks.map((task) => [task.id, task]));
  const sourceIndex = new Map(allTasks.map((task, index) => [task.id, index]));
  return buildTaskRows(
    groupTasks.map((task) => taskById.get(task.id) ?? { ...task, participants: [] }),
    {
      compare: (left, right) =>
        (sourceIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (sourceIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER),
      nested: true,
      taskById,
    },
  );
};
