import { chunk } from 'es-toolkit/compat';

import { AsyncTaskModel } from '@/database/models/asyncTask';
import { getServerDB } from '@/database/server';
import { parseMemoryExtractionConfig } from '@/server/globalConfig/parseMemoryExtractionConfig';
import {
  buildWorkflowPayloadInput,
  MemoryExtractionExecutor,
  type MemoryExtractionPayloadInput,
  MemoryExtractionWorkflowService,
  normalizeMemoryExtractionPayload,
  type UserPaginationResult,
} from '@/server/services/memory/userMemory/extract';
import { filterMemoryExtractionEnabledUsers } from '@/server/services/memory/userMemory/gate';
import type { WorkflowContext } from '@/server/workflows/context';
import { parseWorkflowDate, runStep } from '@/server/workflows/step';

import { checkGuard, ensureWorkflowStarted } from './runGuard';
import {
  appendHourlyWorkflowRunId,
  isHourlyMemoryExtractionCancelled,
  serializeWorkflowCursor,
} from './utils';

const USER_PAGE_SIZE = 50;
const USER_BATCH_SIZE = 20;
const WORKFLOW_PATH = 'api/workflows/memory-user-memory/pipelines/chat-topic/process-users';
const { workflowExtraHeaders } = parseMemoryExtractionConfig();

