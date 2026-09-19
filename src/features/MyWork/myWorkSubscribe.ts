import type { MyWorkMode } from '@orvilo/types';

/** Follow state is independent of assigned / review / created responsibility. */
export const isTaskFollowed = (
  taskId: string,
  mode: MyWorkMode,
  subscribedTaskIds: readonly string[],
): boolean => mode === 'subscribed' || subscribedTaskIds.includes(taskId);
