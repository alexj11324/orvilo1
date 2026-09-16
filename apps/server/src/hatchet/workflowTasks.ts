import { createHash } from 'node:crypto';

import {
  ConcurrencyLimitStrategy,
  type HatchetClient,
  type InputType,
  NonRetryableError,
} from '@hatchet-dev/typescript-sdk/v1';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { hatchetDispatches } from '@/database/schemas';
import { getServerDB } from '@/database/server';
import { enqueueHatchetTask } from '@/libs/hatchet';
import { botCallback } from '@/server/router-hono/agent/handlers/botCallback';
import { groupMemberCallback } from '@/server/router-hono/agent/handlers/groupMemberCallback';
import { subAgentCallback } from '@/server/router-hono/agent/handlers/subAgentCallback';
import { onThreadComplete } from '@/server/router-hono/workflows/agent-eval-run/handlers/onThreadComplete';
import { onTrajectoryComplete } from '@/server/router-hono/workflows/agent-eval-run/handlers/onTrajectoryComplete';
import { executeTestCaseHandler } from '@/server/router-hono/workflows/agent-eval-run/workflows/executeTestCase';
import { finalizeRunHandler } from '@/server/router-hono/workflows/agent-eval-run/workflows/finalizeRun';
import { paginateTestCasesHandler } from '@/server/router-hono/workflows/agent-eval-run/workflows/paginateTestCases';
import { resumeAgentTrajectoryHandler } from '@/server/router-hono/workflows/agent-eval-run/workflows/resumeAgentTrajectory';
import { resumeThreadTrajectoryHandler } from '@/server/router-hono/workflows/agent-eval-run/workflows/resumeThreadTrajectory';
import { runAgentTrajectoryHandler } from '@/server/router-hono/workflows/agent-eval-run/workflows/runAgentTrajectory';
import { runBenchmarkHandler } from '@/server/router-hono/workflows/agent-eval-run/workflows/runBenchmark';
import { runThreadTrajectoryHandler } from '@/server/router-hono/workflows/agent-eval-run/workflows/runThreadTrajectory';
import {
  executeNightlyReviewUser,
  paginateNightlyReviewUsers,
} from '@/server/router-hono/workflows/agent-signal/workflows/nightlyReview';
import { hourlyWorkflowHandler } from '@/server/router-hono/workflows/memory-user-memory/workflows/hourly';
import { personaUpdateHandler } from '@/server/router-hono/workflows/memory-user-memory/workflows/personaUpdate';
import { processTopicHandler } from '@/server/router-hono/workflows/memory-user-memory/workflows/processTopic';
import { processTopicsHandler } from '@/server/router-hono/workflows/memory-user-memory/workflows/processTopics';
import { processUsersHandler } from '@/server/router-hono/workflows/memory-user-memory/workflows/processUsers';
import { processUserTopicsHandler } from '@/server/router-hono/workflows/memory-user-memory/workflows/processUserTopics';
import { onCreatorComplete } from '@/server/router-hono/workflows/task/handlers/onCreatorComplete';
import { onTopicComplete } from '@/server/router-hono/workflows/task/handlers/onTopicComplete';
import { dispatchTopicAutoSummary } from '@/server/router-hono/workflows/topic-auto-summary/dispatch';
import { executeTopicAutoSummary } from '@/server/router-hono/workflows/topic-auto-summary/execute';
import { onEvidenceComplete } from '@/server/router-hono/workflows/verify/handlers/onEvidenceComplete';
import { onVerifierComplete } from '@/server/router-hono/workflows/verify/handlers/onVerifierComplete';
import { HATCHET_TASK_NAMES } from '@/server/services/hatchet/taskNames';
import {
  HATCHET_WORKFLOW_PATHS,
  type HatchetWorkflowPath,
} from '@/server/services/hatchet/workflows';
import { runAgentSignalWorkflow } from '@/server/workflows/agentSignal/run';
import {
  createWorkflowContext,
  WorkflowAbort,
  WorkflowNonRetryableError,
} from '@/server/workflows/context';
import { runExpertiseHistoryWorkflow } from '@/server/workflows/expertiseHistory';
import { runExpertiseHistoryTopicWorkflow } from '@/server/workflows/expertiseHistory/topic';
import { OnboardingTaskRecommendationWorkflow } from '@/server/workflows/onboardingTaskRecommendation';
import { processOnboardingTaskRecommendations } from '@/server/workflows/onboardingTaskRecommendation/process';
import { OnboardingUnderstandingWorkflow } from '@/server/workflows/onboardingUnderstanding';
import { processCollectedUnderstanding } from '@/server/workflows/onboardingUnderstanding/processCollected';
import { processDetailedUnderstandingPersona } from '@/server/workflows/onboardingUnderstanding/processDetailedPersona';
import { processUnderstandingProviders } from '@/server/workflows/onboardingUnderstanding/processProviders';

interface StoredWorkflowInput {
  body: unknown;
  headers?: Record<string, string>;
  workflowRunId: string;
}

