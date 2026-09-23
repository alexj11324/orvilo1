import type { TaskLabelSummary } from '@orvilo/types';

import { lambdaClient } from '@/libs/trpc/client';

/** Registry row returned by `taskLabel.getLabels`. */
export type TaskLabelListItem = Awaited<
  ReturnType<typeof lambdaClient.taskLabel.getLabels.query>
>[number];

export class TaskLabelService {
  /** Workspace (or personal) label registry — pickers and the filter builder. */
  getLabels = (): Promise<TaskLabelListItem[]> => {
    return lambdaClient.taskLabel.getLabels.query();
  };

  createLabel = (params: { color?: string; name: string }): Promise<TaskLabelListItem> => {
    return lambdaClient.taskLabel.createLabel.mutate(params);
  };

  /**
   * Apply a label to a task. Accepts the task id or identifier (`TASK-1`);
   * returns the task's full label set after the change.
   */
  assignLabel = (taskId: string, labelId: string): Promise<TaskLabelSummary[]> => {
    return lambdaClient.taskLabel.assignLabel.mutate({ labelId, taskId });
  };

  /** Remove a label from a task; returns the task's remaining label set. */
  unassignLabel = (taskId: string, labelId: string): Promise<TaskLabelSummary[]> => {
    return lambdaClient.taskLabel.unassignLabel.mutate({ labelId, taskId });
  };
}

export const taskLabelService = new TaskLabelService();
