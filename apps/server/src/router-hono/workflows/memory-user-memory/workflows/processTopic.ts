import { SpanStatusCode } from '@orvilo/observability-otel/api';
import {
  buildUpstashWorkflowMetricAttributes,
  tracer as upstashWorkflowTracer,
} from '@orvilo/observability-otel/modules/upstash-workflow';
import { LayersEnum, MemorySourceType } from '@orvilo/types';
import { errorMessageFrom } from '@orvilo/utils';

import { AsyncTaskModel } from '@/database/models/asyncTask';
import { getServerDB } from '@/database/server';
import { type MemoryExtractionPayloadInput } from '@/server/services/memory/userMemory/extract';
import {
  MemoryExtractionExecutor,
  normalizeMemoryExtractionPayload,
} from '@/server/services/memory/userMemory/extract';
import type { WorkflowContext } from '@/server/workflows/context';
import { WorkflowAbort, WorkflowNonRetryableError } from '@/server/workflows/context';
import { runStep } from '@/server/workflows/step';

import { checkGuard, ensureWorkflowStarted } from './runGuard';
import { isHourlyMemoryExtractionCancelled } from './utils';

const CEPA_LAYERS: LayersEnum[] = [
  LayersEnum.Context,
  LayersEnum.Experience,
  LayersEnum.Preference,
  LayersEnum.Activity,
];

const IDENTITY_LAYERS: LayersEnum[] = [LayersEnum.Identity];
const WORKFLOW_PATH = 'api/workflows/memory-user-memory/pipelines/chat-topic/process-topic';

