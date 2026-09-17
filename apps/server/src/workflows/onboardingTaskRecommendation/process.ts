import { errorNameFrom } from '@orvilo/utils';

import { getServerDB } from '@/database/server';
import { publishOnboardingGenerationProgress } from '@/server/services/onboardingProgress';
import {
  createTaskRecommendationService,
  type TaskRecommendationProviderResult,
  type TaskRecommendationService,
} from '@/server/services/taskRecommendation/service';
import type { WorkflowContext } from '@/server/workflows/context';
import { runStep } from '@/server/workflows/step';

import {
  type ProcessOnboardingTaskRecommendationPayload,
  ProcessOnboardingTaskRecommendationPayloadSchema,
} from './types';

type RecommendationWorkflowService = Pick<
  TaskRecommendationService,
  'begin' | 'commit' | 'fail' | 'generateProvider' | 'get'
>;

type RecommendationWorkflowContext = Pick<
  WorkflowContext<ProcessOnboardingTaskRecommendationPayload>,
  'requestPayload' | 'run'
>;

interface RecommendationWorkflowDependencies {
  createService?: (userId: string) => Promise<RecommendationWorkflowService>;
}

const createService = async (userId: string) =>
  createTaskRecommendationService({ db: await getServerDB(), userId });

/**
 * Runs independent provider generation steps and commits one polling result.
 *
 * Call stack:
 *
 * processOnboardingTaskRecommendations
 *   -> {@link TaskRecommendationService.begin}
 *     -> {@link TaskRecommendationService.generateProvider}[]
 *       -> {@link TaskRecommendationService.commit}
 */
export const processOnboardingTaskRecommendations = async (
  context: RecommendationWorkflowContext,
  dependencies: RecommendationWorkflowDependencies = {},
) => {
  const payload = ProcessOnboardingTaskRecommendationPayloadSchema.parse(context.requestPayload);
  const service = await (dependencies.createService ?? createService)(payload.userId);
  const plan = await runStep(context, 'session:begin', () =>
    service.begin(payload.topicId, payload.sessionId, payload.sourceFingerprint),
  );
  await publishOnboardingGenerationProgress(payload.userId, payload.topicId);
  if (!plan.ready) return service.get(payload.topicId);

  const results = await Promise.all(
    plan.providerIds.map((providerId) =>
      runStep(
        context,
        `provider:${providerId}:generate`,
        async (): Promise<TaskRecommendationProviderResult> => {
          try {
            return await service.generateProvider(providerId, plan.limit, payload.responseLanguage);
          } catch (error) {
            console.error('[taskRecommendation:provider]', {
              errorName: errorNameFrom(error) ?? 'UnknownError',
              providerId,
            });
            return {
              error: {
                code: 'TASK_RECOMMENDATION_PROVIDER_FAILED',
                providerId,
                retryable: true,
              },
              providerId,
              recommendations: [],
            };
          }
        },
      ),
    ),
  );
  const session = await runStep(context, 'session:commit', () =>
    service.commit(payload.topicId, payload.sessionId, results),
  );
  await publishOnboardingGenerationProgress(payload.userId, payload.topicId);
  return session;
};

/** Terminalizes a recommendation session after workflow-level retries are exhausted. */
export const failOnboardingTaskRecommendations = async (
  input: unknown,
  dependencies: RecommendationWorkflowDependencies = {},
) => {
  const payload = ProcessOnboardingTaskRecommendationPayloadSchema.parse(input);
  const service = await (dependencies.createService ?? createService)(payload.userId);
  const failed = await service.fail(payload.topicId, payload.sessionId);
  if (failed) await publishOnboardingGenerationProgress(payload.userId, payload.topicId);
  return failed;
};
