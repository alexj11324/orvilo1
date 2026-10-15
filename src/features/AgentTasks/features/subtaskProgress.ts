import type { TaskDetailSubtask, TaskSubtaskProgress } from '@orvilo/types';

/**
 * done/total over a whole sub-issue tree — the client mirror of the server's
 * `subtaskProgressByTaskIds` SQL, which counts a descendant as done when its
 * `workflow_category` is `'done'`. `status` is the deprecated projection, so
 * it is only consulted for rows cached before the category was projected —
 * counting it otherwise would disagree with the Issue status mark the row
 * draws.
 */
export const countSubtaskProgress = (
  subtasks: readonly TaskDetailSubtask[],
): TaskSubtaskProgress => {
  let completed = 0;
  let total = 0;
  const walk = (items: readonly TaskDetailSubtask[]) => {
    for (const item of items) {
      total += 1;
      const done = item.workflowCategory
        ? item.workflowCategory === 'done'
        : item.status === 'completed';
      if (done) completed += 1;
      if (item.children?.length) walk(item.children);
    }
  };
  walk(subtasks);
  return { completed, total };
};
