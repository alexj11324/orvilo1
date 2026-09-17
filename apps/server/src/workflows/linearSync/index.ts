import { injectActiveTraceHeaders } from '@/libs/observability/traceparent';
import {
  type HatchetWorkflowPath,
  triggerHatchetWorkflow,
} from '@/server/services/hatchet/workflows';

import { type LinearSyncWorkflowInput, LinearSyncWorkflowPayloadSchema } from './types';

const WORKFLOW_PATHS = {
  execute: '/api/workflows/linear-sync/execute',
  process: '/api/workflows/linear-sync/process',
} as const;

const trigger = async (
  path: HatchetWorkflowPath,
  payload: LinearSyncWorkflowInput,
  options?: { delay?: number; workflowRunId?: string },
) => {
  const headers = new Headers();
  injectActiveTraceHeaders(headers);
  const normalizedPayload = LinearSyncWorkflowPayloadSchema.parse(payload);
  return triggerHatchetWorkflow(path, normalizedPayload, {
    concurrencyKey: normalizedPayload.workspaceId,
    headers: Object.fromEntries(headers.entries()),
    ...(options?.delay === undefined ? {} : { delayMs: options.delay * 1000 }),
    ...(options?.workflowRunId === undefined ? {} : { workflowRunId: options.workflowRunId }),
  });
};

/** Durable entry point for a workspace's Linear sync queue. */
export class LinearSyncWorkflow {
  static trigger(payload: LinearSyncWorkflowInput) {
    return trigger(WORKFLOW_PATHS.process, payload);
  }

  static triggerInstallation(
    payload: LinearSyncWorkflowInput & { installationId: string },
    options?: { delay?: number; workflowRunId?: string },
  ) {
    return trigger(WORKFLOW_PATHS.execute, payload, options);
  }
}

export type { LinearSyncWorkflowPayload } from './types';
