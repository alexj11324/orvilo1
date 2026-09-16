import { injectActiveTraceHeaders } from '@/libs/observability/traceparent';
import { triggerHatchetWorkflow } from '@/server/services/hatchet/workflows';

import {
  type ProcessCollectedUnderstandingPayload,
  ProcessCollectedUnderstandingPayloadSchema,
  type ProcessUnderstandingProvidersPayload,
  ProcessUnderstandingProvidersPayloadSchema,
} from './types';

export type {
  ProcessCollectedUnderstandingPayload,
  ProcessUnderstandingProvidersPayload,
} from './types';

const PROCESS_PROVIDERS_PATH = '/api/workflows/onboarding/understanding/process-providers';
const PROCESS_COLLECTED_PATH = '/api/workflows/onboarding/understanding/process-collected';
const PROCESS_DETAILED_PERSONA_PATH =
  '/api/workflows/onboarding/understanding/process-detailed-persona';

export class UnderstandingWorkflowUnavailableError extends Error {
  readonly code = 'ONBOARDING_UNDERSTANDING_WORKFLOW_UNAVAILABLE';

  constructor() {
    super('Onboarding understanding workflow is unavailable');
    this.name = 'UnderstandingWorkflowUnavailableError';
  }
}

export class OnboardingUnderstandingWorkflow {
  static assertAvailable() {
    if (!process.env.HATCHET_CLIENT_TOKEN) {
      throw new UnderstandingWorkflowUnavailableError();
    }
  }

  static async triggerProviders(
    input: ProcessUnderstandingProvidersPayload,
    options?: { workflowRunId?: string },
  ) {
    this.assertAvailable();
    const parsed = ProcessUnderstandingProvidersPayloadSchema.parse(input);
    const payload = {
      ...parsed,
      providers: parsed.providers.toSorted((left, right) => left.id.localeCompare(right.id)),
    };
    const traceHeaders = new Headers();
    injectActiveTraceHeaders(traceHeaders);

    return triggerHatchetWorkflow(PROCESS_PROVIDERS_PATH, payload, {
      concurrencyKey: `onboarding-understanding.providers.${payload.sessionId}`,
      headers: Object.fromEntries(traceHeaders.entries()),
      workflowRunId: options?.workflowRunId,
    });
  }

  static async triggerWriting(
    input: ProcessCollectedUnderstandingPayload,
    options?: { workflowRunId?: string },
  ) {
    this.assertAvailable();
    const payload = ProcessCollectedUnderstandingPayloadSchema.parse(input);
    const traceHeaders = new Headers();
    injectActiveTraceHeaders(traceHeaders);

    return triggerHatchetWorkflow(PROCESS_COLLECTED_PATH, payload, {
      concurrencyKey: `onboarding-understanding.writing.${payload.sessionId}`,
      headers: Object.fromEntries(traceHeaders.entries()),
      workflowRunId: options?.workflowRunId,
    });
  }

  static async triggerDetailedPersona(
    input: ProcessCollectedUnderstandingPayload,
    options?: { workflowRunId?: string },
  ) {
    this.assertAvailable();
    const payload = ProcessCollectedUnderstandingPayloadSchema.parse(input);
    const traceHeaders = new Headers();
    injectActiveTraceHeaders(traceHeaders);

    return triggerHatchetWorkflow(PROCESS_DETAILED_PERSONA_PATH, payload, {
      concurrencyKey: `onboarding-understanding.detailed.${payload.sessionId}`,
      headers: Object.fromEntries(traceHeaders.entries()),
      workflowRunId: options?.workflowRunId,
    });
  }
}
