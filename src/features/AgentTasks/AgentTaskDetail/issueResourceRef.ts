import type { TaskDetailData } from '@orvilo/types';

/**
 * Resources always address the exact Issue database id. TaskModel.resolve accepts
 * arbitrary persisted ids; identifiers can be shared by filed and unfiled rows.
 */
export const issueResourceRef = (
  task?: Pick<TaskDetailData, 'id' | 'identifier'> | null,
): string | undefined => {
  return task?.id || undefined;
};
