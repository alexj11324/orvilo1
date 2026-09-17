import { createHash } from 'node:crypto';

import {
  getUnderstandingSourceFingerprint,
  StaleUnderstandingSessionError,
  UnderstandingResourceNotFoundError,
  UnderstandingSessionNotFoundError,
} from '@orvilo/database';
import { observeOnboardingUnderstandingOperation } from '@orvilo/observability-otel/modules/onboarding-understanding';

import { getServerDB } from '@/database/server';
import { publishOnboardingGenerationProgress } from '@/server/services/onboardingProgress';
import {
  createUnderstandingService,
  type UnderstandingService,
} from '@/server/services/understanding/service';
import type { WorkflowContext } from '@/server/workflows/context';
import type { ProcessOnboardingTaskRecommendationPayload } from '@/server/workflows/onboardingTaskRecommendation';
import { getTaskRecommendationFlowControlKey } from '@/server/workflows/onboardingTaskRecommendation/types';
import { runStep } from '@/server/workflows/step';

import {
  getOnboardingUnderstandingTraceHeaders,
  observeOnboardingUnderstandingWorkflow,
} from './observability';
import {
  getUnderstandingWritingFlowControlKey,
  type ProcessCollectedUnderstandingPayload,
  type ProcessUnderstandingProvidersPayload,
  ProcessUnderstandingProvidersPayloadSchema,
} from './types';

type ProviderService = Pick<
  UnderstandingService,
  'failProvider' | 'failWriting' | 'get' | 'processProvider'
>;

type ProviderWorkflowContext = Pick<
  WorkflowContext<ProcessUnderstandingProvidersPayload>,
  'invoke' | 'requestPayload' | 'run'
> &
  Partial<Pick<WorkflowContext<ProcessUnderstandingProvidersPayload>, 'headers'>>;

interface ProviderWorkflowDependencies {
  createService?: (userId: string) => Promise<ProviderService>;
  processCollectedWorkflow?: unknown;
  triggerCollected?: (
    input: ProcessCollectedUnderstandingPayload,
    options: { workflowRunId: string },
  ) => Promise<unknown>;
  triggerTaskRecommendations: (
    input: ProcessOnboardingTaskRecommendationPayload,
    options: {
      flowControl: { key: string; parallelism: number };
      workflowRunId: string;
    },
  ) => Promise<unknown>;
}

interface ProviderFailureDependencies {
  createService?: (userId: string) => Promise<ProviderService>;
}

const createService = async (userId: string) =>
  createUnderstandingService({ db: await getServerDB(), userId });

const isTerminalizedSession = (error: unknown) =>
  error instanceof StaleUnderstandingSessionError ||
  error instanceof UnderstandingResourceNotFoundError ||
  error instanceof UnderstandingSessionNotFoundError;

const collectedWorkflowRunId = (sessionId: string, sourceFingerprint: string) =>
  `onboarding-understanding-collected-${createHash('sha256')
    .update(sessionId)
    .update('\0')
    .update(sourceFingerprint)
    .digest('hex')
    .slice(0, 32)}`;

const taskRecommendationWorkflowRunId = (sessionId: string, sourceFingerprint: string) =>
  `onboarding-task-recommendation-${createHash('sha256')
    .update(sessionId)
    .update('\0')
    .update(sourceFingerprint)
    .digest('hex')
    .slice(0, 32)}`;

/**
 * Collects selected Understanding providers and schedules fingerprint-scoped writers.
 *
 * Use when:
 * - Hatchet delivers an onboarding Understanding provider task
 *
 * Expects:
 * - A validated user, topic, session, and deterministic provider revision list
 *
 * Returns:
 * - The terminal result observed for each provider attempt
 *
 * Call stack:
 *
 * processProvidersWorkflow
 *   -> {@link processUnderstandingProviders}
 *     -> UnderstandingService.processProvider
 *       -> WorkflowContext.invoke(processCollectedWorkflow)
 */
