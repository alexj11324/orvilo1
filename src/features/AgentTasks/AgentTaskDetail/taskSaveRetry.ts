import type { TaskStore } from '@/store/task';

import { taskTitleSaveQueue } from './taskTitleSaveQueue';

/** Per task: re-sends the description write that last failed. */
const descriptionRetries = new Map<string, () => void>();

/**
 * Run a description write and remember how to re-send it if it fails, so the
 * header's Retry has something to call. `retrying` is true on a re-send — the
 * failed write's rollback already replaced the editor content, so the re-send
 * must not be treated as another editor echo.
 */
export const runTrackedDescriptionSave = (
  taskId: string,
  send: (retrying: boolean) => Promise<unknown>,
  retrying = false,
): Promise<void> =>
  send(retrying).then(
    () => {
      descriptionRetries.delete(taskId);
    },
    (error: unknown) => {
      descriptionRetries.set(taskId, () => void runTrackedDescriptionSave(taskId, send, true));
      console.error('[TaskInstruction] Failed to save:', error);
    },
  );

/**
 * Header Retry: re-send every failed write of the task — the title draft the
 * queue still holds, and the last failed description write.
 */
export const retryFailedTaskSave = (taskId: string, updateTask: TaskStore['updateTask']): void => {
  taskTitleSaveQueue.flush(taskId, updateTask);
  descriptionRetries.get(taskId)?.();
};
