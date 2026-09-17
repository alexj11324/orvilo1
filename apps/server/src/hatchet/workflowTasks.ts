import { createHash } from 'node:crypto';

import {
  type HatchetClient,
  type InputType,
  NonRetryableError,
} from '@hatchet-dev/typescript-sdk/v1/index.js';
import { and, asc, eq, inArray, lt, or } from 'drizzle-orm';
import type { Context as HonoContext } from 'hono';
import { z } from 'zod';

import { hatchetDispatches, hatchetWorkflowSteps } from '@/database/schemas';
import { getServerDB } from '@/database/server';
import { cancelHatchetTask, enqueueHatchetTask } from '@/libs/hatchet';
import { botCallback } from '@/server/router-hono/agent/handlers/botCallback';
import { groupMemberCallback } from '@/server/router-hono/agent/handlers/groupMemberCallback';
import { subAgentCallback } from '@/server/router-hono/agent/handlers/subAgentCallback';
import { threadRunCallback } from '@/server/router-hono/agent/handlers/threadRunCallback';
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
import {
  failMemoryExtractionTopic,
  processTopicHandler,
} from '@/server/router-hono/workflows/memory-user-memory/workflows/processTopic';
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
  WORKFLOW_DISPATCH_CONCURRENCY,
  workflowSerialKey,
} from '@/server/services/hatchet/workflowConcurrency';
import {
  HATCHET_WORKFLOW_PATHS,
  type HatchetWorkflowPath,
} from '@/server/services/hatchet/workflows';
import { runAgentSignalWorkflow } from '@/server/workflows/agentSignal/run';
import {
  createWorkflowContext,
  WorkflowAbort,
  WorkflowNonRetryableError,
  WorkflowStepInProgressError,
  type WorkflowStepStore,
} from '@/server/workflows/context';
import { runExpertiseHistoryWorkflow } from '@/server/workflows/expertiseHistory';
import { runExpertiseHistoryTopicWorkflow } from '@/server/workflows/expertiseHistory/topic';
import { OnboardingTaskRecommendationWorkflow } from '@/server/workflows/onboardingTaskRecommendation';
import {
  failOnboardingTaskRecommendations,
  processOnboardingTaskRecommendations,
} from '@/server/workflows/onboardingTaskRecommendation/process';
import { OnboardingUnderstandingWorkflow } from '@/server/workflows/onboardingUnderstanding';
import {
  failRunningUnderstandingWriting,
  processCollectedUnderstanding,
} from '@/server/workflows/onboardingUnderstanding/processCollected';
import {
  failRunningDetailedUnderstandingPersona,
  processDetailedUnderstandingPersona,
} from '@/server/workflows/onboardingUnderstanding/processDetailedPersona';
import {
  failRunningUnderstandingProviders,
  processUnderstandingProviders,
} from '@/server/workflows/onboardingUnderstanding/processProviders';

interface StoredWorkflowInput {
  body: unknown;
  dispatchId: string;
  headers?: Record<string, string>;
  workflowRunId: string;
}

type WorkflowRunner = (
  input: StoredWorkflowInput,
  stepStore?: WorkflowStepStore,
) => Promise<unknown>;

const WORKFLOW_DISPATCH_RETRIES = 5;
// A step lease outlives the task's 30-minute execution timeout. A retry can
// reclaim it only after the previous worker has had enough time to terminate;
// while the original worker is alive, its heartbeat keeps the lease fenced.
const WORKFLOW_STEP_LEASE_MS = 45 * 60 * 1000;
// The provider enforces a 30-minute execution timeout. A running row older
// than this cannot belong to a live attempt and is safe for the minute sweep
// to return to pending.
const WORKFLOW_DISPATCH_STALE_AFTER_MS = 35 * 60 * 1000;
const WORKFLOW_COORDINATION_RETRY_DELAY_MS = 30_000;
const WORKFLOW_STEP_GC_GRACE_MS = 5 * 60 * 1000;

