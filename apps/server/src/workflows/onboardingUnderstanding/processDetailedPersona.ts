import {
  StaleUnderstandingRevisionError,
  StaleUnderstandingSessionError,
  UnderstandingResourceNotFoundError,
  UnderstandingSessionNotFoundError,
} from '@orvilo/database';
import {
  observeOnboardingUnderstandingOperation,
  recordOnboardingUnderstandingEndToEndDuration,
} from '@orvilo/observability-otel/modules/onboarding-understanding';

import { getServerDB } from '@/database/server';
import { publishOnboardingGenerationProgress } from '@/server/services/onboardingProgress';
import {
  createUnderstandingService,
  type UnderstandingService,
} from '@/server/services/understanding/service';
import type { WorkflowContext } from '@/server/workflows/context';
import { runStep } from '@/server/workflows/step';

import { observeOnboardingUnderstandingWorkflow } from './observability';
import {
  type ProcessCollectedUnderstandingPayload,
  ProcessCollectedUnderstandingPayloadSchema,
} from './types';

type DetailedPersonaService = Pick<
  UnderstandingService,
  'failDetailedPersona' | 'processDetailedPersona'
>;

type DetailedPersonaWorkflowContext = Pick<
  WorkflowContext<ProcessCollectedUnderstandingPayload>,
  'requestPayload' | 'run'
> &
  Partial<Pick<WorkflowContext<ProcessCollectedUnderstandingPayload>, 'headers'>>;

interface DetailedPersonaWorkflowDependencies {
  createService?: (userId: string) => Promise<DetailedPersonaService>;
}

const createService = async (userId: string) =>
  createUnderstandingService({ db: await getServerDB(), userId });

const isStaleSession = (error: unknown) =>
  error instanceof UnderstandingResourceNotFoundError ||
  error instanceof UnderstandingSessionNotFoundError ||
  error instanceof StaleUnderstandingRevisionError ||
  error instanceof StaleUnderstandingSessionError;

/**
 * Runs the full persona pass after the quick Understanding proposal has been published.
 *
 * Use when:
 * - The quick writer has committed a current source-fingerprint proposal
 *
 * Expects:
 * - A validated workflow payload owned by one personal user
 *
 * Returns:
 * - Whether the detailed persona was published for the current fingerprint
 *
 * Call stack:
 *
 * processDetailedPersonaWorkflow
 *   -> {@link processDetailedUnderstandingPersona}
 *     -> UnderstandingService.processDetailedPersona
 */
export const processDetailedUnderstandingPersona = async (
  context: DetailedPersonaWorkflowContext,
  dependencies: DetailedPersonaWorkflowDependencies = {},
) => {
  const payload = ProcessCollectedUnderstandingPayloadSchema.parse(context.requestPayload);
  return observeOnboardingUnderstandingWorkflow(
    context,
    {
      operation: 'workflow.detailed-persona',
      sessionId: payload.sessionId,
      topicId: payload.topicId,
    },
    async () => {
      const service = await (dependencies.createService ?? createService)(payload.userId);
      const result = await runStep(context, 'detailed-persona:process', async () => {
        try {
          const result = await service.processDetailedPersona({
            expectedSourceFingerprint: payload.sourceFingerprint,
            responseLanguage: payload.responseLanguage,
            sessionId: payload.sessionId,
            topicId: payload.topicId,
          });
          if (result.published) {
            recordOnboardingUnderstandingEndToEndDuration(payload.startedAt);
          }
          return result;
        } catch (error) {
          if (isStaleSession(error)) {
            return { published: false as const, sourceFingerprint: payload.sourceFingerprint };
          }
          throw error;
        }
      });
      await observeOnboardingUnderstandingOperation(
        {
          operation: 'progress.publish',
          sessionId: payload.sessionId,
          topicId: payload.topicId,
        },
        () => publishOnboardingGenerationProgress(payload.userId, payload.topicId),
      );
      return result;
    },
  );
};

/**
 * Marks only the current detailed persona pass failed when its workflow exhausts retries.
 *
 * Use when:
 * - The Hatchet workflow dispatch exhausts its retries
 *
 * Expects:
 * - Unknown input that must match the collected Understanding payload
 *
 * Returns:
 * - Whether the current detailed pass was terminalized
 */
export const failRunningDetailedUnderstandingPersona = async (
  input: unknown,
  dependencies: DetailedPersonaWorkflowDependencies = {},
) => {
  const payload = ProcessCollectedUnderstandingPayloadSchema.parse(input);
  const service = await (dependencies.createService ?? createService)(payload.userId);
  try {
    const failed = await service.failDetailedPersona({
      sessionId: payload.sessionId,
      sourceFingerprint: payload.sourceFingerprint,
      topicId: payload.topicId,
    });
    if (failed) await publishOnboardingGenerationProgress(payload.userId, payload.topicId);
    return { failed: Boolean(failed) };
  } catch (error) {
    if (isStaleSession(error)) return { failed: false };
    throw error;
  }
};
