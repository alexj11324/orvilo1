import { useCallback, useEffect } from 'react';

import type { TaskStore } from '@/store/task';

import { type TaskTitleSaveQueue, taskTitleSaveQueue } from './taskTitleSaveQueue';

interface UseTaskTitleAutosaveOptions {
  editable: boolean;
  /** Injectable for tests; the app uses the shared module queue. */
  queue?: TaskTitleSaveQueue;
  taskId?: string;
  updateTask: TaskStore['updateTask'];
}

/**
 * Title autosave glue. Edits go into the per-task queue with the taskId that
 * was bound when the keystroke landed — switching to another task's detail
 * can never make this task's pending save target the new task.
 *
 * The flush hook is the scoped effect's cleanup: on a taskId change the
 * previous task's pending edit fires first (fire, not cancel), and on
 * unmount the bound task's pending edit fires — so leaving right after the
 * last character is typed does not drop it.
 */
export const useTaskTitleAutosave = ({
  editable,
  queue = taskTitleSaveQueue,
  taskId,
  updateTask,
}: UseTaskTitleAutosaveOptions) => {
  useEffect(() => {
    if (!taskId) return;
    return () => queue.flush(taskId, updateTask);
  }, [queue, taskId, updateTask]);

  const notifyTitleEdit = useCallback(
    (value: string) => {
      if (!editable || !taskId) return;
      queue.schedule(taskId, value, updateTask);
    },
    [editable, queue, taskId, updateTask],
  );

  const flush = useCallback(() => {
    if (taskId) queue.flush(taskId, updateTask);
  }, [queue, taskId, updateTask]);

  const hasPendingEdit = useCallback((id?: string) => (id ? queue.hasPending(id) : false), [queue]);

  return { flush, hasPendingEdit, notifyTitleEdit };
};