type WorkflowRunner = (input: StoredWorkflowInput) => Promise<unknown>;

const invoke = async <THandler extends (context: never) => Promise<unknown>>(
  handler: THandler,
  input: StoredWorkflowInput,
) =>
  handler(
    createWorkflowContext(
      input.body,
      input.headers,
      input.workflowRunId,
    ) as Parameters<THandler>[0],
  );

const runners: Record<HatchetWorkflowPath, WorkflowRunner> = {
  '/api/workflows/agent-eval-run/execute-test-case': (input) =>
    invoke(executeTestCaseHandler, input),
  '/api/workflows/agent-eval-run/finalize-run': (input) => invoke(finalizeRunHandler, input),
  '/api/workflows/agent-eval-run/paginate-test-cases': (input) =>
    invoke(paginateTestCasesHandler, input),
  '/api/workflows/agent-eval-run/resume-agent-trajectory': (input) =>
    invoke(resumeAgentTrajectoryHandler, input),
  '/api/workflows/agent-eval-run/resume-thread-trajectory': (input) =>
    invoke(resumeThreadTrajectoryHandler, input),
  '/api/workflows/agent-eval-run/run-agent-trajectory': (input) =>
    invoke(runAgentTrajectoryHandler, input),
  '/api/workflows/agent-eval-run/run-benchmark': (input) => invoke(runBenchmarkHandler, input),
  '/api/workflows/agent-eval-run/run-thread-trajectory': (input) =>
    invoke(runThreadTrajectoryHandler, input),
  '/api/agent/webhooks/bot-callback': (input) => invoke(botCallback, input),
  '/api/agent/webhooks/group-member-callback': (input) => invoke(groupMemberCallback, input),
  '/api/agent/webhooks/subagent-callback': (input) => invoke(subAgentCallback, input),
  '/api/workflows/agent-eval-run/on-thread-complete': (input) => invoke(onThreadComplete, input),
  '/api/workflows/agent-eval-run/on-trajectory-complete': (input) =>
    invoke(onTrajectoryComplete, input),
  '/api/workflows/agent-signal/execute-nightly-review-user': (input) =>
    invoke(executeNightlyReviewUser, input),
  '/api/workflows/agent-signal/paginate-nightly-review-users': (input) =>
    invoke(paginateNightlyReviewUsers, input),
  '/api/workflows/agent-signal/run': (input) => invoke(runAgentSignalWorkflow, input),
  '/api/workflows/expertise-history/run': (input) => invoke(runExpertiseHistoryWorkflow, input),
  '/api/workflows/expertise-history/topic': (input) =>
    invoke(runExpertiseHistoryTopicWorkflow, input),
  '/api/workflows/memory-user-memory/call-cron-hourly-analysis': (input) =>
    invoke(hourlyWorkflowHandler, input),
  '/api/workflows/memory-user-memory/pipelines/chat-topic/process-topic': (input) =>
    invoke(processTopicHandler, input),
  '/api/workflows/memory-user-memory/pipelines/chat-topic/process-topics': (input) =>
    invoke(processTopicsHandler, input),
  '/api/workflows/memory-user-memory/pipelines/chat-topic/process-user-topics': (input) =>
    invoke(processUserTopicsHandler, input),
  '/api/workflows/memory-user-memory/pipelines/chat-topic/process-users': (input) =>
    invoke(processUsersHandler, input),
  '/api/workflows/memory-user-memory/pipelines/persona/update-writing': (input) =>
    invoke(personaUpdateHandler, input),
  '/api/workflows/onboarding/task-recommendations/process': (input) =>
    invoke(processOnboardingTaskRecommendations, input),
  '/api/workflows/onboarding/understanding/process-collected': (input) =>
    processCollectedUnderstanding(
      createWorkflowContext(input.body, input.headers, input.workflowRunId) as Parameters<
        typeof processCollectedUnderstanding
      >[0],
      {
        triggerDetailedPersona: (payload, options) =>
          OnboardingUnderstandingWorkflow.triggerDetailedPersona(payload, options),
      },
    ),
  '/api/workflows/onboarding/understanding/process-detailed-persona': (input) =>
    invoke(processDetailedUnderstandingPersona, input),
  '/api/workflows/onboarding/understanding/process-providers': (input) =>
    processUnderstandingProviders(
      createWorkflowContext(input.body, input.headers, input.workflowRunId) as Parameters<
        typeof processUnderstandingProviders
      >[0],
      {
        processCollectedWorkflow: {} as Parameters<
          typeof processUnderstandingProviders
        >[1]['processCollectedWorkflow'],
        triggerCollected: (payload, options) =>
          OnboardingUnderstandingWorkflow.triggerWriting(payload, options),
        triggerTaskRecommendations: (payload, options) =>
          OnboardingTaskRecommendationWorkflow.trigger(payload, options),
      },
    ),
  '/api/workflows/task/on-creator-complete': (input) => invoke(onCreatorComplete, input),
  '/api/workflows/task/on-topic-complete': (input) => invoke(onTopicComplete, input),
  '/api/workflows/topic-auto-summary/dispatch': (input) => invoke(dispatchTopicAutoSummary, input),
  '/api/workflows/topic-auto-summary/execute': (input) => invoke(executeTopicAutoSummary, input),
  '/api/workflows/verify/on-evidence-complete': (input) => invoke(onEvidenceComplete, input),
  '/api/workflows/verify/on-verifier-complete': (input) => invoke(onVerifierComplete, input),
};