export const processUsersHandler = async (
  context: WorkflowContext<MemoryExtractionPayloadInput>,
) => {
  await ensureWorkflowStarted(context, WORKFLOW_PATH);

  const params = normalizeMemoryExtractionPayload(context.requestPayload || {});

  // NOTICE: Return (never throw) on a guard match — a throw before the first step makes the worker
  // re-enqueue the run, turning a "disable" guard into an infinite retry storm.
  const entryGuard = await checkGuard(context, WORKFLOW_PATH);
  if (!entryGuard.result) return entryGuard.response;

  if (params.sources.length === 0) {
    return { message: 'No sources provided, skip memory extraction.' };
  }
  if (params.asyncTaskId && params.userIds[0]) {
    // NOTICE: Cooperative cascading cancellation for the workflow tree.
    // If root task has cancelRequestedAt, this stage stops scheduling child workflows.
    const stepName = 'memory:user-memory:extract:cancel-check:root';
    const guard = await checkGuard(context, WORKFLOW_PATH, { stepName });
    if (!guard.result) return guard.response;

    const cancelled = await runStep(context, stepName, () =>
      getServerDB().then((db) =>
        new AsyncTaskModel(
          db,
          params.userIds[0]!,
          params.workspaceId,
        ).isUserMemoryExtractionCancellationRequested(params.asyncTaskId!),
      ),
    );
    if (cancelled) {
      return { message: 'Memory extraction task cancellation requested, skip processing users.' };
    }
  }

  const hourlyCancellationStepName = 'memory:user-memory:extract:users:cancel-check:hourly';
  const hourlyCancellationGuard = await checkGuard(context, WORKFLOW_PATH, {
    stepName: hourlyCancellationStepName,
  });
  if (!hourlyCancellationGuard.result) return hourlyCancellationGuard.response;

  const hourlyCancelled = await runStep(context, hourlyCancellationStepName, () =>
    isHourlyMemoryExtractionCancelled(params.hourlyTaskId),
  );
  if (hourlyCancelled) {
    return {
      message: 'Hourly memory extraction task cancellation requested, skip processing users.',
      skipped: true,
    };
  }

  const executor = await MemoryExtractionExecutor.create();

  // Hatchet task inputs only support serializable data in plain JSON,
  // this causes the Date object to be converted into string when passed as parameter from
  // context to child workflow. So we need to convert it back to Date object here.
  const userCursor = params.userCursor
    ? {
        createdAt: parseWorkflowDate(
          params.userCursor.createdAt,
          'Invalid cursor date when reading the user page cursor',
        ),
        id: params.userCursor.id,
      }
    : undefined;

  const getUsersStepName = 'memory:user-memory:extract:get-users';
  const getUsersGuard = await checkGuard(context, WORKFLOW_PATH, { stepName: getUsersStepName });
  if (!getUsersGuard.result) return getUsersGuard.response;

  // NOTICE: the explicit type argument keeps both ternary branches on one shape. Left to inference
  // the step returns a union, and `'cursor' in userBatch` then narrows against a member that has no
  // `cursor` at all, which erases the cursor's own type.
  const userBatch = await runStep<UserPaginationResult>(context, getUsersStepName, async () => {
    if (params.userIds.length > 0) {
      // Unified production gate: explicit targets that disabled memory are
      // dropped here and re-checked per stage downstream. Paged sweeps are
      // gated inside the user listing itself.
      const { enabledUserIds } = await filterMemoryExtractionEnabledUsers(params.userIds);
      return { ids: enabledUserIds };
    }

    return executor.getUsers(USER_PAGE_SIZE, userCursor);
  });

  const ids = userBatch.ids;
  if (ids.length === 0) {
    return { message: 'No users to process for memory extraction.' };
  }

  const cursor = 'cursor' in userBatch ? userBatch.cursor : undefined;

  const batches = chunk(ids, USER_BATCH_SIZE);
  if (params.dryRun) {
    return {
      batches: batches.length,
      dryRun: true,
      nextCursor: cursor ? cursor.id : null,
      processedUsers: ids.length,
      scheduledBatches: 0,
    };
  }

  for (const [index, userIds] of batches.entries()) {
    const stepName = `memory:user-memory:extract:users:process-topic-batches:${index}`;
    const guard = await checkGuard(context, WORKFLOW_PATH, { stepName });
    if (!guard.result) return guard.response;

    const result = await runStep(context, stepName, () =>
      MemoryExtractionWorkflowService.triggerProcessUserTopics(
        {
          ...buildWorkflowPayloadInput(params),
          topicCursor: undefined,
          userId: userIds[0],
          userIds,
        },
        { extraHeaders: workflowExtraHeaders },
      ),
    );
    await appendHourlyWorkflowRunId(params.hourlyTaskId, result.workflowRunId);
  }

  if (params.userIds.length === 0 && cursor) {
    const hourlyNextPageCancellationStepName =
      'memory:user-memory:extract:users:cancel-check:hourly-next-page';
    const hourlyNextPageCancellationGuard = await checkGuard(context, WORKFLOW_PATH, {
      stepName: hourlyNextPageCancellationStepName,
    });
    if (!hourlyNextPageCancellationGuard.result) return hourlyNextPageCancellationGuard.response;

    const hourlyNextPageCancelled = await runStep(context, hourlyNextPageCancellationStepName, () =>
      isHourlyMemoryExtractionCancelled(params.hourlyTaskId),
    );
    if (hourlyNextPageCancelled) {
      return {
        batches: batches.length,
        message: 'Hourly memory extraction task cancellation requested, skip next users page.',
        processedUsers: ids.length,
        skipped: true,
      };
    }

    const stepName = 'memory:user-memory:extract:users:schedule-next-user-batch';
    const guard = await checkGuard(context, WORKFLOW_PATH, { stepName });
    if (!guard.result) return guard.response;

    const result = await runStep(context, stepName, () =>
      MemoryExtractionWorkflowService.triggerProcessUsers(
        {
          ...buildWorkflowPayloadInput({
            ...params,
            userCursor: serializeWorkflowCursor(
              cursor,
              'Invalid cursor date when scheduling next user page',
            ),
          }),
        },
        { extraHeaders: workflowExtraHeaders },
      ),
    );
    await appendHourlyWorkflowRunId(params.hourlyTaskId, result.workflowRunId);
  }

  return {
    batches: batches.length,
    nextCursor: cursor ? cursor.id : null,
    processedUsers: ids.length,
  };
};
