import { MemorySourceType } from '@orvilo/types';
import { chunk } from 'es-toolkit/compat';

import { AsyncTaskModel } from '@/database/models/asyncTask';
import { type ListTopicsForMemoryExtractorCursor } from '@/database/models/topic';
import { getServerDB } from '@/database/server';
import { parseMemoryExtractionConfig } from '@/server/globalConfig/parseMemoryExtractionConfig';
import { type MemoryExtractionPayloadInput } from '@/server/services/memory/userMemory/extract';
import {
  buildWorkflowPayloadInput,
  MemoryExtractionExecutor,
  MemoryExtractionWorkflowService,
  normalizeMemoryExtractionPayload,
} from '@/server/services/memory/userMemory/extract';
import { isUserMemoryExtractionEnabled } from '@/server/services/memory/userMemory/gate';
import type { WorkflowContext } from '@/server/workflows/context';
import { parseWorkflowDate, runStep } from '@/server/workflows/step';

import { checkGuard, ensureWorkflowStarted } from './runGuard';
import { appendHourlyWorkflowRunId, isHourlyMemoryExtractionCancelled } from './utils';

const TOPIC_PAGE_SIZE = 50;
const TOPIC_BATCH_SIZE = 20;
const WORKFLOW_PATH = 'api/workflows/memory-user-memory/pipelines/chat-topic/process-user-topics';
const { workflowExtraHeaders, workflow } = parseMemoryExtractionConfig();

// NOTICE: Hard per-user, per-run fan-out ceiling. flowControl only bounds concurrency, not queue
// depth, so this count cap is what actually prevents one heavy user from backing up a massive
// Hatchet fan-out. Remaining un-extracted topics resume on later hourly runs, so it self-drains.
const MAX_TOPICS_PER_USER_PER_RUN = workflow?.maxTopicsPerUserPerRun ?? 100;