const workflowDispatchInput = z.object({
  deduplicationKey: z.string().min(1),
  dispatchId: z.string().uuid(),
  laneKey: z.string().length(64),
});

const isWorkflowPath = (path: string): path is HatchetWorkflowPath =>
  HATCHET_WORKFLOW_PATHS.includes(path as HatchetWorkflowPath);

const enqueueStoredDispatch = async (dispatch: typeof hatchetDispatches.$inferSelect) => {
  const providerRunId = await enqueueHatchetTask(HATCHET_TASK_NAMES.workflowDispatch, {
    deduplicationKey: createHash('sha256')
      .update(dispatch.payload.path)
      .update('\0')
      .update(dispatch.payload.workflowRunId)
      .digest('hex'),
    dispatchId: dispatch.id,
    laneKey: dispatch.laneKey,
  });
  const db = await getServerDB();
  await db
    .update(hatchetDispatches)
    .set({ error: null, providerRunId, status: 'queued', updatedAt: new Date() })
    .where(eq(hatchetDispatches.id, dispatch.id));
};

export const createWorkflowHatchetTasks = (hatchet: HatchetClient) => {
  const workflowDispatch = hatchet.task({
    name: HATCHET_TASK_NAMES.workflowDispatch,
    backoff: { factor: 2, maxSeconds: 300 },
    concurrency: {
      expression: 'input.laneKey',
      limitStrategy: ConcurrencyLimitStrategy.GROUP_ROUND_ROBIN,
      maxRuns: 1,
    },
    executionTimeout: '30m',
    fn: async (rawInput: z.infer<typeof workflowDispatchInput> & InputType) => {
      const input = workflowDispatchInput.parse(rawInput);
      const db = await getServerDB();
      const [dispatch] = await db
        .select()
        .from(hatchetDispatches)
        .where(eq(hatchetDispatches.id, input.dispatchId))
        .limit(1);
      if (!dispatch) throw new Error(`Hatchet dispatch not found: ${input.dispatchId}`);
      if (dispatch.status === 'cancelled' || dispatch.status === 'completed') {
        return { deduped: true, success: true };
      }
      if (!isWorkflowPath(dispatch.payload.path)) {
        throw new Error(`Unsupported Hatchet workflow path: ${dispatch.payload.path}`);
      }

      await db
        .update(hatchetDispatches)
        .set({ error: null, status: 'running', updatedAt: new Date() })
        .where(eq(hatchetDispatches.id, dispatch.id));
      try {
        await runners[dispatch.payload.path]({
          body: dispatch.payload.body,
          headers: dispatch.payload.headers,
          workflowRunId: dispatch.payload.workflowRunId,
        });
        await db
          .update(hatchetDispatches)
          .set({ error: null, status: 'completed', updatedAt: new Date() })
          .where(eq(hatchetDispatches.id, dispatch.id));
        return { success: true };
      } catch (error) {
        if (error instanceof WorkflowAbort) {
          await db
            .update(hatchetDispatches)
            .set({ error: null, status: 'completed', updatedAt: new Date() })
            .where(eq(hatchetDispatches.id, dispatch.id));
          return { aborted: true, success: true };
        }
        await db
          .update(hatchetDispatches)
          .set({
            error: error instanceof Error ? error.message : String(error),
            status: 'failed',
            updatedAt: new Date(),
          })
          .where(eq(hatchetDispatches.id, dispatch.id));
        if (error instanceof WorkflowNonRetryableError) {
          throw new NonRetryableError(error.message);
        }
        throw error;
      }
    },
    idempotency: {
      expression: 'input.deduplicationKey',
      fallbackTtlMs: 7 * 24 * 60 * 60 * 1000,
      strategy: 'status',
    },
    inputValidator: workflowDispatchInput,
    retries: 5,
  });

  const workflowDispatchSweep = hatchet.task({
    name: HATCHET_TASK_NAMES.workflowDispatchSweep,
    executionTimeout: '15m',
    fn: async () => {
      const db = await getServerDB();
      const pending = await db
        .select()
        .from(hatchetDispatches)
        .where(eq(hatchetDispatches.status, 'pending'))
        .orderBy(asc(hatchetDispatches.createdAt))
        .limit(100);
      const results = await Promise.allSettled(pending.map(enqueueStoredDispatch));
      const failed = results.filter((result) => result.status === 'rejected').length;
      if (failed > 0) throw new Error(`Failed to enqueue ${failed} pending Hatchet dispatches`);
      return { queued: pending.length, success: true };
    },
    onCrons: ['* * * * *'],
    retries: 3,
  });

  return [workflowDispatch, workflowDispatchSweep];
};