const runWorkflowFailureCompensation = async (path: HatchetWorkflowPath, body: unknown) => {
  switch (path) {
    case '/api/workflows/memory-user-memory/pipelines/chat-topic/process-topic': {
      return failMemoryExtractionTopic(body);
    }
    case '/api/workflows/onboarding/task-recommendations/process': {
      return failOnboardingTaskRecommendations(body);
    }
    case '/api/workflows/onboarding/understanding/process-collected': {
      return failRunningUnderstandingWriting(body);
    }
    case '/api/workflows/onboarding/understanding/process-detailed-persona': {
      return failRunningDetailedUnderstandingPersona(body);
    }
    case '/api/workflows/onboarding/understanding/process-providers': {
      return failRunningUnderstandingProviders(body);
    }
    default: {
      return undefined;
    }
  }
};

const invoke = async <THandler extends (context: never) => Promise<unknown>>(
  handler: THandler,
  input: StoredWorkflowInput,
  stepStore?: WorkflowStepStore,
) =>
  handler(
    createWorkflowContext(input.body, input.headers, input.workflowRunId, {
      stepStore,
    }) as Parameters<THandler>[0],
  );

const readResponseBody = async (response: Response): Promise<Record<string, unknown>> => {
  const body = (await response.json()) as unknown;
  return body && typeof body === 'object' ? (body as Record<string, unknown>) : { body };
};

const createHonoContext = (input: StoredWorkflowInput): HonoContext =>
  ({
    json: (body: unknown, status = 200, headers?: HeadersInit) =>
      Response.json(body, { headers, status }),
    req: {
      header: (name: string) => {
        const normalized = name.toLowerCase();
        const entry = Object.entries(input.headers ?? {}).find(
          ([key]) => key.toLowerCase() === normalized,
        );
        return entry?.[1];
      },
      json: async () => input.body,
    },
  }) as unknown as HonoContext;

export const invokeHonoHandler = async (
  handler: (context: HonoContext) => Promise<Response>,
  input: StoredWorkflowInput,
) => {
  const response = await handler(createHonoContext(input));
  if (!response.ok) throw new Error(await response.text());
  return readResponseBody(response);
};

const createHatchetStepStore = (
  db: Awaited<ReturnType<typeof getServerDB>>,
  dispatchId: string,
  ownerToken: string,
): WorkflowStepStore => {
  const findStep = async (stepName: string) => {
    const [step] = await db
      .select({
        leaseExpiresAt: hatchetWorkflowSteps.leaseExpiresAt,
        ownerToken: hatchetWorkflowSteps.ownerToken,
        result: hatchetWorkflowSteps.result,
        resultIsUndefined: hatchetWorkflowSteps.resultIsUndefined,
        status: hatchetWorkflowSteps.status,
      })
      .from(hatchetWorkflowSteps)
      .where(
        and(
          eq(hatchetWorkflowSteps.dispatchId, dispatchId),
          eq(hatchetWorkflowSteps.stepName, stepName),
        ),
      )
      .limit(1);

    return step;
  };

  return {
    ownerToken,
    acquire: async (stepName, ownerToken) => {
      const now = new Date();
      const leaseExpiresAt = new Date(now.getTime() + WORKFLOW_STEP_LEASE_MS);
      const [inserted] = await db
        .insert(hatchetWorkflowSteps)
        .values({ dispatchId, leaseExpiresAt, ownerToken, stepName })
        .onConflictDoNothing()
        .returning({ status: hatchetWorkflowSteps.status });
      if (inserted) return { status: 'acquired' };

      const existing = await findStep(stepName);
      if (!existing) return { status: 'busy' };
      if (existing.status === 'completed') {
        return {
          result: existing.result,
          resultIsUndefined: existing.resultIsUndefined,
          status: 'completed' as const,
        };
      }
      if (existing.leaseExpiresAt > now) return { status: 'busy' };

      const [reclaimed] = await db
        .update(hatchetWorkflowSteps)
        .set({
          completedAt: null,
          leaseExpiresAt,
          ownerToken,
          result: null,
          resultIsUndefined: false,
          status: 'running',
          updatedAt: now,
        })
        .where(
          and(
            eq(hatchetWorkflowSteps.dispatchId, dispatchId),
            eq(hatchetWorkflowSteps.stepName, stepName),
            eq(hatchetWorkflowSteps.status, 'running'),
            lt(hatchetWorkflowSteps.leaseExpiresAt, now),
          ),
        )
        .returning({ status: hatchetWorkflowSteps.status });

      return reclaimed ? { status: 'acquired' } : { status: 'busy' };
    },
    complete: async (stepName, ownerToken, result) => {
      const [completed] = await db
        .update(hatchetWorkflowSteps)
        .set({
          completedAt: new Date(),
          result: result === undefined ? null : result,
          resultIsUndefined: result === undefined,
          status: 'completed',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(hatchetWorkflowSteps.dispatchId, dispatchId),
            eq(hatchetWorkflowSteps.stepName, stepName),
            eq(hatchetWorkflowSteps.ownerToken, ownerToken),
            eq(hatchetWorkflowSteps.status, 'running'),
          ),
        )
        .returning({ status: hatchetWorkflowSteps.status });
      if (completed) return;

      const existing = await findStep(stepName);
      if (existing?.status === 'completed') return;
      throw new Error(`Hatchet workflow step ownership lost: ${stepName}`);
    },
    release: async (stepName, ownerToken) => {
      await db
        .delete(hatchetWorkflowSteps)
        .where(
          and(
            eq(hatchetWorkflowSteps.dispatchId, dispatchId),
            eq(hatchetWorkflowSteps.stepName, stepName),
            eq(hatchetWorkflowSteps.ownerToken, ownerToken),
            eq(hatchetWorkflowSteps.status, 'running'),
          ),
        );
    },
    renew: async (stepName, ownerToken) => {
      const now = new Date();
      const [renewed] = await db
        .update(hatchetWorkflowSteps)
        .set({
          leaseExpiresAt: new Date(now.getTime() + WORKFLOW_STEP_LEASE_MS),
          updatedAt: now,
        })
        .where(
          and(
            eq(hatchetWorkflowSteps.dispatchId, dispatchId),
            eq(hatchetWorkflowSteps.stepName, stepName),
            eq(hatchetWorkflowSteps.ownerToken, ownerToken),
            eq(hatchetWorkflowSteps.status, 'running'),
          ),
        )
        .returning({ status: hatchetWorkflowSteps.status });

      if (!renewed) return false;

      const [dispatchRenewed] = await db
        .update(hatchetDispatches)
        .set({ updatedAt: now })
        .where(and(eq(hatchetDispatches.id, dispatchId), eq(hatchetDispatches.status, 'running')))
        .returning({ status: hatchetDispatches.status });

      return Boolean(dispatchRenewed);
    },
  };
};

