import { normalizeAsyncError } from '@/libs/swr/normalizeError';

/**
 * Whether a task-detail fetch failure means the Issue is gone (deleted, never
 * existed, or not visible to this member) rather than a transient fault.
 *
 * Two shapes carry that meaning: `TASK_NOT_FOUND` is what `fetchTaskDetail`
 * tags when the response held no detail, and tRPC `NOT_FOUND` is what
 * `task.detail` actually throws for a missing row (`task.ts` `detail`). A 500 or
 * network rejection is neither, so it keeps its Reload path.
 */
export const isTaskNotFound = (error: unknown): boolean => {
  if (!error) return false;
  const { code, status } = normalizeAsyncError(error);
  return code === 'TASK_NOT_FOUND' || code === 'NOT_FOUND' || status === 404;
};
