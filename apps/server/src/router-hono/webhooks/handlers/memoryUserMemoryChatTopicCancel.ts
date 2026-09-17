import {
  AsyncTaskError,
  AsyncTaskErrorType,
  AsyncTaskStatus,
  AsyncTaskType,
  type HourlyUserMemoryExtractionMetadata,
  type UserMemoryExtractionMetadata,
} from '@orvilo/types';
import { and, eq, inArray } from 'drizzle-orm';
import type { Context } from 'hono';
import { z } from 'zod';

import {
  AsyncTaskModel,
  initHourlyUserMemoryExtractionMetadata,
  initUserMemoryExtractionMetadata,
} from '@/database/models/asyncTask';
import { asyncTasks } from '@/database/schemas';
import { getServerDB } from '@/database/server';
import { cancelHatchetWorkflow } from '@/server/services/hatchet/workflows';

const cancelPayloadSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
  taskId: z.string().uuid(),
  userId: z.string().optional(),
  workflowRunId: z.string().optional(),
  workflowRunIds: z.array(z.string()).optional(),
});

const supportedTaskTypes = [
  AsyncTaskType.UserMemoryExtractionHourly,
  AsyncTaskType.UserMemoryExtractionWithChatTopic,
];

const initMemoryExtractionMetadata = (task: typeof asyncTasks.$inferSelect) => {
  if (task.type === AsyncTaskType.UserMemoryExtractionHourly) {
    const metadata = task.metadata as Partial<HourlyUserMemoryExtractionMetadata> | undefined;
    return initHourlyUserMemoryExtractionMetadata({
      ...metadata,
      startedAt: metadata?.startedAt || task.createdAt?.toISOString() || new Date().toISOString(),
    });
  }
  return initUserMemoryExtractionMetadata(task.metadata as UserMemoryExtractionMetadata | undefined);
};

export const memoryUserMemoryChatTopicCancel = async (c: Context) => {
  try {
    const payload = cancelPayloadSchema.parse(await c.req.json());
    const db = await getServerDB();
    const task = await db.query.asyncTasks.findFirst({
      where: and(eq(asyncTasks.id, payload.taskId), inArray(asyncTasks.type, supportedTaskTypes)),
    });
    if (!task) return c.json({ error: `Memory extraction task not found for id '${payload.taskId}'` }, 404);
    if (payload.userId && payload.userId !== task.userId) {
      return c.json({ error: `Task '${payload.taskId}' does not belong to the provided userId` }, 403);
    }

    const metadata = initMemoryExtractionMetadata(task);
    const workflowRunIds = Array.from(new Set([
      ...(metadata.control?.hatchet?.workflowRunIds || []),
      ...(payload.workflowRunId ? [payload.workflowRunId] : []),
      ...(payload.workflowRunIds || []),
    ]));
    const nextMetadata: typeof metadata = {
      ...metadata,
      control: {
        cancelReason: payload.reason || metadata.control?.cancelReason,
        cancelRequestedAt: metadata.control?.cancelRequestedAt || new Date().toISOString(),
        cancelledBy: 'webhook',
        hatchet: { ...metadata.control?.hatchet, workflowRunIds },
      },
    };
    const asyncTaskModel = new AsyncTaskModel(db, task.userId, task.workspaceId ?? undefined);
    await asyncTaskModel.update(task.id, {
      error: new AsyncTaskError(AsyncTaskErrorType.TaskCancelled, payload.reason || 'Memory extraction cancelled from webhook'),
      metadata: nextMetadata,
      status: AsyncTaskStatus.Error,
    });

    let cancelledWorkflowRuns = 0;
    const failedWorkflowRunIds: string[] = [];
    if (workflowRunIds.length > 0) {
      const results = await Promise.allSettled(
        workflowRunIds.map((workflowRunId) => cancelHatchetWorkflow(workflowRunId)),
      );
      results.forEach((result, index) => {
        const workflowRunId = workflowRunIds[index];
        if (result.status === 'fulfilled') {
          if (result.value) cancelledWorkflowRuns += 1;
          else failedWorkflowRunIds.push(workflowRunId);
          return;
        }
        failedWorkflowRunIds.push(workflowRunId);
        console.error(
          '[memory-user-memory/pipelines/extract/chat-topic/cancel] workflow cancellation failed',
          { reason: result.reason, workflowRunId },
        );
      });
    }

    return c.json({
      cancelledWorkflowRuns,
      failedWorkflowRunIds,
      message: failedWorkflowRunIds.length
        ? 'Memory extraction cancellation was requested, but some workflow runs could not be cancelled.'
        : 'Memory extraction cancellation has been requested.',
      status: AsyncTaskStatus.Error,
      taskId: task.id,
    }, 200);
  } catch (error) {
    console.error('[memory-user-memory/pipelines/extract/chat-topic/cancel] failed', error);
    return c.json({ error: (error as Error).message }, 500);
  }
};