const clearHatchetStepResults = async (
  db: Awaited<ReturnType<typeof getServerDB>>,
  dispatchId: string,
) => {
  try {
    await db
      .delete(hatchetWorkflowSteps)
      .where(
        and(
          eq(hatchetWorkflowSteps.dispatchId, dispatchId),
          eq(hatchetWorkflowSteps.status, 'completed'),
        ),
      );
  } catch (error) {
    // Step results are only a replay cache. A cleanup failure must not turn a
    // completed business workflow into a retry, but it remains observable for
    // the terminal reconciliation sweep to clean up later.
    console.error('[hatchet] failed to clear workflow step results', { dispatchId, error });
  }
};

export const completeHatchetDispatch = async (
  db: Awaited<ReturnType<typeof getServerDB>>,
  dispatchId: string,
  clearStepResults: () => Promise<void>,
) => {
  const [completed] = await db
    .update(hatchetDispatches)
    .set({ error: null, status: 'completed', updatedAt: new Date() })
    .where(and(eq(hatchetDispatches.id, dispatchId), eq(hatchetDispatches.status, 'running')))
    .returning({ id: hatchetDispatches.id });

  if (!completed) return false;
  await clearStepResults();
  return true;
};

export const recoverStaleHatchetDispatches = async (
  db: Awaited<ReturnType<typeof getServerDB>>,
  now = new Date(),
) => {
  const staleBefore = new Date(now.getTime() - WORKFLOW_DISPATCH_STALE_AFTER_MS);
  return db
    .update(hatchetDispatches)
    .set({
      error: 'Recovered stale running Hatchet dispatch',
      status: 'pending',
      updatedAt: now,
    })
    .where(
      and(eq(hatchetDispatches.status, 'running'), lt(hatchetDispatches.updatedAt, staleBefore)),
    )
    .returning({ id: hatchetDispatches.id });
};

