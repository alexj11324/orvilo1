import type { TaskItem } from '@orvilo/types';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import { TaskDomainError } from '@/database/errors/task';
import type { TaskModel } from '@/database/models/task';
import { TaskDispatchModel } from '@/database/models/taskDispatch';
import type { TaskTopicModel } from '@/database/models/taskTopic';
import { agentOperations } from '@/database/schemas/agentOperations';
import { taskTopics } from '@/database/schemas/task';
import { topics } from '@/database/schemas/topic';
import type { OrviloDatabase } from '@/database/type';
import { assertAgentVisibleTo } from '@/database/utils/agent-access';

import { assertCanUseWorkspaceAgent } from '../resourcePermission/workspaceAgentGuard';

export interface TaskExecutionUseContext {
  serverDB: OrviloDatabase;
  taskModel: TaskModel;
  taskTopicModel: TaskTopicModel;
  userId: string;
  workspaceId?: string | null;
}

/** Check stored and sealed incumbent executors before a user can stop or replace work. */
export async function assertTaskExecutionUse(
  ctx: TaskExecutionUseContext,
  targetTasks: Pick<TaskItem, 'id' | 'assigneeAgentId' | 'status'>[],
  additionalAgentIds: Array<string | null | undefined> = [],
  /** Waives Use on the incumbents only; their operations are still scope-checked. */
  { waiveIncumbentUse = false }: { waiveIncumbentUse?: boolean } = {},
) {
  const taskIds = targetTasks.map((task) => task.id);
  const [runningTopics, activeDispatches] = await Promise.all([
    // These tasks were already resolved for this caller. Inspect only their sealed
    // executor identity: historical topic visibility must not change stop authority.
    taskIds.length
      ? ctx.serverDB
          .select({
            agentId: topics.agentId,
            operationId: taskTopics.operationId,
            taskId: taskTopics.taskId,
          })
          .from(taskTopics)
          .leftJoin(topics, eq(taskTopics.topicId, topics.id))
          .where(
            and(
              inArray(taskTopics.taskId, taskIds),
              eq(taskTopics.status, 'running'),
              ctx.workspaceId
                ? eq(taskTopics.workspaceId, ctx.workspaceId)
                : and(isNull(taskTopics.workspaceId), eq(taskTopics.userId, ctx.userId)),
            ),
          )
      : Promise.resolve([]),
    Promise.all(
      taskIds.map((id) =>
        new TaskDispatchModel(ctx.serverDB, ctx.workspaceId ?? undefined).findActiveByTaskId(id),
      ),
    ),
  ]);
  const operationIds = [
    ...new Set(
      [
        ...runningTopics.map((topic) => topic.operationId),
        ...activeDispatches.map((dispatch) => dispatch?.operationId),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];
  const operations = operationIds.length
    ? await ctx.serverDB
        .select({
          id: agentOperations.id,
          agentId: agentOperations.agentId,
          workspaceId: agentOperations.workspaceId,
        })
        .from(agentOperations)
        .where(inArray(agentOperations.id, operationIds))
    : [];
  if (operations.some((operation) => operation.workspaceId !== (ctx.workspaceId ?? null))) {
    throw new TaskDomainError({
      code: 'FORBIDDEN',
      message: 'Operation is outside the caller scope',
    });
  }
  const operationAgents = new Map(operations.map((operation) => [operation.id, operation.agentId]));
  const agentIds = new Set(
    [
      ...(waiveIncumbentUse ? [] : targetTasks).flatMap((task, index) => {
        const dispatch = activeDispatches[index];
        const sealedExecutors = [
          ...runningTopics
            .filter((topic) => topic.taskId === task.id)
            .flatMap((topic) => [
              topic.agentId,
              topic.operationId ? operationAgents.get(topic.operationId) : null,
            ]),
          dispatch?.agentId,
          dispatch?.operationId ? operationAgents.get(dispatch.operationId) : null,
        ].filter((id): id is string => Boolean(id));
        // A delegated/current run may differ from the issue's assignee field.
        return sealedExecutors.length
          ? sealedExecutors
          : ['running', 'scheduled'].includes(task.status)
            ? [task.assigneeAgentId]
            : [];
      }),
      ...additionalAgentIds,
    ].filter((id): id is string => Boolean(id)),
  );
  await Promise.all(
    [...agentIds].map((agentId) =>
      ctx.workspaceId
        ? assertCanUseWorkspaceAgent({
            agentId,
            db: ctx.serverDB,
            userId: ctx.userId,
            workspaceId: ctx.workspaceId,
          })
        : assertAgentVisibleTo(ctx.serverDB, agentId, { userId: ctx.userId }),
    ),
  );
}

export async function assertAssigneeAgentVisibleToCaller(
  db: OrviloDatabase,
  callerCtx: { userId: string; workspaceId?: string },
  assigneeAgentId?: string | null,
) {
  if (!assigneeAgentId) return;

  try {
    await assertAgentVisibleTo(db, assigneeAgentId, callerCtx);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'NOT_FOUND') {
      // Preserve the task-context message so the UI surfaces "Assignee agent
      // not found" instead of the generic "Agent not found". Cross-user access
      // to a private agent still resolves to NOT_FOUND, never FORBIDDEN, so we
      // don't leak existence of someone else's private agent.
      throw new TaskDomainError({ code: 'NOT_FOUND', message: 'Assignee agent not found' });
    }
    throw error;
  }
}

/**
 * Who an activity row is attributed to.
 *
 * A server-side caller (the gateway task runtime) carries the agent in
 * `ctx.actingAgentId`, which no HTTP request can set — that is the trusted
 * path and always wins. The client-first runtime (gateway off, self-hosted)
 * has no such channel: its task tools are ordinary TRPC calls from the
 * browser, so it names the agent in the payload — the same contract
 * `addComment.authorAgentId` already uses — and the claim is honoured only
 * for an agent the caller can use. That bounds any misattribution to the
 * caller's own agents rather than letting a request pin a change on anyone.
 */
export async function resolveActivityActor(
  ctx: {
    actingAgentId?: string | null;
    serverDB: OrviloDatabase;
    userId: string;
    workspaceId?: string | null;
  },
  claimedAgentId?: string,
): Promise<{ agentId?: string | null; userId: string }> {
  if (ctx.actingAgentId) return { agentId: ctx.actingAgentId, userId: ctx.userId };
  if (claimedAgentId) {
    await assertAgentVisibleTo(ctx.serverDB, claimedAgentId, {
      userId: ctx.userId,
      workspaceId: ctx.workspaceId ?? undefined,
    });
  }
  if (ctx.workspaceId && claimedAgentId)
    await assertCanUseWorkspaceAgent({
      agentId: claimedAgentId,
      db: ctx.serverDB,
      userId: ctx.userId,
      workspaceId: ctx.workspaceId,
    });
  return { agentId: claimedAgentId ?? null, userId: ctx.userId };
}
