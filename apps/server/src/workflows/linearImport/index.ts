import { triggerHatchetWorkflow } from '@/server/services/hatchet/workflows';

const PATH = '/api/workflows/linear-import/process';

export class LinearImportWorkflow {
  static trigger(
    payload: { workspaceId: string; jobId: string },
    options?: { workflowRunId?: string },
  ) {
    return triggerHatchetWorkflow(PATH, payload, {
      concurrencyKey: payload.jobId,
      workflowRunId: options?.workflowRunId,
    });
  }
}