const clearTerminalHatchetStepResults = async (
  db: Awaited<ReturnType<typeof getServerDB>>,
): Promise<number> => {
  const cleanupCutoff = new Date(Date.now() - WORKFLOW_STEP_GC_GRACE_MS);
  const terminal = await db
    .selectDistinct({ id: hatchetDispatches.id })
    .from(hatchetDispatches)
    .innerJoin(hatchetWorkflowSteps, eq(hatchetWorkflowSteps.dispatchId, hatchetDispatches.id))
    .where(
      and(
        inArray(hatchetDispatches.status, ['cancelled', 'completed', 'failed']),
        or(
          eq(hatchetWorkflowSteps.status, 'completed'),
          and(
            eq(hatchetWorkflowSteps.status, 'running'),
            lt(hatchetWorkflowSteps.leaseExpiresAt, cleanupCutoff),
          ),
        ),
      ),
    )
    .limit(1000);
  if (terminal.length === 0) return 0;

  const deleted = await db
    .delete(hatchetWorkflowSteps)
    .where(
      and(
        inArray(
          hatchetWorkflowSteps.dispatchId,
          terminal.map(({ id }) => id),
        ),
        or(
          eq(hatchetWorkflowSteps.status, 'completed'),
          and(
            eq(hatchetWorkflowSteps.status, 'running'),
            lt(hatchetWorkflowSteps.leaseExpiresAt, cleanupCutoff),
          ),
        ),
      ),
    )
    .returning({ dispatchId: hatchetWorkflowSteps.dispatchId });
  return deleted.length;
};