export const processUnderstandingProviders = async (
  context: ProviderWorkflowContext,
  dependencies: ProviderWorkflowDependencies,
) => {
  const parsed = ProcessUnderstandingProvidersPayloadSchema.parse(context.requestPayload);
  const payload = {
    ...parsed,
    providers: parsed.providers.toSorted((left, right) => left.id.localeCompare(right.id)),
  };
  return observeOnboardingUnderstandingWorkflow(
    context,
    {
      operation: 'workflow.providers',
      sessionId: payload.sessionId,
      topicId: payload.topicId,
    },
    async () => {
      const service = await (dependencies.createService ?? createService)(payload.userId);

      // NOTICE:
      // Keep collection and downstream scheduling in separate deterministic stages so
      // provider completion order cannot change the child task graph.
      const providerResults = await Promise.all(
        payload.providers.map(async ({ id: providerId, revision }) => ({
          providerId,
          result: await runStep(context, `provider:${providerId}:${revision}:process`, () =>
            service.processProvider({
              providerId,
              revision,
              sessionId: payload.sessionId,
              topicId: payload.topicId,
            }),
          ),
          revision,
        })),
      );

      await Promise.all(
        providerResults.map(({ providerId }) =>
          observeOnboardingUnderstandingOperation(
            {
              operation: 'progress.publish',
              providerId,
              sessionId: payload.sessionId,
              topicId: payload.topicId,
            },
            () => publishOnboardingGenerationProgress(payload.userId, payload.topicId),
          ),
        ),
      );

      for (const { providerId, result, revision } of providerResults) {
        if (result.status !== 'completed' || result.revision !== revision) continue;

        const body = {
          responseLanguage: payload.responseLanguage,
          sessionId: payload.sessionId,
          sourceFingerprint: result.sourceFingerprint,
          ...(payload.startedAt === undefined ? {} : { startedAt: payload.startedAt }),
          topicId: payload.topicId,
          userId: payload.userId,
        };
        const workflowRunId = collectedWorkflowRunId(payload.sessionId, result.sourceFingerprint);
        if (dependencies.triggerCollected) {
          await runStep(context, `provider:${providerId}:write:${result.revision}`, () =>
            dependencies.triggerCollected!(body, { workflowRunId }),
          );
        } else {
          if (!context.invoke) {
            throw new Error('A workflow invoke handler is required for provider writing');
          }
          await context.invoke(`provider:${providerId}:write:${result.revision}`, {
            body,
            // Serialize writers for this session. The fingerprint CAS prevents a delayed older
            // invocation from terminalizing newer writing.
            flowControl: {
              key: getUnderstandingWritingFlowControlKey(payload.sessionId),
              parallelism: 1,
            },
            headers: getOnboardingUnderstandingTraceHeaders(),
            workflow: dependencies.processCollectedWorkflow,
            workflowRunId,
          });
        }
        if (payload.triggerTaskRecommendations !== false) {
          await runStep(context, `provider:${providerId}:recommend:${result.revision}`, () =>
            dependencies.triggerTaskRecommendations(
              {
                responseLanguage: payload.responseLanguage,
                sessionId: payload.sessionId,
                sourceFingerprint: result.sourceFingerprint,
                topicId: payload.topicId,
                userId: payload.userId,
              },
              {
                // Every completed provider may race to schedule a fingerprint-specific run. The
                // session-scoped flow-control key makes the first accepted fingerprint immutable.
                flowControl: {
                  key: getTaskRecommendationFlowControlKey(payload.sessionId),
                  parallelism: 1,
                },
                workflowRunId: taskRecommendationWorkflowRunId(
                  payload.sessionId,
                  result.sourceFingerprint,
                ),
              },
            ),
          );
        }
      }

      const providers = providerResults.map(({ providerId, result }) => ({
        failedCount: result.failedCount,
        providerId,
        revision: result.revision,
        sourceCount: result.sourceCount,
        status: result.status,
        succeededCount: result.succeededCount,
      }));

      return { providers };
    },
  );
};

/**
 * Terminalizes provider-workflow state after durable delivery retries are exhausted.
 *
 * Use when:
 * - Registering the failure callback for the provider collection workflow
 * - Preventing completed-source sessions from remaining in processing without a writer
 *
 * Expects:
 * - The payload identifies the exact provider revisions owned by the failed workflow run
 *
 * Returns:
 * - Provider identifiers transitioned from running to failed
 *
 * Call stack:
 *
 * processProvidersWorkflowOptions.failureFunction
 *   -> {@link failRunningUnderstandingProviders}
 *     -> UnderstandingService.failProvider
 *     -> UnderstandingService.failWriting
 */
export const failRunningUnderstandingProviders = async (
  input: unknown,
  dependencies: ProviderFailureDependencies = {},
) => {
  const payload = ProcessUnderstandingProvidersPayloadSchema.parse(input);
  const service = await (dependencies.createService ?? createService)(payload.userId);
  const failedProviderIds: string[] = [];

  await Promise.all(
    payload.providers.map(async ({ id: providerId, revision }) => {
      try {
        const failed = await service.failProvider({
          providerId,
          revision,
          sessionId: payload.sessionId,
          topicId: payload.topicId,
        });
        if (failed) {
          failedProviderIds.push(providerId);
          await publishOnboardingGenerationProgress(payload.userId, payload.topicId);
        }
      } catch (error) {
        if (!isTerminalizedSession(error)) throw error;
      }
    }),
  );

  try {
    const current = await service.get(payload.topicId);
    const hasActiveProvider = Object.values(current.sources).some(
      ({ status }) => status === 'pending' || status === 'running',
    );
    if (!hasActiveProvider && !current.writing) {
      const sourceFingerprint = getUnderstandingSourceFingerprint({
        feedback: current.feedback ?? { revision: 0, turns: [] },
        generationRevision: current.generationRevision ?? 0,
        id: current.id,
        sources: current.sources,
      });
      if (sourceFingerprint) {
        await service.failWriting({
          sessionId: payload.sessionId,
          sourceFingerprint,
          topicId: payload.topicId,
        });
        await publishOnboardingGenerationProgress(payload.userId, payload.topicId);
      }
    }
  } catch (error) {
    if (!isTerminalizedSession(error)) throw error;
  }

  return { failedProviderIds: failedProviderIds.sort() };
};

/**
 * Supplies validation and terminal failure handling for the provider workflow route.
 *
 * Use when:
 * - Registering the provider handler with the Hatchet worker
 *
 * Expects:
 * - JSON payloads matching the provider workflow schema
 *
 * Returns:
 * - Revision-scoped failure compensation for the Hatchet dispatch worker
 *
 * Call stack:
 *
 * Hatchet workflow dispatch failure
 *   -> {@link failRunningUnderstandingProviders}
 */