export const processTopicHandler = async (context: WorkflowContext<MemoryExtractionPayloadInput>) =>
  upstashWorkflowTracer.startActiveSpan(
    'workflow:memory-user-memory:process-topic',
    async (span) => {
      await ensureWorkflowStarted(context, WORKFLOW_PATH);

      const payload = normalizeMemoryExtractionPayload(context.requestPayload || {});

      span.setAttributes({
        ...buildUpstashWorkflowMetricAttributes(context),
        'workflow.memory_user_memory.layers': payload.layers.join(','),
        'workflow.memory_user_memory.source': payload.sources.join(','),
        'workflow.memory_user_memory.topic_id': payload.topicIds[0],
        'workflow.memory_user_memory.user_id': payload.userIds[0],
        'workflow.name': 'memory-user-memory:process-topic',
      });

      try {
        // NOTICE: Return (never throw) on a guard match — a throw before the first step makes
        // the worker re-enqueue the run, turning a "disable" guard into an infinite retry storm.
        const entryGuard = await checkGuard(context, WORKFLOW_PATH);
        if (!entryGuard.result) {
          span.setStatus({ code: SpanStatusCode.OK });
          return entryGuard.response;
        }

        const topicId = payload.topicIds[0];
        const userId = payload.userIds[0];

        if (!userId || !topicId) {
          span.setStatus({ code: SpanStatusCode.OK });
          return { message: 'Missing userId or topicId for topic workflow.' };
        }

        if (!payload.sources.includes(MemorySourceType.ChatTopic)) {
          span.setStatus({ code: SpanStatusCode.OK });
          return { message: 'Source not supported in topic workflow.' };
        }

        if (payload.asyncTaskId) {
          // NOTICE: Cooperative cascading cancellation for the workflow tree.
          // Check before CEPA extraction so cancelled tasks stop at the earliest safe boundary.
          const stepName = `memory:user-memory:extract:users:${userId}:topics:${topicId}:cancel-check:before`;
          const guard = await checkGuard(context, WORKFLOW_PATH, { stepName });
          if (!guard.result) {
            span.setStatus({ code: SpanStatusCode.OK });
            return guard.response;
          }

          const cancelled = await runStep(context, stepName, () =>
            getServerDB().then((db) =>
              new AsyncTaskModel(
                db,
                userId,
                payload.workspaceId,
              ).isUserMemoryExtractionCancellationRequested(payload.asyncTaskId!),
            ),
          );
          if (cancelled) {
            span.setStatus({ code: SpanStatusCode.OK });
            return { message: 'Memory extraction task cancellation requested, skip topic.' };
          }
        }

        {
          const stepName = `memory:user-memory:extract:users:${userId}:topics:${topicId}:cancel-check:hourly-before`;
          const guard = await checkGuard(context, WORKFLOW_PATH, {
            stepName,
          });
          if (!guard.result) {
            span.setStatus({ code: SpanStatusCode.OK });
            return guard.response;
          }

          const hourlyCancelled = await runStep(context, stepName, () =>
            isHourlyMemoryExtractionCancelled(payload.hourlyTaskId),
          );
          if (hourlyCancelled) {
            span.setStatus({ code: SpanStatusCode.OK });
            return {
              message: 'Hourly memory extraction task cancellation requested, skip topic.',
              skipped: true,
            };
          }
        }

        const executor = await MemoryExtractionExecutor.create();

        {
          let layers = CEPA_LAYERS;
          if (payload.layers.length) {
            layers = payload.layers.filter((layer) => CEPA_LAYERS.includes(layer));
          }

          const stepName = `memory:user-memory:extract:users:${userId}:topics:${topicId}:cepa`;
          const guard = await checkGuard(context, WORKFLOW_PATH, { stepName });
          if (!guard.result) {
            span.setStatus({ code: SpanStatusCode.OK });
            return guard.response;
          }

          await runStep(context, stepName, () =>
            executor.extractTopic({
              asyncTaskId: payload.asyncTaskId,
              forceAll: payload.forceAll,
              forceTopics: payload.forceTopics,
              from: payload.from,
              layers,
              reportProgress: false,
              source: MemorySourceType.ChatTopic,
              to: payload.to,
              topicId,
              userId,
              userInitiated: payload.userInitiated,
              workspaceId: payload.workspaceId,
            }),
          );
        }
        {
          {
            const stepName = `memory:user-memory:extract:users:${userId}:topics:${topicId}:cancel-check:hourly-identity`;
            const guard = await checkGuard(context, WORKFLOW_PATH, {
              stepName,
            });
            if (!guard.result) {
              span.setStatus({ code: SpanStatusCode.OK });
              return guard.response;
            }

            const hourlyCancelled = await runStep(context, stepName, () =>
              isHourlyMemoryExtractionCancelled(payload.hourlyTaskId),
            );
            if (hourlyCancelled) {
              span.setStatus({ code: SpanStatusCode.OK });
              return {
                message:
                  'Hourly memory extraction task cancellation requested, skip identity extraction.',
                skipped: true,
              };
            }
          }

          if (payload.asyncTaskId) {
            // NOTICE: Cooperative cascading cancellation for the workflow tree.
            // Re-check before identity extraction to avoid running sequential identity step after cancel.
            const stepName = `memory:user-memory:extract:users:${userId}:topics:${topicId}:cancel-check:identity`;
            const guard = await checkGuard(context, WORKFLOW_PATH, { stepName });
            if (!guard.result) {
              span.setStatus({ code: SpanStatusCode.OK });
              return guard.response;
            }

            const cancelled = await runStep(context, stepName, () =>
              getServerDB().then((db) =>
                new AsyncTaskModel(
                  db,
                  userId,
                  payload.workspaceId,
                ).isUserMemoryExtractionCancellationRequested(payload.asyncTaskId!),
              ),
            );
            if (cancelled) {
              span.setStatus({ code: SpanStatusCode.OK });
              return {
                message: 'Memory extraction task cancellation requested, skip identity extraction.',
              };
            }
          }

          let layers = IDENTITY_LAYERS;
          if (payload.layers.length) {
            layers = payload.layers.filter((layer) => IDENTITY_LAYERS.includes(layer));
          }

          const stepName = `memory:user-memory:extract:users:${userId}:topics:${topicId}:identity`;
          const guard = await checkGuard(context, WORKFLOW_PATH, { stepName });
          if (!guard.result) {
            span.setStatus({ code: SpanStatusCode.OK });
            return guard.response;
          }

          await runStep(context, stepName, () =>
            executor.extractTopic({
              asyncTaskId: payload.asyncTaskId,
              forceAll: payload.forceAll,
              forceTopics: payload.forceTopics,
              from: payload.from,
              layers,
              reportProgress: false,
              source: MemorySourceType.ChatTopic,
              to: payload.to,
              topicId,
              userId,
              userInitiated: payload.userInitiated,
              workspaceId: payload.workspaceId,
            }),
          );
        }

        if (payload.asyncTaskId && payload.userInitiated) {
          const stepName = `memory:user-memory:extract:users:${userId}:topics:${topicId}:progress`;
          const guard = await checkGuard(context, WORKFLOW_PATH, { stepName });
          if (!guard.result) {
            span.setStatus({ code: SpanStatusCode.OK });
            return guard.response;
          }

          await runStep(context, stepName, () =>
            getServerDB().then((db) =>
              new AsyncTaskModel(
                db,
                userId,
                payload.workspaceId,
              ).incrementUserMemoryExtractionProgress(payload.asyncTaskId!),
            ),
          );
        }

        span.setStatus({ code: SpanStatusCode.OK });
        return {
          processedTopics: 1,
          processedUsers: 1,
          topicId,
          userId,
        };
      } catch (error) {
        // Let internal workflow aborts bubble through but treat others as non-retry-able
        if (error instanceof WorkflowAbort) throw error;

        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: errorMessageFrom(error) || 'process-topic workflow failed',
        });

        // Avoid infinite retries on non-retry-able errors
        throw new WorkflowNonRetryableError(
          errorMessageFrom(error) || 'process-topic workflow failed',
        );
      } finally {
        span.end();
      }
    },
  );

/**
 * Records progress when a topic workflow reaches its terminal retry failure.
 * The async task owns the user-visible failure state; the workflow dispatch
 * row only records provider delivery state.
 */
export const failMemoryExtractionTopic = async (input: unknown) => {
  try {
    const payload = normalizeMemoryExtractionPayload(input as MemoryExtractionPayloadInput);
    const userId = payload.userId || payload.userIds[0];
    const topicId = payload.topicIds[0];
    if (!userId || !payload.asyncTaskId) return 'no-async-task' as const;

    const db = await getServerDB();
    const asyncTaskModel = new AsyncTaskModel(db, userId, payload.workspaceId);

    // Progress means "topic accounted for", not "topic succeeded". The task
    // model guards against turning an already errored task back into success.
    await asyncTaskModel.incrementUserMemoryExtractionProgress(payload.asyncTaskId);
    console.error(
      `[process-topic][failure] recording terminal async-task failure for user ${userId}, topic ${topicId}`,
    );
    return 'async-task-updated' as const;
  } catch (error) {
    console.error('[process-topic][failure] failed to record async task error', error);
    return 'async-task-update-failed' as const;
  }
};