const runners: Record<HatchetWorkflowPath, WorkflowRunner> = {
  '/api/workflows/agent-eval-run/execute-test-case': (input, stepStore) =>
    invoke(executeTestCaseHandler, input, stepStore),
  '/api/workflows/agent-eval-run/finalize-run': (input, stepStore) =>
    invoke(finalizeRunHandler, input, stepStore),
  '/api/workflows/agent-eval-run/paginate-test-cases': (input, stepStore) =>
    invoke(paginateTestCasesHandler, input, stepStore),
  '/api/workflows/agent-eval-run/resume-agent-trajectory': (input, stepStore) =>
    invoke(resumeAgentTrajectoryHandler, input, stepStore),
  '/api/workflows/agent-eval-run/resume-thread-trajectory': (input, stepStore) =>
    invoke(resumeThreadTrajectoryHandler, input, stepStore),
  '/api/workflows/agent-eval-run/run-agent-trajectory': (input, stepStore) =>
    invoke(runAgentTrajectoryHandler, input, stepStore),
  '/api/workflows/agent-eval-run/run-benchmark': (input, stepStore) =>
    invoke(runBenchmarkHandler, input, stepStore),
  '/api/workflows/agent-eval-run/run-thread-trajectory': (input, stepStore) =>
    invoke(runThreadTrajectoryHandler, input, stepStore),
  '/api/agent/webhooks/bot-callback': (input) => invokeHonoHandler(botCallback, input),
  '/api/agent/webhooks/group-member-callback': (input) =>
    invokeHonoHandler(groupMemberCallback, input),
  '/api/agent/webhooks/subagent-callback': (input) => invokeHonoHandler(subAgentCallback, input),
  '/api/agent/webhooks/thread-run-callback': (input) => invokeHonoHandler(threadRunCallback, input),
  '/api/workflows/agent-eval-run/on-thread-complete': (input) =>
    invokeHonoHandler(onThreadComplete, input),
  '/api/workflows/agent-eval-run/on-trajectory-complete': (input) =>
    invokeHonoHandler(onTrajectoryComplete, input),
  '/api/workflows/agent-signal/execute-nightly-review-user': (input, stepStore) =>
    invoke(executeNightlyReviewUser, input, stepStore),
  '/api/workflows/agent-signal/paginate-nightly-review-users': (input, stepStore) =>
    invoke(paginateNightlyReviewUsers, input, stepStore),
  '/api/workflows/agent-signal/run': (input, stepStore) =>
    invoke(runAgentSignalWorkflow, input, stepStore),
  '/api/workflows/expertise-history/run': (input, stepStore) =>
    invoke(runExpertiseHistoryWorkflow, input, stepStore),
  '/api/workflows/expertise-history/topic': (input, stepStore) =>
    invoke(runExpertiseHistoryTopicWorkflow, input, stepStore),
  '/api/workflows/memory-user-memory/call-cron-hourly-analysis': (input, stepStore) =>
    invoke(hourlyWorkflowHandler, input, stepStore),
  '/api/workflows/memory-user-memory/pipelines/chat-topic/process-topic': (input, stepStore) =>
    invoke(processTopicHandler, input, stepStore),
  '/api/workflows/memory-user-memory/pipelines/chat-topic/process-topics': (input, stepStore) =>
    invoke(processTopicsHandler, input, stepStore),
  '/api/workflows/memory-user-memory/pipelines/chat-topic/process-user-topics': (
    input,
    stepStore,
  ) => invoke(processUserTopicsHandler, input, stepStore),
  '/api/workflows/memory-user-memory/pipelines/chat-topic/process-users': (input, stepStore) =>
    invoke(processUsersHandler, input, stepStore),
  '/api/workflows/memory-user-memory/pipelines/persona/update-writing': (input, stepStore) =>
    invoke(personaUpdateHandler, input, stepStore),
  '/api/workflows/onboarding/task-recommendations/process': (input, stepStore) =>
    invoke(processOnboardingTaskRecommendations, input, stepStore),
  '/api/workflows/onboarding/understanding/process-collected': (input, stepStore) =>
    processCollectedUnderstanding(
      createWorkflowContext(input.body, input.headers, input.workflowRunId, {
        stepStore,
      }) as Parameters<typeof processCollectedUnderstanding>[0],
      {
        triggerDetailedPersona: (payload, options) =>
          OnboardingUnderstandingWorkflow.triggerDetailedPersona(payload, options),
      },
    ),
  '/api/workflows/onboarding/understanding/process-detailed-persona': (input, stepStore) =>
    invoke(processDetailedUnderstandingPersona, input, stepStore),
  '/api/workflows/onboarding/understanding/process-providers': (input, stepStore) =>
    processUnderstandingProviders(
      createWorkflowContext(input.body, input.headers, input.workflowRunId, {
        stepStore,
      }) as Parameters<typeof processUnderstandingProviders>[0],
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
  '/api/workflows/task/on-creator-complete': (input) => invokeHonoHandler(onCreatorComplete, input),
  '/api/workflows/task/on-topic-complete': (input) => invokeHonoHandler(onTopicComplete, input),
  '/api/workflows/topic-auto-summary/dispatch': (input, stepStore) =>
    invoke(dispatchTopicAutoSummary, input, stepStore),
  '/api/workflows/topic-auto-summary/execute': (input, stepStore) =>
    invoke(executeTopicAutoSummary, input, stepStore),
  '/api/workflows/verify/on-evidence-complete': (input) =>
    invokeHonoHandler(onEvidenceComplete, input),
  '/api/workflows/verify/on-verifier-complete': (input) =>
    invokeHonoHandler(onVerifierComplete, input),
};

const workflowDispatchInput = z.object({
  coordinationRetry: z.boolean().optional(),
  deduplicationKey: z.string().min(1),
  dispatchId: z.string().uuid(),
  laneKey: z.string().length(64),
  serialKey: z.string().uuid().optional(),
});

export const scheduleWorkflowCoordinationRetry = (
  input: z.infer<typeof workflowDispatchInput>,
  retryCount: number,
) =>
  enqueueHatchetTask(
    HATCHET_TASK_NAMES.workflowDispatch,
    {
      coordinationRetry: true,
      ...(input.serialKey ? { serialKey: input.serialKey } : {}),
      deduplicationKey: `${input.deduplicationKey}:coordination:${retryCount}`,
      dispatchId: input.dispatchId,
      laneKey: input.laneKey,
    },
    { delayMs: WORKFLOW_COORDINATION_RETRY_DELAY_MS },
  );

export const markCoordinationRetryPending = async (
  db: Awaited<ReturnType<typeof getServerDB>>,
  dispatchId: string,
  scheduleError: unknown,
) => {
  await db
    .update(hatchetDispatches)
    .set({
      error: `Failed to reschedule an active Hatchet step: ${
        scheduleError instanceof Error ? scheduleError.message : String(scheduleError)
      }`,
      // Let the minute sweep enqueue a fresh provider attempt after this
      // exhausted coordination attempt exits. The step lease still fences
      // the previous owner if it wakes up after the state transition.
      status: 'pending',
      updatedAt: new Date(),
    })
    .where(and(eq(hatchetDispatches.id, dispatchId), eq(hatchetDispatches.status, 'running')));
};

const isWorkflowPath = (path: string): path is HatchetWorkflowPath =>
  HATCHET_WORKFLOW_PATHS.includes(path as HatchetWorkflowPath);

export const enqueueStoredDispatch = async (dispatch: typeof hatchetDispatches.$inferSelect) => {
  const providerRunId = await enqueueHatchetTask(HATCHET_TASK_NAMES.workflowDispatch, {
    ...workflowSerialKey(dispatch.payload.path, dispatch.id),
    deduplicationKey: createHash('sha256')
      .update(dispatch.payload.path)
      .update('\0')
      .update(dispatch.payload.workflowRunId)
      .digest('hex'),
    dispatchId: dispatch.id,
    laneKey: dispatch.laneKey,
  });
  const db = await getServerDB();
  // Store the provider receipt before attempting pending→queued. The worker
  // may claim the stale pending row while this sweep is between statements;
  // cancellation still needs the receipt in that race.
  await db
    .update(hatchetDispatches)
    .set({ providerRunId, updatedAt: new Date() })
    .where(eq(hatchetDispatches.id, dispatch.id));
  const [transitioned] = await db
    .update(hatchetDispatches)
    .set({ error: null, status: 'queued', updatedAt: new Date() })
    .where(and(eq(hatchetDispatches.id, dispatch.id), eq(hatchetDispatches.status, 'pending')))
    .returning({ status: hatchetDispatches.status });

  if (!transitioned) {
    const [current] = await db
      .select({ providerRunId: hatchetDispatches.providerRunId, status: hatchetDispatches.status })
      .from(hatchetDispatches)
      .where(eq(hatchetDispatches.id, dispatch.id))
      .limit(1);
    if (current?.status === 'cancelled') {
      await cancelHatchetTask(providerRunId).catch((error) => {
        console.error('[hatchet] failed to cancel swept dispatch', {
          dispatchId: dispatch.id,
          error,
          providerRunId,
        });
      });
    }
  }
};

export const createWorkflowHatchetTasks = (hatchet: HatchetClient) => {
  const workflowDispatch = hatchet.task({
    name: HATCHET_TASK_NAMES.workflowDispatch,
    backoff: { factor: 2, maxSeconds: 300 },
    concurrency: WORKFLOW_DISPATCH_CONCURRENCY,
    executionTimeout: '30m',
    fn: async (rawInput: z.infer<typeof workflowDispatchInput> & InputType, hatchetContext) => {
      const input = workflowDispatchInput.parse(rawInput);
      const retryCount = hatchetContext.retryCount();
      const db = await getServerDB();
      const [dispatch] = await db
        .select()
        .from(hatchetDispatches)
        .where(eq(hatchetDispatches.id, input.dispatchId))
        .limit(1);
      if (!dispatch) throw new Error(`Hatchet dispatch not found: ${input.dispatchId}`);
      if (
        dispatch.status === 'cancelled' ||
        dispatch.status === 'completed' ||
        dispatch.status === 'failed'
      ) {
        await clearHatchetStepResults(db, dispatch.id);
        return { deduped: true, success: true };
      }
      if (!isWorkflowPath(dispatch.payload.path)) {
        await db
          .update(hatchetDispatches)
          .set({
            error: `Unsupported Hatchet workflow path: ${dispatch.payload.path}`,
            status: 'failed',
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(hatchetDispatches.id, dispatch.id),
              inArray(hatchetDispatches.status, ['pending', 'queued', 'running']),
            ),
          );
        throw new NonRetryableError(`Unsupported Hatchet workflow path: ${dispatch.payload.path}`);
      }

      const claimableStatuses: Array<'pending' | 'queued' | 'running'> =
        retryCount > 0 || input.coordinationRetry
          ? ['pending', 'queued', 'running']
          : ['pending', 'queued'];
      const [claimed] = await db
        .update(hatchetDispatches)
        .set({ error: null, status: 'running', updatedAt: new Date() })
        .where(
          and(
            eq(hatchetDispatches.id, dispatch.id),
            inArray(hatchetDispatches.status, claimableStatuses),
          ),
        )
        .returning({ id: hatchetDispatches.id });
      if (!claimed) return { deduped: true, success: true };

      const [claimedState] = await db
        .select({ status: hatchetDispatches.status })
        .from(hatchetDispatches)
        .where(eq(hatchetDispatches.id, dispatch.id))
        .limit(1);
      if (!claimedState || claimedState.status === 'cancelled') {
        await clearHatchetStepResults(db, dispatch.id);
        return { cancelled: true, success: true };
      }

      try {
        const stepStore = createHatchetStepStore(
          db,
          dispatch.id,
          `${hatchetContext.taskRunExternalId()}:${retryCount}`,
        );
        await runners[dispatch.payload.path](
          {
            body: dispatch.payload.body,
            headers: dispatch.payload.headers,
            workflowRunId: dispatch.payload.workflowRunId,
            dispatchId: dispatch.id,
          },
          stepStore,
        );
        await completeHatchetDispatch(db, dispatch.id, () =>
          clearHatchetStepResults(db, dispatch.id),
        );
        return { success: true };
      } catch (error) {
        if (error instanceof WorkflowAbort) {
          await completeHatchetDispatch(db, dispatch.id, () =>
            clearHatchetStepResults(db, dispatch.id),
          );
          return { aborted: true, success: true };
        }

        if (error instanceof WorkflowStepInProgressError) {
          // Another Hatchet attempt still owns the step. Do not spend the
          // business retry budget or run failure compensation while that
          // owner is alive. A delayed successor also recovers a worker that
          // disappeared after claiming the step and before completing it.
          if (retryCount >= WORKFLOW_DISPATCH_RETRIES) {
            try {
              await scheduleWorkflowCoordinationRetry(input, retryCount);
            } catch (scheduleError) {
              await markCoordinationRetryPending(db, dispatch.id, scheduleError);
              throw scheduleError;
            }
            return { deferred: true, success: true };
          }

          throw error;
        }

        const isTerminalFailure =
          error instanceof WorkflowNonRetryableError || retryCount >= WORKFLOW_DISPATCH_RETRIES;
        let compensationError: unknown;
        if (isTerminalFailure) {
          try {
            await runWorkflowFailureCompensation(dispatch.payload.path, dispatch.payload.body);
          } catch (failureError) {
            compensationError = failureError;
            console.error('[hatchet] workflow failure compensation failed', {
              dispatchId: dispatch.id,
              error: failureError,
              path: dispatch.payload.path,
            });
          }
        }

        await db
          .update(hatchetDispatches)
          .set({
            error:
              compensationError instanceof Error
                ? `${error instanceof Error ? error.message : String(error)}; compensation: ${compensationError.message}`
                : error instanceof Error
                  ? error.message
                  : String(error),
            status: isTerminalFailure ? 'failed' : 'running',
            updatedAt: new Date(),
          })
          .where(
            and(eq(hatchetDispatches.id, dispatch.id), eq(hatchetDispatches.status, 'running')),
          );
        if (isTerminalFailure) await clearHatchetStepResults(db, dispatch.id);
        if (error instanceof WorkflowNonRetryableError) {
          throw new NonRetryableError(error.message);
        }
        if (compensationError) throw compensationError;
        throw error;
      }
    },
    idempotency: {
      expression: 'input.deduplicationKey',
      fallbackTtlMs: 7 * 24 * 60 * 60 * 1000,
      strategy: 'status',
    },
    inputValidator: workflowDispatchInput,
    retries: WORKFLOW_DISPATCH_RETRIES,
  });

  const workflowDispatchSweep = hatchet.task({
    name: HATCHET_TASK_NAMES.workflowDispatchSweep,
    executionTimeout: '15m',
    fn: async () => {
      const db = await getServerDB();
      const cleaned = await clearTerminalHatchetStepResults(db);
      const recovered = await recoverStaleHatchetDispatches(db);
      const pending = await db
        .select()
        .from(hatchetDispatches)
        .where(eq(hatchetDispatches.status, 'pending'))
        .orderBy(asc(hatchetDispatches.createdAt))
        .limit(100);
      const results = await Promise.allSettled(pending.map(enqueueStoredDispatch));
      const failed = results.filter((result) => result.status === 'rejected').length;
      if (failed > 0) throw new Error(`Failed to enqueue ${failed} pending Hatchet dispatches`);
      return { cleaned, queued: pending.length, recovered: recovered.length, success: true };
    },
    onCrons: ['* * * * *'],
    retries: 3,
  });

  return [workflowDispatch, workflowDispatchSweep];
};
