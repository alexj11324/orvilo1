import { injectActiveTraceHeaders } from '@/libs/observability/traceparent';
import { triggerHatchetWorkflow } from '@/server/services/hatchet/workflows';

import {
  type ProcessOnboardingTaskRecommendationPayload,
  ProcessOnboardingTaskRecommendationPayloadSchema,
} from './types';

export type { ProcessOnboardingTaskRecommendationPayload } from './types';

const PROCESS_PATH = '/api/workflows/onboarding/task-recommendations/process';

interface TriggerOptions {
  flowControl?: {
    key: string;
    parallelism: number;
  };
  workflowRunId?: string;
}

/**
 * Triggers the durable onboarding task recommendation workflow at its absolute route.
 *
 * Use when:
 * - An Understanding provider has persisted the first usable connector source
 * - A parent workflow must fan out across a different Hono workflow route
 *
 * Expects:
 * - A validated immutable Understanding source fingerprint
 * - Hatchet credentials and a configured worker
 *
 * Returns:
 * - The Hatchet workflow trigger receipt
 *
 * Call stack:
 *
 * processUnderstandingProviders
 *   -> {@link OnboardingTaskRecommendationWorkflow.trigger}
 *     -> triggerHatchetWorkflow
 *       -> /api/workflows/onboarding/task-recommendations/process
 */
export class OnboardingTaskRecommendationWorkflow {
  /**
   * Triggers one fingerprint-scoped recommendation workflow run.
   *
   * Use when:
   * - The first completed Understanding source schedules recommendation generation
   *
   * Expects:
   * - A payload owned by the authenticated onboarding user
   *
   * Returns:
   * - The Hatchet trigger receipt for the durable workflow run
   */
  static async trigger(
    input: ProcessOnboardingTaskRecommendationPayload,
    options: TriggerOptions = {},
  ) {
    if (!process.env.HATCHET_CLIENT_TOKEN) {
      throw new Error('Onboarding task recommendation workflow is unavailable');
    }
    const payload = ProcessOnboardingTaskRecommendationPayloadSchema.parse(input);
    const traceHeaders = new Headers();
    injectActiveTraceHeaders(traceHeaders);
    return triggerHatchetWorkflow(PROCESS_PATH, payload, {
      concurrencyKey:
        options.flowControl?.key ?? `onboarding-task-recommendation.${payload.sessionId}`,
      headers: Object.fromEntries(traceHeaders.entries()),
      workflowRunId: options.workflowRunId,
    });
  }
}