export const processUserTopicsHandler = async (
  context: WorkflowContext<MemoryExtractionPayloadInput>,
) => {
  await ensureWorkflowStarted(context, WORKFLOW_PATH);

  const params = normalizeMemoryExtractionPayload(context.requestPayload || {});

  // NOTICE: Return (never throw) on a guard match — a throw before the first step makes the worker
  // re-enqueue the run, turning a "disable" guard into an infinite retry storm.
  const entryGuard = await checkGuard(context, WORKFLOW_PATH);
  if (!entryGuard.result) return entryGuard.response;

  if (!params.userIds.length) {
    return { message: 'No user ids provided for topic processing.' };
  }
  if (!params.sources.includes(MemorySourceType.ChatTopic)) {
    return { message: 'No supported sources requested, skip topic processing.' };
  }

  let executor: Awaited<ReturnType<typeof MemoryExtractionExecutor.create>> | undefined;
  const getExecutor = async () => {
    executor ??= await MemoryExtractionExecutor.create();
    return executor;
  };

  const scheduleNextPage = async (
    userId: string,
    cursorCreatedAt: Date,
    cursorId: string,
    fanoutCount: number,
  ) => {
    return MemoryExtractionWorkflowService.triggerProcessUserTopics(
      {
        ...buildWorkflowPayloadInput({
          ...params,
          topicCursor: {
            createdAt: cursorCreatedAt.toISOString(),
            id: cursorId,
            userId,
          },
          // Carry the running fan-out count so the per-user ceiling spans the whole page chain.
          topicFanoutCount: fanoutCount,
          topicIds: [],
          userId,
          userIds: [userId],
        }),
      },
      { extraHeaders: workflowExtraHeaders },
    );
  };

  let processedUsers = 0;

  for (const userId of params.userIds) {
    // Unified production gate: a user who disabled memory never fans out topic
    // extraction, no matter which entry scheduled this run.
    const memoryEnabledStepName = `memory:user-memory:extract:users:${userId}:memory-enabled-check`;
    const memoryEnabledGuard = await checkGuard(context, WORKFLOW_PATH, {
      stepName: memoryEnabledStepName,
    });
    if (!memoryEnabledGuard.result) return memoryEnabledGuard.response;

    const memoryEnabled = await runStep(context, memoryEnabledStepName, () =>
      isUserMemoryExtractionEnabled(userId),
    );
    if (!memoryEnabled) {
      continue;
    }

    if (params.asyncTaskId) {
      // NOTICE: Cooperative cascading cancellation for the workflow tree.
      // A cancelled root task should stop at user-topic pagination and avoid enqueuing topic batches.
      const stepName = `memory:user-memory:extract:users:${userId}:cancel-check`;
      const guard = await checkGuard(context, WORKFLOW_PATH, { stepName });
      if (!guard.result) return guard.response;

      const cancelled = await runStep(context, stepName, () =>
        getServerDB().then((db) =>
          new AsyncTaskModel(
            db,
            userId,
            params.workspaceId,
          ).isUserMemoryExtractionCancellationRequested(params.asyncTaskId!),
        ),
      );
      if (cancelled) {
        continue;
      }
    }

    const hourlyCancellationStepName = `memory:user-memory:extract:users:${userId}:cancel-check:hourly`;
    const hourlyCancellationGuard = await checkGuard(context, WORKFLOW_PATH, {
      stepName: hourlyCancellationStepName,
    });
    if (!hourlyCancellationGuard.result) return hourlyCancellationGuard.response;

    const hourlyCancelled = await runStep(context, hourlyCancellationStepName, () =>
      isHourlyMemoryExtractionCancelled(params.hourlyTaskId),
    );
    if (hourlyCancelled) {
      return {
        message: 'Hourly memory extraction task cancellation requested, skip user topic fan-out.',
        processedUsers: 0,
        skipped: true,
      };
    }

    const activeExecutor = await getExecutor();

    const topicCursor =
      params.topicCursor && params.topicCursor.userId === userId
        ? {
            createdAt: parseWorkflowDate(
              params.topicCursor.createdAt,
              'Invalid topic cursor date in the process-user-topics payload',
            ),
            id: params.topicCursor.id,
          }
        : undefined;

    let topicsFromPayload: string[] | undefined;
    if (params.topicIds && params.topicIds.length > 0) {
      const stepName = `memory:user-memory:extract:users:${userId}:filter-topic-ids`;
      const guard = await checkGuard(context, WORKFLOW_PATH, { stepName });
      if (!guard.result) return guard.response;

      topicsFromPayload = await runStep(context, stepName, async () => {
        const filtered = await activeExecutor.filterTopicIdsForUser(
          userId,
          params.topicIds,
          params.workspaceId,
        );
        return filtered.length > 0 ? filtered : undefined;
      });
    }

    const listTopicsStepName = `memory:user-memory:extract:users:${userId}:list-topics:${topicCursor?.id || 'root'}`;
    const listTopicsGuard = await checkGuard(context, WORKFLOW_PATH, {
      stepName: listTopicsStepName,
    });
    if (!listTopicsGuard.result) return listTopicsGuard.response;

    const topicBatch = await runStep<{
      cursor?: ListTopicsForMemoryExtractorCursor;
      ids: string[];
    }>(context, listTopicsStepName, () =>
      topicsFromPayload && topicsFromPayload.length > 0
        ? Promise.resolve({ ids: topicsFromPayload })
        : activeExecutor.getTopicsForUser(
            {
              cursor: topicCursor,
              forceAll: params.forceAll,
              forceTopics: params.forceTopics,
              from: params.from,
              to: params.to,
              userId,
              workspaceId: params.workspaceId,
            },
            TOPIC_PAGE_SIZE,
          ),
    );

    const ids = topicBatch.ids;
    if (!ids.length) {
      continue;
    }

    const cursor = 'cursor' in topicBatch ? topicBatch.cursor : undefined;

    // NOTICE: Enforce the hard per-user, per-run fan-out ceiling on the paginated discovery path.
    // Explicit topicIds requests (topicsFromPayload) are user-intended and never capped. The count
    // rides in the payload across pages; any topics beyond the ceiling stay un-extracted and are
    // picked up by later hourly runs, so no data is dropped.
    const fanoutCount = params.topicFanoutCount;
    const remainingBudget = topicsFromPayload
      ? ids.length
      : Math.max(0, MAX_TOPICS_PER_USER_PER_RUN - fanoutCount);
    const idsToProcess = topicsFromPayload ? ids : ids.slice(0, remainingBudget);

    for (const [batchIndex, topicIds] of chunk(idsToProcess, TOPIC_BATCH_SIZE).entries()) {
      // Trigger the child through the Hatchet dispatch helper so it gets its own
      // retry and concurrency identity.
      const stepName = `memory:user-memory:extract:users:${userId}:process-topics-batch:${batchIndex}`;
      const guard = await checkGuard(context, WORKFLOW_PATH, { stepName });
      if (!guard.result) return guard.response;

      const result = await runStep(context, stepName, () =>
        MemoryExtractionWorkflowService.triggerProcessTopics(
          userId,
          {
            ...buildWorkflowPayloadInput(params),
            topicCursor: undefined,
            topicIds,
            userId,
            userIds: [userId],
          },
          { extraHeaders: workflowExtraHeaders },
        ),
      );
      await appendHourlyWorkflowRunId(params.hourlyTaskId, result.workflowRunId);
    }

    const nextFanoutCount = fanoutCount + idsToProcess.length;

    // Stop paginating once the per-user ceiling is reached; the remainder resumes next hourly run.
    if (!topicsFromPayload && cursor && nextFanoutCount < MAX_TOPICS_PER_USER_PER_RUN) {
      const hourlyNextPageCancellationStepName = `memory:user-memory:extract:users:${userId}:cancel-check:hourly-next-page`;
      const hourlyNextPageCancellationGuard = await checkGuard(context, WORKFLOW_PATH, {
        stepName: hourlyNextPageCancellationStepName,
      });
      if (!hourlyNextPageCancellationGuard.result) {
        return hourlyNextPageCancellationGuard.response;
      }

      const hourlyNextPageCancelled = await runStep(
        context,
        hourlyNextPageCancellationStepName,
        () => isHourlyMemoryExtractionCancelled(params.hourlyTaskId),
      );
      if (hourlyNextPageCancelled) {
        return {
          message:
            'Hourly memory extraction task cancellation requested, skip next user topics page.',
          processedUsers: 1,
          skipped: true,
        };
      }

      const stepName = `memory:user-memory:extract:users:${userId}:topics:${cursor.id}:schedule-next-batch`;
      const guard = await checkGuard(context, WORKFLOW_PATH, { stepName });
      if (!guard.result) return guard.response;

      const result = await runStep(context, stepName, () =>
        scheduleNextPage(
          userId,
          // The cursor crossed a step boundary, so its timestamp arrives as an ISO string.
          parseWorkflowDate(
            cursor.createdAt,
            'Invalid cursor date when scheduling next topic page',
          ),
          cursor.id,
          nextFanoutCount,
        ),
      );
      await appendHourlyWorkflowRunId(params.hourlyTaskId, result.workflowRunId);
    }

    processedUsers += 1;
  }

  return { processedUsers };
};
