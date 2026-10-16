import type { IssueDeliveryProof, TaskContext, TaskItem, TaskRunTrigger } from '@orvilo/types';
import { TRPCError } from '@trpc/server';
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';

import { TaskModel } from '@/database/models/task';
import type { EventDispatchEvidence } from '@/database/models/taskDispatch';
import { TaskDispatchModel } from '@/database/models/taskDispatch';
import { taskDispatches, tasks } from '@/database/schemas/task';
import type { OrviloDatabase } from '@/database/type';
import { assertAgentVisibleTo } from '@/database/utils/agent-access';
import { assertCanUseWorkspaceAgent } from '@/server/routers/lambda/_helpers/workspaceAgentGuard';
import { TaskDispatchQueuedError } from '@/server/services/taskDispatch';
import { TaskRunnerService } from '@/server/services/taskRunner';

/** Re-enter the normal permission/occurrence boundary as the persisted requester. */
export const resumeAutomationQueue = async (
  db: OrviloDatabase,
  taskId: string,
  workspaceId?: string,
) => {
  const model = new TaskDispatchModel(db, workspaceId);
  const queued = await model.findOldestQueued(taskId);
  if (!queued?.initiator || (await model.findActiveByTaskId(taskId))) return false;
  const task = await new TaskModel(db, queued.initiator, workspaceId).findById(taskId);
  if (
    !task ||
    (task.context as TaskContext | null)?.scheduler?.automationPaused ||
    ['done', 'canceled'].includes(task.workflowCategory)
  )
    return false;
  try {
    await new TaskRunnerService(db, queued.initiator, workspaceId).runTask({
      taskId,
      trigger: queued.requestedBy.split(':', 1)[0] as TaskRunTrigger,
      intent: 'fresh_occurrence',
      idempotencyKey: queued.idempotencyKey,
      eventEvidence: queued.eventEvidence ?? undefined,
    });
    return true;
  } catch (error) {
    if (
      error instanceof TRPCError &&
      (error.code === 'PRECONDITION_FAILED' ||
        error.code === 'FORBIDDEN' ||
        error.code === 'NOT_FOUND' ||
        error.cause instanceof TaskDispatchQueuedError)
    )
      return false;
    throw error;
  }
};

/** The final delivery controller has verified acceptance/merge; release this exact occurrence. */
export const completeAutomationDelivery = async (
  db: OrviloDatabase,
  _userId: string,
  workspaceId: string | undefined,
  proof: IssueDeliveryProof,
) => {
  if (!proof.dispatchId || proof.executionGeneration === undefined) return false;
  const completed = await new TaskDispatchModel(db, workspaceId).completeAutomationDelivery({
    taskId: proof.taskId,
    dispatchId: proof.dispatchId,
    topicId: proof.topicId,
    executionGeneration: proof.executionGeneration,
  });
  if (completed) await resumeAutomationQueue(db, proof.taskId, workspaceId);
  return completed;
};

/** Validate the stored parent occurrence, requester and frozen confirmed-plan membership. */
export const requireAutomationParent = async (
  db: OrviloDatabase,
  userId: string,
  workspaceId: string | undefined,
  task: TaskItem,
  dispatchId: string,
) => {
  const model = new TaskDispatchModel(db, workspaceId);
  const parent = await model.findById(dispatchId);
  const plan = parent?.automationOccurrence?.definition.issuePlan;
  const context = task.context as TaskContext | null;
  if (
    !parent ||
    parent.initiator !== userId ||
    parent.workspaceId !== (workspaceId ?? null) ||
    !plan?.confirmedAt ||
    plan.parentTaskId !== parent.taskId ||
    !plan.checklists.some((check) => check.taskId === task.id) ||
    context?.issuePlan?.revision !== plan.revision ||
    context.issuePlan.scopeFingerprint !== plan.scopeFingerprint ||
    (task.id !== parent.taskId && context.automationParentDispatchId !== parent.id) ||
    !['requested', 'claimed', 'provisioning', 'dispatched', 'running', 'waiting'].includes(
      parent.phase,
    )
  )
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Periodic parent occurrence is stale or out of scope',
    });
  const parentTask = await new TaskModel(db, userId, workspaceId).findById(parent.taskId);
  if (
    !parentTask ||
    parentTask.executionGeneration !== parent.generation ||
    (parentTask.context as TaskContext | null)?.issuePlan?.scopeFingerprint !==
      plan.scopeFingerprint
  )
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Periodic parent generation changed' });
  return parent;
};

