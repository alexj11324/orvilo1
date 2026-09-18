import debug from 'debug';

import { appEnv } from '@/envs/app';
import { injectActiveTraceHeaders } from '@/libs/observability/traceparent';
import { triggerHatchetWorkflow } from '@/server/services/hatchet/workflows';

import { scheduleLocalAgentSignalRun } from './impls';
import type { AgentSignalWorkflowRunPayload } from './types';

export type { AgentSignalWorkflowRunPayload, AgentSignalWorkflowSourceEventInput } from './types';

const log = debug('orvilo-server:workflows:agent-signal');

const WORKFLOW_PATHS = {
  run: '/api/workflows/agent-signal/run',
} as const;

/**
 * Agent Signal workflow trigger helper.
 *
 * Use when:
 * - Server-owned ingress wants to hand off execution to the configured background runtime
 * - The caller already normalized the source event
 *
 * Expects:
 * - `sourceEvent.scopeKey` is stable for the policy coordination scope
 *
 * Returns:
 * - Queue mode returns Hatchet dispatch metadata
 * - Local mode returns a synthetic `workflowRunId` and executes in-process without durability
 */
export class AgentSignalWorkflow {
  static async triggerRun(payload: AgentSignalWorkflowRunPayload) {
    const traceHeaders = new Headers();

    // Preserve active trace context in the database-backed dispatch envelope.
    injectActiveTraceHeaders(traceHeaders);

    if (!appEnv.enableQueueAgentRuntime) {
      return scheduleLocalAgentSignalRun(payload, traceHeaders);
    }

    log('Triggering run workflow payload=%O', {
      agentId: payload.agentId,
      headers: Object.fromEntries(traceHeaders.entries()),
      sourceEvent: payload.sourceEvent,
      userId: payload.userId,
    });

    return triggerHatchetWorkflow(WORKFLOW_PATHS.run, payload, {
      concurrencyKey: `agent-signal.run.scope.${payload.sourceEvent.scopeKey}`,
      headers: Object.fromEntries(traceHeaders.entries()),
    });
  }
}
