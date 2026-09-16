import { appEnv } from '@/envs/app';
import { injectActiveTraceHeaders } from '@/libs/observability/traceparent';
import { workflowClient } from '@/libs/qstash';

import {
  type LinearSyncWorkflowInput,
  LinearSyncWorkflowPayloadSchema,
} from './types';

const WORKFLOW_PATHS = {
  execute: '/api/workflows/linear-sync/execute',
  process: '/api/workflows/linear-sync/process',
} as const;

const normalizeFlowControlKey = (value: string) => value.replaceAll(/[^\w.-]/g, '_');

const workflowUrl = (path: string) => {
  const baseUrl = appEnv.INTERNAL_APP_URL || appEnv.APP_URL;
  if (!baseUrl) throw new Error('INTERNAL_APP_URL or APP_URL is required for Linear sync workflows');
  return new URL(path, baseUrl).toString();
};

const trigger = async (path: string, payload: LinearSyncWorkflowInput) => {
  if (!process.env.QSTASH_TOKEN) throw new Error('Linear sync workflow is unavailable');

  const headers = new Headers();
  injectActiveTraceHeaders(headers);
  const normalizedPayload = LinearSyncWorkflowPayloadSchema.parse(payload);
  return workflowClient.trigger({
    body: normalizedPayload,
    flowControl: {
      key: `linear-sync.workspace.${normalizeFlowControlKey(normalizedPayload.workspaceId)}`,
      parallelism: 1,
    },
    headers: Object.fromEntries(headers.entries()),
    url: workflowUrl(path),
  });
};

/** Durable entry point for a workspace's Linear sync queue. */
export class LinearSyncWorkflow {
  static trigger(payload: LinearSyncWorkflowInput) {
    return trigger(WORKFLOW_PATHS.process, payload);
  }

  static triggerInstallation(payload: LinearSyncWorkflowInput & { installationId: string }) {
    return trigger(WORKFLOW_PATHS.execute, payload);
  }
}

export type { LinearSyncWorkflowPayload } from './types';