/** Capture a periodic DAG occurrence before checking whether its children can run. */
export const startAutomationPlan = async (
  db: OrviloDatabase,
  userId: string,
  workspaceId: string | undefined,
  input: {
    task: TaskItem;
    trigger: TaskRunTrigger;
    idempotencyKey: string;
    eventEvidence?: EventDispatchEvidence;
  },
) => {
  const { TaskGraphService } = await import('../taskGraph');
  const { issuePlanFingerprint } = await import('../task/plan');
  const { TaskService } = await import('../task');
  const model = new TaskDispatchModel(db, workspaceId);
  const requested = await model.request({
    taskId: input.task.id,
    trigger: input.trigger,
    idempotencyKey: input.idempotencyKey,
    initiator: userId,
    requestedBy: userId,
    executionUserId: userId,
    origin: 'external',
    authorizeExecutor: ({ agentId, db: transaction, userId: actor }) =>
      workspaceId
        ? assertCanUseWorkspaceAgent({ agentId, db: transaction, userId: actor, workspaceId })
        : assertAgentVisibleTo(transaction, agentId, { userId: actor }),
    eventEvidence: input.eventEvidence,
  });
  if (requested.state === 'busy') throw new TaskDispatchQueuedError(requested.active.id);
  const dispatch = requested.dispatch;
  if (dispatch.phase === 'queued') throw new TaskDispatchQueuedError(dispatch.id);
  const plan = dispatch.automationOccurrence?.definition.issuePlan;
  if (!plan?.confirmedAt)
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Confirm the periodic Issue plan',
    });
  if (dispatch.phase === 'requested') {
    await new TaskModel(db, userId, workspaceId).withIssueDelivery(
      input.task.id,
      async (tx, current) => {
        const graph = await new TaskGraphService(tx, userId, workspaceId).planForParent(current.id);
        const scoped = [current, ...graph.descendants];
        if (
          issuePlanFingerprint(
            scoped,
            await new TaskModel(tx, userId, workspaceId).getDependenciesByTaskIds(
              scoped.map((task) => task.id),
            ),
          ) !== plan.scopeFingerprint
        )
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Periodic Issue scope changed; confirm the plan again',
          });
        const ids = plan.checklists.map((check) => check.taskId);
        if (ids.some((id) => !scoped.some((task) => task.id === id)))
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Periodic plan contains another Issue',
          });
        const held = await new TaskDispatchModel(tx, workspaceId).markWaiting(
          dispatch.id,
          'automation_plan_running',
        );
        if (!held)
          throw new TRPCError({ code: 'CONFLICT', message: 'Periodic occurrence already started' });
        await tx
          .update(tasks)
          .set({
            // Invalidate every previous child proof before any new layer can read it.
            executionGeneration: sql`CASE WHEN ${tasks.id} = ${current.id}
              THEN ${tasks.executionGeneration} ELSE ${tasks.executionGeneration} + 1 END`,
            workflowCategory: 'backlog',
            workflowStateId: null,
            workflowStateRefId: null,
            currentTopicId: null,
            completedAt: null,
            context: sql`jsonb_set(coalesce(${tasks.context}, '{}'::jsonb) #- '{execution,parked}',
          '{automationParentDispatchId}', ${JSON.stringify(dispatch.id)}::jsonb)`,
          })
          .where(inArray(tasks.id, ids));
      },
    );
  }
  if (
    dispatch.phase === 'requested' ||
    (dispatch.phase === 'waiting' && dispatch.waitingReason === 'automation_plan_running')
  ) {
    await new TaskService(db, userId, workspaceId).runReadySubtasks(
      input.task.id,
      dispatch.id,
      dispatch.id,
    );
  }
  throw new TaskDispatchQueuedError(dispatch.id);
};

/** Once reviewed children are ready, the parent executes its real report Run on the original dispatch. */
export const resumeAutomationParentReport = async (
  db: OrviloDatabase,
  userId: string,
  workspaceId: string | undefined,
  task: TaskItem,
  dispatchId: string,
) => {
  const dispatch = await requireAutomationParent(db, userId, workspaceId, task, dispatchId);
  if (task.id !== dispatch.taskId || dispatch.waitingReason !== 'automation_plan_running')
    return false;
  const [resumed] = await db
    .update(taskDispatches)
    .set({
      phase: 'requested',
      waitingReason: null,
      automationOccurrence: { ...dispatch.automationOccurrence!, planExecutionStarted: true },
    })
    .where(
      and(
        eq(taskDispatches.id, dispatch.id),
        eq(taskDispatches.phase, 'waiting'),
        eq(taskDispatches.waitingReason, 'automation_plan_running'),
      ),
    )
    .returning({ id: taskDispatches.id });
  if (!resumed) return false;
  await new TaskRunnerService(db, userId, workspaceId).runTask({
    taskId: task.id,
    trigger: dispatch.requestedBy.split(':', 1)[0] as TaskRunTrigger,
    idempotencyKey: dispatch.idempotencyKey,
    intent: 'fresh_occurrence',
    eventEvidence: dispatch.eventEvidence ?? undefined,
    nativeAutomationParentDispatchId: dispatch.id,
  });
  return true;
};

/** Advance a canceled occurrence only after every writer in its frozen scope has stopped. */
export const advanceCanceledAutomation = async (
  db: OrviloDatabase,
  dispatchId: string,
  workspaceId?: string,
) => {
  const model = new TaskDispatchModel(db, workspaceId);
  const canceled = await model.findById(dispatchId);
  if (!canceled?.automationOccurrence) return false;
  const parent = canceled.automationOccurrence.parentDispatchId
    ? await model.findById(canceled.automationOccurrence.parentDispatchId)
    : canceled;
  if (!parent || parent.phase !== 'canceled' || !parent.initiator) return false;
  const task = await new TaskModel(db, parent.initiator, workspaceId).findById(parent.taskId);
  if (
    !task ||
    task.executionGeneration !== parent.generation ||
    (task.context as TaskContext | null)?.scheduler?.automationPaused ||
    ['done', 'canceled'].includes(task.workflowCategory)
  )
    return false;
  const plan = parent.automationOccurrence?.definition.issuePlan;
  if (await model.automationPlanHasWriters(plan, task.id)) return false;
  const ids = [task.id];
  const { agentOperations } = await import('@/database/schemas/agentOperations');
  const [writer] = await db
    .select({ id: agentOperations.id })
    .from(agentOperations)
    .where(
      and(
        inArray(agentOperations.taskId, ids),
        notInArray(agentOperations.status, ['done', 'error', 'interrupted']),
      ),
    )
    .limit(1);
  if ((await model.findActiveByTaskId(task.id)) || writer) return false;
  await db
    .update(tasks)
    .set({
      context: sql`coalesce(${tasks.context}, '{}'::jsonb) #- '{execution,parked}'`,
      runReservationId: null,
      runReservationExpiresAt: null,
    })
    .where(and(eq(tasks.id, task.id), eq(tasks.executionGeneration, parent.generation)));
  return resumeAutomationQueue(db, task.id, workspaceId);
};

/** Distinct from pausing automation: fence this occurrence and await actual native stop acknowledgements. */
export const cancelAutomationOccurrence = async (
  db: OrviloDatabase,
  userId: string,
  workspaceId: string | undefined,
  taskId: string,
) => {
  const model = new TaskDispatchModel(db, workspaceId);
  const active = await model.findActiveByTaskId(taskId);
  if (!active?.automationOccurrence || active.automationOccurrence.parentDispatchId)
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'No active periodic occurrence' });
  const ids = active.automationOccurrence.definition.issuePlan?.checklists.map(
    (check) => check.taskId,
  ) ?? [taskId];
  const readable = await new TaskModel(db, userId, workspaceId).findByIds(ids);
  if (readable.length !== new Set(ids).size)
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Periodic Issue scope is no longer accessible',
    });
  const { assertCanUseWorkspaceAgent } =
    await import('@/server/routers/lambda/_helpers/workspaceAgentGuard');
  if (workspaceId)
    for (const task of readable)
      if (task.assigneeAgentId)
        await assertCanUseWorkspaceAgent({
          agentId: task.assigneeAgentId,
          db,
          userId,
          workspaceId,
        });
  await TaskDispatchModel.requestStopForTasks(db, ids, 'user_cancel_occurrence');
  const { agentOperations } = await import('@/database/schemas/agentOperations');
  const operations = await db
    .select({ id: agentOperations.id })
    .from(agentOperations)
    .where(
      and(
        inArray(agentOperations.taskId, ids),
        notInArray(agentOperations.status, ['done', 'error', 'interrupted']),
      ),
    );
  const { AiAgentService } = await import('../aiAgent');
  for (const operation of operations) {
    const stop = await new AiAgentService(db, userId, { workspaceId }).interruptTask({
      operationId: operation.id,
    });
    if (
      !stop.success ||
      stop.deviceCancellationConfirmed === false ||
      (stop.cancelState && stop.cancelState !== 'confirmed')
    )
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'STOP_UNCONFIRMED: Periodic occurrence still has an active native writer',
      });
  }
  const stops = await db
    .select({ id: taskDispatches.id })
    .from(taskDispatches)
    .where(and(inArray(taskDispatches.taskId, ids), eq(taskDispatches.phase, 'cancel_requested')));
  const { processTaskCancellation } = await import('../taskCancellation');
  for (const stop of stops) {
    const outcome = await processTaskCancellation({ db, dispatchId: stop.id, workspaceId });
    if (outcome.outcome !== 'canceled' && outcome.outcome !== 'skipped')
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'STOP_UNCONFIRMED: Periodic occurrence cancellation remains pending',
      });
  }
  await advanceCanceledAutomation(db, active.id, workspaceId);
  return { canceledDispatchId: active.id };
};
