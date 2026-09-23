import { TASK_STATUSES } from '@orvilo/builtin-tool-task';
import { AgentRuntimeErrorType } from '@orvilo/model-runtime';
import type {
  TaskListItem,
  TaskParticipant,
  TaskVerifyConfig,
  TaskWorkflowCategory,
} from '@orvilo/types';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { notifyTaskAssigned } from '@/business/server/task/notifyTaskAssigned';
import type { TaskCommentActivityRecipient } from '@/business/server/task/notifyTaskCommentActivity';
import { notifyTaskCommentActivity } from '@/business/server/task/notifyTaskCommentActivity';
import { withScopedPermission } from '@/business/server/trpc-middlewares/rbacPermission';
import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { AgentModel } from '@/database/models/agent';
import { BriefModel } from '@/database/models/brief';
import { linearBindingWriteEnabled, LinearSyncModel } from '@/database/models/linearSync';
import { TaskModel } from '@/database/models/task';
import { TaskDependencyError } from '@/database/models/taskDependency';
import { TaskTopicModel } from '@/database/models/taskTopic';
import { TeamModel } from '@/database/models/team';
import { TopicModel } from '@/database/models/topic';
import { UserModel } from '@/database/models/user';
import { resolveWorkflowCreatePreset } from '@/database/models/workflowMove';
import { getActiveWorkspaceMembershipRole } from '@/database/models/workspace';
import type { OrviloDatabase } from '@/database/type';
import { assertAgentUsableBy } from '@/database/utils/agent-access';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { markSilentTRPCErrorLog } from '@/libs/trpc/utils/errorLogger';
import {
  ActionApprovalService,
  AgentDelegationService,
  DELEGATION_ACTIONS,
  ProjectMemberModel,
  TASK_INPUT_INTENT_TYPES,
  TASK_INPUT_STATUSES,
  TaskInputService,
} from '@/server/services/agentDelegation';
import { isAcpJudgmentBindingError } from '@/server/services/aiGeneration/judgment';
import { EditLockService } from '@/server/services/editLock';
import { publishResourceEvent } from '@/server/services/resourceEvents';
import { TaskService } from '@/server/services/task';
import { TaskIntentService } from '@/server/services/task/intent';
import { TaskIntegrationService } from '@/server/services/taskIntegration';
import { TaskLifecycleService } from '@/server/services/taskLifecycle';
import { TaskRunnerService } from '@/server/services/taskRunner';
import { runTaskWatchdog } from '@/server/services/taskWatchdog';
import { AcceptanceService } from '@/server/services/verify/acceptanceService';
import { resolveTaskAcceptance } from '@/server/services/verify/taskAcceptance';
import { hasWorkspaceScopedPermission } from '@/server/services/workspacePermission';
import {
  extractMentionedUserIds,
  filterActiveWorkspaceMemberIds,
  validateMentionedUserIds,
} from '@/server/utils/commentMentions';
import { after } from '@/server/utils/scheduleAfterResponse';
import { TransferErrorCode } from '@/types/transferError';

import { assertWorkspaceRowManageable } from './_helpers/assertWorkspaceRowManageable';

const taskProcedure = wsCompatProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;
  const wsId = ctx.workspaceId ?? undefined;
  return opts.next({
    ctx: {
      agentModel: new AgentModel(ctx.serverDB, ctx.userId, wsId),
      approvals: new ActionApprovalService(ctx.serverDB, ctx.userId, wsId),
      briefModel: new BriefModel(ctx.serverDB, ctx.userId, wsId),
      delegation: new AgentDelegationService(ctx.serverDB, ctx.userId, wsId),
      editLockService: new EditLockService(ctx.userId),
      taskInputs: new TaskInputService(ctx.serverDB, ctx.userId, wsId),
      taskIntegration: new TaskIntegrationService(ctx.serverDB, ctx.userId, wsId),
      taskLifecycle: new TaskLifecycleService(ctx.serverDB, ctx.userId, wsId),
      taskModel: new TaskModel(ctx.serverDB, ctx.userId, wsId),
      teamModel: new TeamModel(ctx.serverDB, ctx.userId, wsId ?? ''),
      taskIntentService: new TaskIntentService(ctx.serverDB, ctx.userId, wsId),
      taskService: new TaskService(ctx.serverDB, ctx.userId, wsId),
      taskTopicModel: new TaskTopicModel(ctx.serverDB, ctx.userId, wsId),
      topicModel: new TopicModel(ctx.serverDB, ctx.userId, wsId),
    },
  });
});

// Write variant gates viewers out of every task mutation (create/update/delete/
// run). Reads keep using `taskProcedure` so viewers can still inspect tasks
// and their status.
const taskProcedureWrite = taskProcedure.use(withScopedPermission('agent:update'));

// All procedures that take an id accept either raw id (task_xxx) or identifier (TASK-1)
// Resolution happens in the model layer via model.resolve()
const idInput = z.object({ id: z.string() });

const TASK_WORKFLOW_CATEGORIES = [
  'triage',
  'backlog',
  'todo',
  'in_progress',
  'in_review',
  'done',
  'canceled',
] as const satisfies readonly TaskWorkflowCategory[];

const taskVerifyConfigPatchSchema = z.object({
  enabled: z.boolean().nullish(),
  maxIterations: z.number().min(1).max(10).nullish(),
  requirement: z.string().nullish(),
  verifierAgentId: z.string().nullish(),
  verifyCriteriaIds: z.array(z.string()).nullish(),
  verifyRubricId: z.string().nullish(),
});

// Priority: 0=None, 1=Urgent, 2=High, 3=Normal, 4=Low
const createSchema = z.object({
  assigneeAgentId: z.string().optional(),
  assigneeUserId: z.string().optional(),
  // Optional schedule wiring at create time. When `automationMode` is
  // 'schedule', `schedulePattern` (cron) is required for the central
  // schedule-dispatch sweep to pick the task up.
  automationMode: z.enum(['heartbeat', 'schedule']).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  createdByAgentId: z.string().optional(),
  description: z.string().optional(),
  editorData: z.unknown().optional(),
  // Periodic-execution interval in seconds for `automationMode: 'heartbeat'`.
  // Same floor as `updateSchema.heartbeatInterval`: any positive value must be
  // ≥600s (10 min) so a client cannot schedule sub-minute ticks.
  heartbeatInterval: z
    .number()
    .int()
    .refine((v) => v === 0 || v >= 600, {
      message: 'heartbeatInterval must be 0 (disabled) or at least 600 seconds (10 minutes)',
    })
    .optional(),
  identifierPrefix: z.string().optional(),
  instruction: z.string().min(1),
  name: z.string().optional(),
  parentTaskId: z.string().optional(),
  priority: z.number().min(0).max(4).optional(),
  projectId: z.string().optional(),
  schedulePattern: z.string().optional(),
  scheduleTimezone: z.string().optional(),
  /** Execution-status preset — a status-grouped board column's `+`. */
  status: z.enum(TASK_STATUSES).optional(),
  /** Owning team for workspace tasks — the team's issue-seq allocates the identifier. */
  teamId: z.string().optional(),
  // When omitted, the server derives visibility from the parent task or the
  // assignee agent's visibility (private agent → private task). UI surfaces
  // such as the top-level "Tasks" create form pass it explicitly.
  visibility: z.enum(['private', 'public']).optional(),
  /** Workflow-category preset — a work-query board column's `+`; resolved to
   *  the team's mapped workflow state below when exactly one matches. */
  workflowCategory: z.enum(TASK_WORKFLOW_CATEGORIES).optional(),
  // Removed contract, kept so the server can recognise it. A task no longer
  // carries a goal — the Goal Graph owns execution and dispatches its own Work
  // Tasks — and silently dropping this field would let a released client report
  // that a goal started when only an ordinary task exists.
  goal: z.unknown().optional(),
});

const updateSchema = z.object({
  /**
   * Kanban drop anchors: the cards immediately above (`beforeId`) and below
   * (`afterId`) the drop slot, by id or identifier. The server computes the
   * fractional `position` between them — the client sends drop geometry, not
   * a number it had to guess.
   */
  afterId: z.string().nullish(),
  assigneeAgentId: z.string().nullish(),
  assigneeUserId: z.string().nullish(),
  automationMode: z.enum(['heartbeat', 'schedule']).nullish(),
  beforeId: z.string().nullish(),
  config: z.record(z.string(), z.unknown()).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  description: z.string().optional(),
  editorData: z.unknown().optional(),
  // 0 clears the interval (disables heartbeat); any positive value must be
  // ≥600s (10 min) to match the UI minimum and prevent sub-minute ticks if an
  // LLM calls setTaskSchedule with a tiny number.
  heartbeatInterval: z
    .number()
    .int()
    .refine((v) => v === 0 || v >= 600, {
      message: 'heartbeatInterval must be 0 (disabled) or at least 600 seconds (10 minutes)',
    })
    .optional(),
  heartbeatTimeout: z.number().min(1).nullish(),
  instruction: z.string().optional(),
  /**
   * The dropped column's membership fields, sent with the drop anchors. The
   * loaded page ends at the visible anchor; the scope lets the server find
   * the true in-scope neighbour past the page edge and respace the column
   * when fractional positions collapse. `null` assignee = the unassigned
   * column, not "no constraint".
   */
  moveScope: z
    .object({
      assigneeAgentId: z.string().nullish(),
      assigneeUserId: z.string().nullish(),
      priority: z.number().min(0).max(4).optional(),
      statuses: z.array(z.enum(TASK_STATUSES)).max(10).optional(),
      workflowCategories: z.array(z.enum(TASK_WORKFLOW_CATEGORIES)).max(7).optional(),
    })
    .optional(),
  name: z.string().optional(),
  parentTaskId: z.string().nullish(),
  /** Explicit board ordering key; `beforeId`/`afterId` anchors take precedence. */
  position: z.number().optional(),
  priority: z.number().min(0).max(4).optional(),
  projectId: z.string().nullish(),
  reviewerUserId: z.string().nullish(),
  schedulePattern: z.string().nullish(),
  scheduleTimezone: z.string().nullish(),
  status: z.enum(TASK_STATUSES).optional(),
  /** Business-workflow board target. The server resolves its exact mapped state id. */
  workflowCategory: z.enum(TASK_WORKFLOW_CATEGORIES).optional(),
});

const listSchema = z.object({
  // Keyset cursor — rows strictly after this `(orderBy timestamp, seq)` position
  // in newest-first order. Stable under concurrent inserts/deletes, unlike `offset`.
  after: z.object({ at: z.coerce.date(), seq: z.number().int() }).optional(),
  assigneeAgentId: z.string().optional(),
  // true → only tasks whose schedule or heartbeat can still fire (a terminal or
  // misconfigured one cannot), false → its exact complement. Omitted leaves the
  // set unnarrowed.
  automated: z.boolean().optional(),
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
  // Which timestamp orders the page, newest first. Defaults to creation time.
  orderBy: z.enum(['createdAt', 'updatedAt']).optional(),
  parentIdentifier: z.string().optional(),
  parentTaskId: z.string().nullish(),
  priorities: z.array(z.number().min(0).max(4)).max(5).optional(),
  projectId: z.string().optional(),
  // "My tasks" narrowing: 'assigned' → tasks whose member assignee is the
  // caller, 'created' → tasks the caller created. Always resolved against
  // `ctx.userId` so the endpoint never filters by an arbitrary member.
  scope: z.enum(['assigned', 'created']).optional(),
  statuses: z.array(z.enum(TASK_STATUSES)).max(10).optional(),
  // UI-side narrowing of the result set. Omitted means "All" (the chip's
  // default 'private' is enforced client-side; the server stays permissive
  // so router tests / external callers don't have to know the chip).
  visibility: z.enum(['private', 'public']).optional(),
});

const groupListSchema = z
  .object({
    assigneeAgentId: z.string().optional(),
    automated: z.boolean().optional(),
    excludeStatuses: z.array(z.enum(TASK_STATUSES)).max(10).optional(),
    groupBy: z.enum(['agent', 'assignee', 'member', 'priority']).optional(),
    /**
     * Per-column page sizes for the dynamic groupings, keyed by group key.
     * The status path ignores it — its `groups[]` entries carry `limit`
     * already. Lets a board grow one column without redefining the group set.
     */
    groupLimits: z.record(z.string(), z.number().int().min(1).max(500)).optional(),
    groups: z
      .array(
        z
          .object({
            key: z.string(),
            limit: z.number().min(1).max(100).default(50),
            offset: z.number().min(0).default(0),
            statuses: z.array(z.enum(TASK_STATUSES)).max(10).optional(),
            workflowCategories: z.array(z.enum(TASK_WORKFLOW_CATEGORIES)).max(7).optional(),
          })
          .refine(
            ({ statuses, workflowCategories }) =>
              Boolean(statuses?.length) || Boolean(workflowCategories?.length),
            { message: 'A task group needs statuses or workflow categories' },
          ),
      )
      .min(1)
      .max(10)
      .optional(),
    parentTaskId: z.string().nullish(),
    // `null` narrows to tasks with no project — the board's "No project" chip.
    projectId: z.string().nullish(),
    // Same "My tasks" narrowing as `listSchema.scope`, so the board renders the
    // exact set its list view does. Always resolved against `ctx.userId`.
    scope: z.enum(['assigned', 'created', 'delegated']).optional(),
    visibility: z.enum(['private', 'public']).optional(),
  })
  .refine(({ groupBy, groups }) => Boolean(groupBy) !== Boolean(groups), {
    message: 'Provide either groups or groupBy',
  });

// Helper: resolve id/identifier and throw if not found
async function resolveOrThrow(model: TaskModel, id: string) {
  const task = await model.resolve(id);
  if (!task) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
  return task;
}

/**
 * Task-steering capability for `instruction` inputs: the assignee or reviewer
 * steers by role on the task, a project manager steers inside their project,
 * and a workspace owner/admin steers anywhere in the workspace. Members
 * without steering rights may still submit comments, proposals and decisions
 * (the procedure's `agent:update` gate already admits them); workspace
 * viewers are read-only and submit nothing.
 */
async function assertTaskSteeringCapability(
  ctx: {
    serverDB: OrviloDatabase;
    userId: string;
    workspaceId?: string;
  },
  task: {
    assigneeUserId: string | null;
    projectId: string | null;
    reviewerUserId: string | null;
    workspaceId: string | null;
  },
) {
  if (task.assigneeUserId === ctx.userId || task.reviewerUserId === ctx.userId) return;

  const workspaceId = task.workspaceId ?? ctx.workspaceId;
  if (workspaceId) {
    const role = await getActiveWorkspaceMembershipRole(ctx.serverDB, {
      userId: ctx.userId,
      workspaceId,
    });
    if (role === 'owner' || role === 'admin') return;

    if (task.projectId) {
      const projectRole = await new ProjectMemberModel(ctx.serverDB, ctx.userId).getRole(
        task.projectId,
        ctx.userId,
      );
      if (projectRole === 'manager') return;
    }
  }

  throw new TRPCError({
    code: 'FORBIDDEN',
    message:
      'Instruction inputs require assignee, reviewer, project-manager or workspace-admin steering capability',
  });
}

/**
 * Recipients of a new member comment on a task: the creator and the member
 * assignee as ambient `commented` pings, upgraded to `mentioned` when the
 * comment @mentions them. The actor never appears in the result.
 */
function collectTaskCommentRecipients(params: {
  actorUserId: string;
  mentionedUserIds: string[];
  task: { assigneeUserId: string | null; createdByUserId: string | null };
}): TaskCommentActivityRecipient[] {
  const { actorUserId, mentionedUserIds, task } = params;
  const byUserId = new Map<string, TaskCommentActivityRecipient['kind']>();
  for (const userId of [task.createdByUserId, task.assigneeUserId]) {
    if (userId) byUserId.set(userId, 'commented');
  }
  for (const userId of mentionedUserIds) byUserId.set(userId, 'mentioned');
  byUserId.delete(actorUserId);
  return [...byUserId].map(([userId, kind]) => ({ kind, userId }));
}

/**
 * Whether a notification deep-linking to `task` would land on a page `userId`
 * cannot open. Mirrors `TaskModel.ownership()`: public tasks are visible to
 * every member, private ones only to their creator. Membership is a separate
 * check (`filterActiveWorkspaceMemberIds`).
 */
function isTaskHiddenFrom(
  task: { createdByUserId: string | null; visibility: 'private' | 'public' },
  userId: string,
): boolean {
  return task.visibility === 'private' && task.createdByUserId !== userId;
}

interface TaskNotificationCtx {
  serverDB: OrviloDatabase;
  taskModel: TaskModel;
  workspaceId: string;
}

/**
 * Re-authorize every recipient against the task before any id reaches the
 * delivery slot (same contract as topic and document comments): a member
 * @mentioned on a private task they cannot see must not receive its title and
 * link, and the creator / assignee rows can outlive workspace membership.
 */
async function filterRecipientsByTaskAccess(
  ctx: TaskNotificationCtx,
  taskId: string,
  recipients: TaskCommentActivityRecipient[],
): Promise<TaskCommentActivityRecipient[]> {
  if (recipients.length === 0) return [];
  const task = await ctx.taskModel.findById(taskId);
  if (!task) return [];

  const visible = recipients.filter(({ userId }) => !isTaskHiddenFrom(task, userId));
  const activeUserIds = new Set(
    await filterActiveWorkspaceMemberIds(
      ctx.serverDB,
      ctx.workspaceId,
      visible.map(({ userId }) => userId),
    ),
  );
  return visible.filter(({ userId }) => activeUserIds.has(userId));
}

/**
 * Member comment ping (Linear-style), delivered after the response as
 * best-effort work: the `@/business` slot defaults to a no-op, and a rejecting
 * implementation must neither fail the mutation nor surface as an unhandled
 * rejection. `after()` keeps the work alive past the response on serverless.
 */
function notifyCommentActivityBestEffort(
  ctx: TaskNotificationCtx,
  params: Parameters<typeof notifyTaskCommentActivity>[0],
) {
  after(async () => {
    try {
      const recipients = await filterRecipientsByTaskAccess(ctx, params.taskId, params.recipients);
      if (recipients.length === 0) return;
      await notifyTaskCommentActivity({ ...params, recipients });
    } catch (error) {
      console.error('[task-comment] Failed to send activity notification', error);
    }
  });
}

/**
 * Assignment ping (Linear-style), delivered after the response as best-effort
 * work. Silent for self-assignment; the assignee lock already guarantees the
 * member is active and can open the task (`assertAssigneeUserVisibilityCompat`
 * rejects private tasks assigned to anyone but their creator). Callers decide
 * whether the assignee actually changed.
 */
function notifyAssignedBestEffort(
  ctx: { userId: string; workspaceId?: string | null },
  task: {
    assigneeUserId: string | null;
    id: string;
    identifier: string;
    name: string | null;
  },
) {
  const { assigneeUserId } = task;
  if (!assigneeUserId || assigneeUserId === ctx.userId) return;

  const params = {
    actorUserId: ctx.userId,
    assigneeUserId,
    taskId: task.id,
    taskIdentifier: task.identifier,
    taskName: task.name,
    workspaceId: ctx.workspaceId ?? undefined,
  };
  after(async () => {
    try {
      await notifyTaskAssigned(params);
    } catch (error) {
      console.error('[task] Failed to send assignment notification', error);
    }
  });
}

async function assertAssigneeAgentBelongsToUser(
  db: OrviloDatabase,
  callerCtx: { userId: string; workspaceId?: string },
  assigneeAgentId?: string | null,
) {
  if (!assigneeAgentId) return;

  try {
    await assertAgentUsableBy(db, assigneeAgentId, callerCtx);
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') {
      // Preserve the task-context message so the UI surfaces "Assignee agent
      // not found" instead of the generic "Agent not found". Cross-user access
      // to a private agent still resolves to NOT_FOUND, never FORBIDDEN, so we
      // don't leak existence of someone else's private agent.
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Assignee agent not found' });
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
async function resolveActivityActor(
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
    await assertAgentUsableBy(ctx.serverDB, claimedAgentId, {
      userId: ctx.userId,
      workspaceId: ctx.workspaceId ?? undefined,
    });
  }
  return { agentId: claimedAgentId ?? null, userId: ctx.userId };
}

async function resolveSafeParentTaskId(
  model: TaskModel,
  taskId: string,
  parentTaskId: string | null,
): Promise<string | null> {
  if (parentTaskId === null) return null;

  const parent = await resolveOrThrow(model, parentTaskId);
  if (parent.id === taskId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Task cannot be parented to itself',
    });
  }

  const descendants = await model.findAllDescendants(taskId);
  if (descendants.some((task) => task.id === parent.id)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Task cannot be parented to its own descendant',
    });
  }

  const task = await resolveOrThrow(model, taskId);
  if (task.projectId !== parent.projectId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Parent task must belong to the same project',
    });
  }

  return parent.id;
}

export const taskRouter = router({
  /**
   * Read a composer draft and report what it means — a name, the outcome as
   * understood, the questions that would change the deliverable, and whether
   * it is really a standing goal. Returns a reading only; nothing is created.
   */
  analyzeIntent: taskProcedureWrite
    .input(
      z.object({
        context: z.string().optional(),
        instruction: z.string().min(1).max(20_000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.taskIntentService.analyze(input);
      } catch (error) {
        if (isAcpJudgmentBindingError(error)) {
          const trpcError = new TRPCError({
            cause: error,
            code: 'PRECONDITION_FAILED',
            message: 'ACP_JUDGMENT_NO_BINDING',
          });
          markSilentTRPCErrorLog(trpcError.cause);
          throw trpcError;
        }
        const errorType = (error as { errorType?: unknown } | null)?.errorType;
        if (errorType === AgentRuntimeErrorType.InvalidProviderAPIKey) {
          const trpcError = new TRPCError({
            cause: error,
            code: 'PRECONDITION_FAILED',
            message: AgentRuntimeErrorType.InvalidProviderAPIKey,
          });
          // Runtime errors are plain payloads, so tRPC normalizes them into an
          // Error cause; mark the cause the shared handler actually receives.
          markSilentTRPCErrorLog(trpcError.cause);
          throw trpcError;
        }

        throw error;
      }
    }),

  /**
   * Rewrite a confirmed draft into the brief that gets executed, folding in the
   * answers the user just gave. Returns a brief only; nothing is created.
   */
  synthesizeInstruction: taskProcedureWrite
    .input(
      z.object({
        answers: z
          .array(z.object({ answer: z.string().min(1), question: z.string().min(1) }))
          .max(3),
        context: z.string().optional(),
        instruction: z.string().min(1).max(20_000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.taskIntentService.synthesize(input);
      } catch (error) {
        if (isAcpJudgmentBindingError(error)) {
          const trpcError = new TRPCError({
            cause: error,
            code: 'PRECONDITION_FAILED',
            message: 'ACP_JUDGMENT_NO_BINDING',
          });
          markSilentTRPCErrorLog(trpcError.cause);
          throw trpcError;
        }
        const errorType = (error as { errorType?: unknown } | null)?.errorType;
        if (errorType === AgentRuntimeErrorType.InvalidProviderAPIKey) {
          const trpcError = new TRPCError({
            cause: error,
            code: 'PRECONDITION_FAILED',
            message: AgentRuntimeErrorType.InvalidProviderAPIKey,
          });
          markSilentTRPCErrorLog(trpcError.cause);
          throw trpcError;
        }

        throw error;
      }
    }),

  reorderSubtasks: taskProcedureWrite
    .input(
      z.object({
        id: z.string(),
        // Ordered list of subtask identifiers (e.g. ['TASK-2', 'TASK-4', 'TASK-3'])
        order: z.array(z.string()),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const model = ctx.taskModel;
        const task = await resolveOrThrow(model, input.id);
        const subtasks = await model.findSubtasks(task.id);

        // Build identifier → id map
        const idMap = new Map<string, string>();
        for (const s of subtasks) idMap.set(s.identifier, s.id);

        // Validate all identifiers exist
        const reorderItems: Array<{ id: string; sortOrder: number }> = [];
        for (let i = 0; i < input.order.length; i++) {
          const identifier = input.order[i].toUpperCase();
          const taskId = idMap.get(identifier);
          if (!taskId) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Subtask not found: ${identifier}`,
            });
          }
          reorderItems.push({ id: taskId, sortOrder: i });
        }

        await model.reorder(reorderItems);

        return {
          data: reorderItems.map((item, i) => ({
            identifier: input.order[i],
            sortOrder: item.sortOrder,
          })),
          message: 'Subtasks reordered',
          success: true,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof TaskDependencyError) {
          throw new TRPCError({ cause: error, code: error.code, message: error.message });
        }
        console.error('[task:reorderSubtasks]', error);
        throw new TRPCError({
          cause: error,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to reorder subtasks',
        });
      }
    }),

  addComment: taskProcedureWrite
    .input(
      z.object({
        authorAgentId: z.string().optional(),
        briefId: z.string().optional(),
        content: z.string().min(1),
        editorData: z.unknown().optional(),
        id: z.string(),
        topicId: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const model = ctx.taskModel;
        const task = await resolveOrThrow(model, input.id);
        await assertAssigneeAgentBelongsToUser(
          ctx.serverDB,
          { userId: ctx.userId, workspaceId: ctx.workspaceId ?? undefined },
          input.authorAgentId,
        );
        // Resolve @mentions before the insert so an invalid editorData never
        // leaves a comment behind that nobody was told about.
        const mentionedUserIds =
          ctx.workspaceId && !input.authorAgentId
            ? await validateMentionedUserIds(
                ctx.serverDB,
                { actorUserId: ctx.userId, workspaceId: ctx.workspaceId },
                input.editorData,
              )
            : [];
        const comment = await model.addComment({
          authorAgentId: input.authorAgentId,
          authorUserId: input.authorAgentId ? undefined : ctx.userId,
          briefId: input.briefId,
          content: input.content,
          editorData: input.editorData as never,
          taskId: task.id,
          topicId: input.topicId,
          userId: ctx.userId,
        });
        // Member comment ping (Linear-style): the task creator and the member
        // assignee learn about new discussion; @mentioned members get the
        // stronger "mentioned" notification instead. Agent-authored progress
        // notes stay silent — they are not a conversation between members.
        if (ctx.workspaceId && !input.authorAgentId) {
          const recipients = collectTaskCommentRecipients({
            actorUserId: ctx.userId,
            mentionedUserIds,
            task,
          });
          if (recipients.length > 0) {
            notifyCommentActivityBestEffort(
              { serverDB: ctx.serverDB, taskModel: model, workspaceId: ctx.workspaceId },
              {
                actorUserId: ctx.userId,
                commentId: comment.id,
                recipients,
                taskId: task.id,
                workspaceId: ctx.workspaceId,
              },
            );
          }
        }
        return { data: comment, message: 'Comment added', success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof TaskDependencyError) {
          throw new TRPCError({ cause: error, code: error.code, message: error.message });
        }
        console.error('[task:addComment]', error);
        throw new TRPCError({
          cause: error,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to add comment',
        });
      }
    }),

  deleteComment: taskProcedureWrite
    .input(z.object({ commentId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const deleted = await ctx.taskModel.deleteComment(input.commentId);
        if (!deleted) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Comment not found' });
        }
        return { message: 'Comment deleted', success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof TaskDependencyError) {
          throw new TRPCError({ cause: error, code: error.code, message: error.message });
        }
        console.error('[task:deleteComment]', error);
        throw new TRPCError({
          cause: error,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete comment',
        });
      }
    }),

  updateComment: taskProcedureWrite
    .input(
      z.object({
        commentId: z.string(),
        content: z.string().min(1),
        editorData: z.unknown().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const workspaceId = ctx.workspaceId ?? undefined;
        const previous = await ctx.taskModel.findCommentById(input.commentId);
        if (!previous) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Comment not found' });
        }
        // Only members @mentioned for the first time by this edit are pinged;
        // mentions kept from the previous revision were already notified.
        let addedMentionUserIds: string[] = [];
        if (workspaceId && !previous.authorAgentId && input.editorData !== undefined) {
          const previousMentions = new Set(extractMentionedUserIds(previous.editorData));
          const nextMentions = await validateMentionedUserIds(
            ctx.serverDB,
            { actorUserId: ctx.userId, workspaceId },
            input.editorData,
          );
          addedMentionUserIds = nextMentions.filter((id) => !previousMentions.has(id));
        }
        const comment = await ctx.taskModel.updateComment(input.commentId, input.content, {
          editorData: input.editorData === undefined ? null : input.editorData,
        });
        if (!comment) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Comment not found' });
        }
        if (workspaceId && addedMentionUserIds.length > 0) {
          notifyCommentActivityBestEffort(
            { serverDB: ctx.serverDB, taskModel: ctx.taskModel, workspaceId },
            {
              actorUserId: ctx.userId,
              commentId: comment.id,
              recipients: addedMentionUserIds.map((userId) => ({ kind: 'mentioned', userId })),
              taskId: comment.taskId,
              workspaceId,
            },
          );
        }
        return { data: comment, message: 'Comment updated', success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof TaskDependencyError) {
          throw new TRPCError({ cause: error, code: error.code, message: error.message });
        }
        console.error('[task:updateComment]', error);
        throw new TRPCError({
          cause: error,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update comment',
        });
      }
    }),

  addDependency: taskProcedureWrite
    .input(
      z.object({
        dependsOnId: z.string(),
        taskId: z.string(),
        type: z.enum(['blocks', 'relates']).default('blocks'),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const model = ctx.taskModel;
        const task = await resolveOrThrow(model, input.taskId);
        const dep = await resolveOrThrow(model, input.dependsOnId);
        await model.addDependency(task.id, dep.id, input.type, { source: 'user' });
        return { message: 'Dependency added', success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof TaskDependencyError) {
          throw new TRPCError({ cause: error, code: error.code, message: error.message });
        }
        console.error('[task:addDependency]', error);
        if (error instanceof Error && error.message.includes('project boundaries')) {
          throw new TRPCError({ cause: error, code: 'BAD_REQUEST', message: error.message });
        }
        throw new TRPCError({
          cause: error,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to add dependency',
        });
      }
    }),

  cancelTopic: taskProcedureWrite
    .input(z.object({ topicId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      try {
        await ctx.taskService.cancelTopic(input.topicId);
        return { message: 'Topic canceled', success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof TaskDependencyError) {
          throw new TRPCError({ cause: error, code: error.code, message: error.message });
        }
        console.error('[task:cancelTopic]', error);
        throw new TRPCError({
          cause: error,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to cancel topic',
        });
      }
    }),

  deleteTopic: taskProcedureWrite
    .input(z.object({ topicId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      try {
        await ctx.taskService.deleteTopic(input.topicId);
        return { message: 'Topic deleted', success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof TaskDependencyError) {
          throw new TRPCError({ cause: error, code: error.code, message: error.message });
        }
        console.error('[task:deleteTopic]', error);
        throw new TRPCError({
          cause: error,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete topic',
        });
      }
    }),

  create: taskProcedureWrite.input(createSchema).mutation(async ({ input, ctx }) => {
    const { goal: legacyGoal, ...createInput } = input;
    if (legacyGoal !== undefined) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          'Creating a goal through task.create is no longer supported. Reload the app, then create the goal again.',
      });
    }
    try {
      const parsedVerify = taskVerifyConfigPatchSchema.safeParse(createInput.config?.verify);
      const { verify: _legacyVerify, ...taskConfig } = createInput.config ?? {};
      // Board `+` presets: a workflow-category target resolves against the
      // team's imported states (exact match → stamp the state; otherwise keep
      // the bare category — the board groups on it regardless). Creating into
      // a real column also bypasses intake, so `triageStatus` lands 'accepted'
      // instead of the model's 'untriaged' default and the new card stays
      // visible on a triage-capable team's board.
      const workflowPreset = resolveWorkflowCreatePreset({
        category: createInput.workflowCategory,
        states:
          createInput.workflowCategory && createInput.teamId && ctx.teamModel
            ? await ctx.teamModel.listWorkflowStates(createInput.teamId)
            : [],
        status: createInput.status,
        teamId: createInput.teamId,
      });
      const task = await ctx.taskService.createTask({
        ...createInput,
        ...workflowPreset,
        config: parsedVerify.success ? taskConfig : createInput.config,
      });
      try {
        if (parsedVerify.success) {
          const { requirement, ...rawConfig } = parsedVerify.data;
          const config = Object.fromEntries(
            Object.entries(rawConfig).filter(([, value]) => value != null),
          );
          await new AcceptanceService(
            ctx.serverDB,
            ctx.userId,
            ctx.workspaceId ?? undefined,
          ).ensureForSubject('task', task.id, {
            config,
            requirement: requirement ?? undefined,
          });
        }
      } catch (error) {
        await ctx.taskModel.delete(task.id).catch(() => {});
        throw error;
      }
      // Creating a task already assigned to another member notifies them.
      notifyAssignedBestEffort(ctx, task);
      return { data: task, message: 'Task created', success: true };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      console.error('[task:create]', error);
      const causeMessage = error instanceof Error ? error.message : String(error);
      throw new TRPCError({
        cause: error,
        code: 'INTERNAL_SERVER_ERROR',
        message: causeMessage ? `Failed to create task: ${causeMessage}` : 'Failed to create task',
      });
    }
  }),

  clearAll: taskProcedureWrite.mutation(async ({ ctx }) => {
    try {
      const model = ctx.taskModel;
      // Workspace clear-all is caller-scoped for every role — owners included
      // (per docs/usage/workspace-permissions: bulk actions only affect
      // caller-created content).
      const restrictToCreator = !!ctx.workspaceId;
      // Snapshot without side effects, then delete a frozen set under the graph
      // lock. A rejected deletion must never remove a surviving task's worktree.
      const ids = await model.getTaskIdsForDeletion(restrictToCreator);
      const snapshots = new Map(
        await Promise.all(
          ids.map(async (id) => [id, await ctx.taskIntegration.snapshotTaskWorktrees(id)] as const),
        ),
      );
      const deletedIds = await model.deleteMany(ids, { source: 'user' });
      await Promise.allSettled(
        deletedIds.map((id) => ctx.taskIntegration.cleanupTaskWorktrees(id, snapshots.get(id)!)),
      );
      const count = deletedIds.length;
      return { count, message: `${count} tasks deleted`, success: true };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      if (error instanceof TaskDependencyError) {
        throw new TRPCError({ cause: error, code: error.code, message: error.message });
      }
      console.error('[task:clearAll]', error);
      throw new TRPCError({
        cause: error,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to clear tasks',
      });
    }
  }),

  delete: taskProcedureWrite.input(idInput).mutation(async ({ input, ctx }) => {
    try {
      const model = ctx.taskModel;
      const task = await resolveOrThrow(model, input.id);
      assertWorkspaceRowManageable(ctx, task.createdByUserId, 'task');
      const snapshot = await ctx.taskIntegration.snapshotTaskWorktrees(task.id);
      const deleted = await model.delete(task.id, { source: 'user' });
      if (deleted) await ctx.taskIntegration.cleanupTaskWorktrees(task.id, snapshot);
      return { data: task, message: 'Task deleted', success: true };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      if (error instanceof TaskDependencyError) {
        throw new TRPCError({ cause: error, code: error.code, message: error.message });
      }
      console.error('[task:delete]', error);
      throw new TRPCError({
        cause: error,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to delete task',
      });
    }
  }),

  /**
   * Workspace-wide automation run history + summary counts, backing the
   * Automations "All runs" surface. Read-level procedure (viewers may watch
   * runs), scoped the same way as `list.scope`: 'created' narrows to
   * automations the caller created (the "mine" tab).
   */
  automationRuns: taskProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
        scope: z.enum(['created']).optional(),
        search: z.string().trim().min(1).max(200).optional(),
        statuses: z.array(z.string()).min(1).max(10).optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      try {
        const createdByUserId = input.scope === 'created' ? ctx.userId : undefined;
        const [page, stats] = await Promise.all([
          ctx.taskTopicModel.findAutomationRuns({
            createdByUserId,
            limit: input.limit,
            offset: input.offset,
            search: input.search,
            statuses: input.statuses,
          }),
          ctx.taskTopicModel.automationRunStats({ createdByUserId }),
        ]);
        return {
          data: { runs: page.rows, stats, total: page.total },
          success: true,
        };
      } catch (error) {
        console.error('[task:automationRuns]', error);
        throw new TRPCError({
          cause: error,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to list automation runs',
        });
      }
    }),

  contractContext: taskProcedure.input(idInput).query(async ({ input, ctx }) => {
    try {
      const task = await resolveOrThrow(ctx.taskModel, input.id);
      const topics = await ctx.taskTopicModel.findByTaskId(task.id).catch(() => []);
      // The contract a fresh run would descend from — latest topic carrying
      // one — plus whether the live task constraints have drifted from the
      // revisions that contract pinned (pending un-adopted edits).
      const contract = [...topics]
        .sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0))
        .find((t) => t.contract)?.contract;
      const pendingConstraintEdits = Boolean(
        contract &&
        (contract.versions?.requirementRevision !== task.requirementRevision ||
          contract.versions?.policyRevision !== task.policyRevision),
      );
      return {
        data: {
          contract: contract
            ? {
                contractId: contract.contractId ?? null,
                intent: contract.intent ?? null,
                replan: contract.replan ?? null,
                revision: contract.revision ?? null,
                sourceContractId: contract.sourceContractId ?? null,
              }
            : null,
          pendingConstraintEdits,
          policyRevision: task.policyRevision,
          requirementRevision: task.requirementRevision,
        },
        success: true,
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      console.error('[task:contractContext]', error);
      throw new TRPCError({
        cause: error,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get task contract context',
      });
    }
  }),

  detail: taskProcedure.input(idInput).query(async ({ input, ctx }) => {
    try {
      const detail = await ctx.taskService.getTaskDetail(input.id);
      if (!detail) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
      }

      return { data: detail, success: true };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      console.error('[task:detail]', error);
      throw new TRPCError({
        cause: error,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get task detail',
      });
    }
  }),

  find: taskProcedure.input(idInput).query(async ({ input, ctx }) => {
    try {
      const model = ctx.taskModel;
      const task = await resolveOrThrow(model, input.id);
      return { data: task, success: true };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      console.error('[task:find]', error);
      throw new TRPCError({
        cause: error,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to find task',
      });
    }
  }),

  getDependencies: taskProcedure.input(idInput).query(async ({ input, ctx }) => {
    try {
      const model = ctx.taskModel;
      const task = await resolveOrThrow(model, input.id);
      const deps = await model.getDependencies(task.id);
      return { data: deps, success: true };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      console.error('[task:getDependencies]', error);
      throw new TRPCError({
        cause: error,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get dependencies',
      });
    }
  }),

  getPinnedDocuments: taskProcedure.input(idInput).query(async ({ input, ctx }) => {
    try {
      const model = ctx.taskModel;
      const task = await resolveOrThrow(model, input.id);
      const docs = await model.getPinnedDocuments(task.id);
      return { data: docs, success: true };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      console.error('[task:getPinnedDocuments]', error);
      throw new TRPCError({
        cause: error,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get documents',
      });
    }
  }),

  getTopics: taskProcedure.input(idInput).query(async ({ input, ctx }) => {
    try {
      const model = ctx.taskModel;
      const task = await resolveOrThrow(model, input.id);
      const results = await ctx.taskTopicModel.findWithDetails(task.id);
      return { data: results, success: true };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      console.error('[task:getTopics]', error);
      throw new TRPCError({
        cause: error,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get task topics',
      });
    }
  }),

  getSubtasks: taskProcedure.input(idInput).query(async ({ input, ctx }) => {
    try {
      const model = ctx.taskModel;
      const task = await resolveOrThrow(model, input.id);
      const subtasks = await model.findSubtasks(task.id);
      return { data: subtasks, success: true };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      console.error('[task:getSubtasks]', error);
      throw new TRPCError({
        cause: error,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get subtasks',
      });
    }
  }),

  getTaskTree: taskProcedure.input(idInput).query(async ({ input, ctx }) => {
    try {
      const model = ctx.taskModel;
      const task = await resolveOrThrow(model, input.id);
      const tree = await model.getTaskTree(task.id);
      return { data: tree, success: true };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      console.error('[task:getTaskTree]', error);
      throw new TRPCError({
        cause: error,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get task tree',
      });
    }
  }),

  heartbeat: taskProcedureWrite.input(idInput).mutation(async ({ input, ctx }) => {
    try {
      const model = ctx.taskModel;
      const task = await resolveOrThrow(model, input.id);
      await model.updateHeartbeat(task.id);
      return { message: 'Heartbeat updated', success: true };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      console.error('[task:heartbeat]', error);
      throw new TRPCError({
        cause: error,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update heartbeat',
      });
    }
  }),

  watchdog: taskProcedureWrite.mutation(async ({ ctx }) => {
    try {
      const result = await runTaskWatchdog(ctx.serverDB, {
        createdByUserId: ctx.userId,
        workspaceId: ctx.workspaceId ?? undefined,
      });

      return {
        ...result,
        message:
          result.failed.length > 0
            ? `${result.failed.length} stuck tasks marked as failed`
            : 'No stuck tasks found',
      };
    } catch (error) {
      console.error('[task:watchdog]', error);
      throw new TRPCError({
        cause: error,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Watchdog check failed',
      });
    }
  }),

  groupList: taskProcedure.input(groupListSchema).query(async ({ input, ctx }) => {
    try {
      const model = ctx.taskModel;
      const { scope, ...query } = input;
      const groups = await model.groupList({
        ...query,
        ...(scope === 'assigned' ? { assigneeUserId: ctx.userId } : {}),
        ...(scope === 'created' ? { createdByUserId: ctx.userId } : {}),
        ...(scope === 'delegated' ? { delegatedByUserId: ctx.userId } : {}),
      });
      return { data: groups, success: true };
    } catch (error) {
      console.error('[task:groupList]', error);
      throw new TRPCError({
        cause: error,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch grouped tasks',
      });
    }
  }),

  list: taskProcedure.input(listSchema).query(async ({ input, ctx }) => {
    try {
      const model = ctx.taskModel;
      const { parentIdentifier, scope, ...query } = input;
      let parentTaskId = query.parentTaskId;

      if (parentIdentifier) {
        const parent = await model.resolve(parentIdentifier);
        if (!parent) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Parent task not found: ${parentIdentifier}`,
          });
        }

        parentTaskId = parent.id;
      }

      const result = await model.list({
        ...query,
        ...(scope === 'assigned' ? { assigneeUserId: ctx.userId } : {}),
        ...(scope === 'created' ? { createdByUserId: ctx.userId } : {}),
        parentTaskId,
      });

      const assigneeIds = [
        ...new Set(result.tasks.map((t) => t.assigneeAgentId).filter((id): id is string => !!id)),
      ];
      const assigneeUserIds = [
        ...new Set(result.tasks.map((t) => t.assigneeUserId).filter((id): id is string => !!id)),
      ];
      const [agents, users] = await Promise.all([
        assigneeIds.length > 0 ? ctx.agentModel.getAgentAvatarsByIds(assigneeIds) : [],
        assigneeUserIds.length > 0
          ? UserModel.getDisplayInfoByIds(ctx.serverDB, assigneeUserIds)
          : [],
      ]);
      const agentMap = new Map(agents.map((a) => [a.id, a]));
      const userMap = new Map(users.map((u) => [u.id, u]));

      const data: TaskListItem[] = result.tasks.map((task) => {
        const participants: TaskParticipant[] = [];
        if (task.assigneeAgentId) {
          const agent = agentMap.get(task.assigneeAgentId);
          if (agent) {
            participants.push({
              avatar: agent.avatar,
              backgroundColor: agent.backgroundColor,
              id: agent.id,
              title: agent.title ?? '',
              type: 'agent',
            });
          }
        }
        if (task.assigneeUserId) {
          const user = userMap.get(task.assigneeUserId);
          if (user) {
            participants.push({
              avatar: user.avatar,
              backgroundColor: null,
              id: user.id,
              title: user.fullName ?? user.username ?? '',
              type: 'user',
            });
          }
        }
        return { ...task, participants };
      });

      return { data, success: true, total: result.total };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      console.error('[task:list]', error);
      throw new TRPCError({
        cause: error,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to list tasks',
      });
    }
  }),

  run: taskProcedureWrite
    .input(
      idInput.merge(
        z.object({
          continueTopicId: z.string().optional(),
          delegationGrantId: z.string().optional(),
          idempotencyKey: z.string().min(1).max(255).optional(),
          // SB08: which contract this run adopts. `continue` continues an
          // existing topic; `repair` re-executes the frozen contract;
          // `authorized_replan` adopts the live (edited) constraints under a
          // task.replan action approval. Omitting intent on a drifted
          // contract is an explicit CONFLICT, never a silent adoption.
          intent: z.enum(['continue', 'repair', 'authorized_replan']).optional(),
          prompt: z.string().optional(),
          replanApprovalId: z.string().optional(),
          sourceContractId: z.string().optional(),
        }),
      ),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const task = await resolveOrThrow(ctx.taskModel, input.id);

        // Delegated run: the grant must be live, unexpired, action-permitted
        // and bound to THIS task — a grant for another task stays invisible.
        // The validated grant then BINDS the run: it executes as the grant's
        // agent (never the task's stored assignee or the inbox fallback) and
        // is epoch-fenced to the grant id on its task_topics row.
        let delegation: { agentId: string; grantId: string } | undefined;
        if (input.delegationGrantId) {
          const grant = await ctx.delegation.validateGrantForRun({
            action: 'run',
            grantId: input.delegationGrantId,
          });
          if (grant.taskId !== task.id) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
          }
          delegation = { agentId: grant.agentId, grantId: grant.id };
        }

        const runner = new TaskRunnerService(
          ctx.serverDB,
          ctx.userId,
          ctx.workspaceId ?? undefined,
        );
        return await runner.runTask({
          continueTopicId: input.continueTopicId,
          delegation,
          extraPrompt: input.prompt,
          idempotencyKey: input.idempotencyKey,
          intent: input.intent,
          replanApprovalId: input.replanApprovalId,
          sourceContractId: input.sourceContractId,
          taskId: task.id,
        });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof TaskDependencyError) {
          throw new TRPCError({ cause: error, code: error.code, message: error.message });
        }
        console.error('[task:run]', error);
        throw new TRPCError({
          cause: error,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to run task',
        });
      }
    }),

  retryIntegration: taskProcedureWrite
    .input(z.object({ id: z.string(), topicId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const task = await resolveOrThrow(ctx.taskModel, input.id);
      const topic = await ctx.taskTopicModel.findByTopicId(input.topicId);
      if (!topic || topic.taskId !== task.id || !topic.integration) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Integration run not found' });
      }
      if (
        topic.integration.state !== 'publish_failed' &&
        topic.integration.state !== 'verification_pending'
      ) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Integration is not retryable from ${topic.integration.state}`,
        });
      }

      await ctx.taskLifecycle.onTopicComplete({
        operationId: topic.operationId ?? `integration-retry:${input.topicId}`,
        reason: 'done',
        runTrigger: topic.trigger ?? 'manual',
        taskId: task.id,
        taskIdentifier: task.identifier,
        topicId: input.topicId,
      });
      return { success: true };
    }),

  pinDocument: taskProcedureWrite
    .input(
      z.object({
        documentId: z.string(),
        pinnedBy: z.string().default('user'),
        taskId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const model = ctx.taskModel;
        const task = await resolveOrThrow(model, input.taskId);
        await model.pinDocument(task.id, input.documentId, input.pinnedBy);
        return { message: 'Document pinned', success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof TaskDependencyError) {
          throw new TRPCError({ cause: error, code: error.code, message: error.message });
        }
        console.error('[task:pinDocument]', error);
        throw new TRPCError({
          cause: error,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to pin document',
        });
      }
    }),

  removeDependency: taskProcedureWrite
    .input(z.object({ dependsOnId: z.string(), taskId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const model = ctx.taskModel;
        const task = await resolveOrThrow(model, input.taskId);
        // A known raw edge target may have become private/trashed. Authorize
        // the dependent, not the upstream, so its owner can remove that blocker.
        const depId = input.dependsOnId.startsWith('task_')
          ? input.dependsOnId
          : (await resolveOrThrow(model, input.dependsOnId)).id;
        await model.removeDependency(task.id, depId, { source: 'user' });
        return { message: 'Dependency removed', success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof TaskDependencyError) {
          throw new TRPCError({ cause: error, code: error.code, message: error.message });
        }
        console.error('[task:removeDependency]', error);
        throw new TRPCError({
          cause: error,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to remove dependency',
        });
      }
    }),

  unpinDocument: taskProcedureWrite
    .input(z.object({ documentId: z.string(), taskId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const model = ctx.taskModel;
        const task = await resolveOrThrow(model, input.taskId);
        await model.unpinDocument(task.id, input.documentId);
        return { message: 'Document unpinned', success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof TaskDependencyError) {
          throw new TRPCError({ cause: error, code: error.code, message: error.message });
        }
        console.error('[task:unpinDocument]', error);
        throw new TRPCError({
          cause: error,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to unpin document',
        });
      }
    }),

  getCheckpoint: taskProcedure.input(idInput).query(async ({ input, ctx }) => {
    try {
      const model = ctx.taskModel;
      const task = await resolveOrThrow(model, input.id);
      const checkpoint = model.getCheckpointConfig(task);
      return { data: checkpoint, success: true };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      console.error('[task:getCheckpoint]', error);
      throw new TRPCError({
        cause: error,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get checkpoint',
      });
    }
  }),

  updateCheckpoint: taskProcedureWrite
    .input(
      idInput.merge(
        z.object({
          checkpoint: z.object({
            onAgentRequest: z.boolean().optional(),
            tasks: z
              .object({
                afterIds: z.array(z.string()).optional(),
                beforeIds: z.array(z.string()).optional(),
              })
              .optional(),
            topic: z
              .object({
                after: z.boolean().optional(),
                before: z.boolean().optional(),
              })
              .optional(),
          }),
        }),
      ),
    )
    .mutation(async ({ input, ctx }) => {
      const { id, checkpoint } = input;
      try {
        const model = ctx.taskModel;
        const resolved = await resolveOrThrow(model, id);
        const task = await model.updateCheckpointConfig(resolved.id, checkpoint, {
          invalidateRun: true,
        });
        if (!task) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
        return {
          data: model.getCheckpointConfig(task),
          message: 'Checkpoint updated',
          success: true,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof TaskDependencyError) {
          throw new TRPCError({ cause: error, code: error.code, message: error.message });
        }
        console.error('[task:updateCheckpoint]', error);
        throw new TRPCError({
          cause: error,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update checkpoint',
        });
      }
    }),

  getReview: taskProcedure.input(idInput).query(async ({ input, ctx }) => {
    try {
      const model = ctx.taskModel;
      const task = await resolveOrThrow(model, input.id);
      return { data: model.getReviewConfig(task) || null, success: true };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      console.error('[task:getReview]', error);
      throw new TRPCError({
        cause: error,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get review config',
      });
    }
  }),

  updateReview: taskProcedureWrite
    .input(
      idInput.merge(
        z.object({
          review: z.object({
            autoRetry: z.boolean().default(true),
            enabled: z.boolean(),
            judge: z
              .object({
                model: z.string().optional(),
                provider: z.string().optional(),
              })
              .default({}),
            maxIterations: z.number().min(1).max(10).default(3),
            rubrics: z.array(
              z.object({
                config: z.record(z.string(), z.unknown()),
                extractor: z.record(z.string(), z.unknown()).optional(),
                id: z.string(),
                name: z.string(),
                threshold: z.number().min(0).max(1).optional(),
                type: z.string(),
                weight: z.number().default(1),
              }),
            ),
          }),
        }),
      ),
    )
    .mutation(async ({ input, ctx }) => {
      const { id, review } = input;
      try {
        const model = ctx.taskModel;
        const resolved = await resolveOrThrow(model, id);
        const task = await model.updateReviewConfig(resolved.id, review, { invalidateRun: true });
        if (!task) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
        return {
          data: model.getReviewConfig(task),
          message: 'Review config updated',
          success: true,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof TaskDependencyError) {
          throw new TRPCError({ cause: error, code: error.code, message: error.message });
        }
        console.error('[task:updateReview]', error);
        throw new TRPCError({
          cause: error,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update review config',
        });
      }
    }),

  getVerifyConfig: taskProcedure.input(idInput).query(async ({ input, ctx }) => {
    try {
      const model = ctx.taskModel;
      const task = await resolveOrThrow(model, input.id);
      const resolved = await resolveTaskAcceptance(
        ctx.serverDB,
        ctx.userId,
        task.id,
        ctx.workspaceId ?? undefined,
      );
      return {
        data: resolved ? { ...resolved.config, requirement: resolved.requirement } : null,
        success: true,
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      console.error('[task:getVerifyConfig]', error);
      throw new TRPCError({
        cause: error,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get verify config',
      });
    }
  }),

  updateVerifyConfig: taskProcedureWrite
    .input(
      idInput.merge(
        z.object({
          // `.nullish()` lets callers clear a saved field: `null` removes it
          // (JSON can't send `undefined`), omission leaves it untouched.
          verify: taskVerifyConfigPatchSchema,
        }),
      ),
    )
    .mutation(async ({ input, ctx }) => {
      const { id, verify } = input;
      try {
        const model = ctx.taskModel;
        const task = await resolveOrThrow(model, id);
        const acceptanceService = new AcceptanceService(
          ctx.serverDB,
          ctx.userId,
          ctx.workspaceId ?? undefined,
        );
        const resolvedAcceptance = await resolveTaskAcceptance(
          ctx.serverDB,
          ctx.userId,
          task.id,
          ctx.workspaceId ?? undefined,
        );
        const acceptance =
          resolvedAcceptance?.acceptance ??
          (await acceptanceService.ensureForSubject('task', task.id));
        const nextConfig = { ...acceptance.config } as Record<string, unknown>;
        for (const [key, value] of Object.entries(verify)) {
          if (key === 'requirement') continue;
          if (value === null) delete nextConfig[key];
          else if (value !== undefined) nextConfig[key] = value;
        }
        const requirement =
          verify.requirement === undefined ? acceptance.requirement : verify.requirement;
        const updated = await acceptanceService.acceptanceModel.updatePolicy(acceptance.id, {
          config: nextConfig,
          requirement,
        });
        if (!updated) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Acceptance policy not found' });
        }
        const data: TaskVerifyConfig = {
          ...(nextConfig as TaskVerifyConfig),
          requirement: requirement ?? undefined,
        };
        return {
          data,
          message: 'Verify config updated',
          success: true,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof TaskDependencyError) {
          throw new TRPCError({ cause: error, code: error.code, message: error.message });
        }
        console.error('[task:updateVerifyConfig]', error);
        throw new TRPCError({
          cause: error,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update verify config',
        });
      }
    }),

  runReview: taskProcedureWrite
    .input(
      idInput.merge(
        z.object({
          content: z.string().optional(),
          topicId: z.string().optional(),
        }),
      ),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await ctx.taskService.runReview(input);
        return { data: result, success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof TaskDependencyError) {
          throw new TRPCError({ cause: error, code: error.code, message: error.message });
        }
        console.error('[task:runReview]', error);
        throw new TRPCError({
          cause: error,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to run review',
        });
      }
    }),

  update: taskProcedureWrite
    .input(idInput.merge(updateSchema).extend({ actorAgentId: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const { actorAgentId, afterId, beforeId, id, moveScope, parentTaskId, status, ...data } =
        input;
      try {
        const model = ctx.taskModel;
        const actor = await resolveActivityActor(ctx, actorAgentId);
        await assertAssigneeAgentBelongsToUser(
          ctx.serverDB,
          { userId: ctx.userId, workspaceId: ctx.workspaceId ?? undefined },
          data.assigneeAgentId,
        );
        const resolved = await resolveOrThrow(model, id);

        let workflowPatch:
          | {
              workflowCategory: TaskWorkflowCategory;
              workflowStateId: string;
              workflowStateRefId?: string | null;
            }
          | undefined;
        if (data.workflowCategory !== undefined) {
          if (!ctx.workspaceId || !resolved.workflowStateId) {
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: 'Business workflow moves require a linked Linear issue',
            });
          }

          const linearSyncModel = new LinearSyncModel(ctx.serverDB, ctx.workspaceId);
          const issueLink = await linearSyncModel.findIssueLinkByTaskId(resolved.id);
          const binding = issueLink?.bindingId
            ? await linearSyncModel.findBindingById(issueLink.bindingId)
            : null;
          if (issueLink && binding) {
            if (!linearBindingWriteEnabled(binding)) {
              throw new TRPCError({
                code: 'PRECONDITION_FAILED',
                message: 'Linear workflow writes are unavailable for this task',
              });
            }

            const targetMappings = (binding.settings.statusMappings ?? []).filter(
              (mapping) => mapping.workflowCategory === data.workflowCategory,
            );
            if (targetMappings.length === 0) {
              throw new TRPCError({
                code: 'PRECONDITION_FAILED',
                message: `No Linear state is mapped to ${data.workflowCategory}`,
              });
            }
            if (targetMappings.length > 1) {
              throw new TRPCError({
                code: 'PRECONDITION_FAILED',
                message: `Multiple Linear states are mapped to ${data.workflowCategory}; choose one in workspace settings`,
              });
            }
            workflowPatch = {
              workflowCategory: data.workflowCategory,
              workflowStateId: targetMappings[0].linearStateId,
            };
          } else if (issueLink?.linearTeamId && resolved.teamId) {
            // Team-scope links carry no project binding — category moves resolve
            // through the team's imported workflow states (lowest position wins).
            const teamLink = await linearSyncModel.findTeamLinkByLinearTeamId(
              issueLink.linearTeamId,
            );
            if (!teamLink || teamLink.syncState !== 'synced') {
              throw new TRPCError({
                code: 'PRECONDITION_FAILED',
                message: 'Linear workflow writes are unavailable for this task',
              });
            }
            const [targetState] = (await ctx.teamModel.listWorkflowStates(resolved.teamId))
              .filter(
                (state) => state.category === data.workflowCategory && state.remoteStateId !== null,
              )
              .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
            if (!targetState) {
              throw new TRPCError({
                code: 'PRECONDITION_FAILED',
                message: `No Linear state is mapped to ${data.workflowCategory}`,
              });
            }
            workflowPatch = {
              workflowCategory: data.workflowCategory,
              workflowStateId: targetState.remoteStateId!,
              workflowStateRefId: targetState.id,
            };
          } else {
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: 'Linear workflow writes are unavailable for this task',
            });
          }
        }

        // Collaborative edit lock: reject writes to a workspace task another member
        // is actively editing. Inert until a client acquires the lock.
        if (ctx.workspaceId) {
          const blockedBy = await ctx.editLockService.getBlockingHolder('task', resolved.id);
          if (blockedBy) {
            throw new TRPCError({
              cause: { data: { code: 'DocumentLocked' } },
              code: 'CONFLICT',
              message: 'Task is being edited by another user',
            });
          }
        }

        // Reject changing the assignee to a private agent on a public task —
        // a public task must never be assigned to a private agent.
        // `undefined` means "no change"; `null` clears the assignee and is
        // always safe.
        if (data.assigneeAgentId) {
          const agentVisibility = await ctx.agentModel.getAgentVisibility(data.assigneeAgentId);
          ctx.taskService.assertAgentVisibilityCompat(resolved.visibility, agentVisibility);
        }

        // A private task can only be assigned to its creator — the assignee
        // would otherwise never see the task. `null` clears and is always safe.
        ctx.taskService.assertAssigneeUserVisibilityCompat(
          resolved.visibility,
          data.assigneeUserId,
          resolved.createdByUserId ?? ctx.userId,
        );

        // The reviewer is the human accountable at review — same workspace
        // membership and private-visibility rules as the member assignee.
        // `null` clears and is always safe.
        await ctx.taskService.assertAssigneeUserAssignable(data.reviewerUserId);
        ctx.taskService.assertAssigneeUserVisibilityCompat(
          resolved.visibility,
          data.reviewerUserId,
          resolved.createdByUserId ?? ctx.userId,
        );

        const resolvedParentTaskId =
          parentTaskId === undefined
            ? undefined
            : await resolveSafeParentTaskId(model, resolved.id, parentTaskId);

        // Reparenting a public task under a private one breaks the parent
        // visibility invariant — a subtask cannot be more public than its
        // parent (otherwise workspace members would still see the child while
        // its new parent is hidden). `undefined` means "no change"; `null`
        // clears the parent and is always safe.
        if (resolvedParentTaskId) {
          const newParent = await model.findById(resolvedParentTaskId);
          ctx.taskService.assertParentVisibilityCompat(resolved.visibility, newParent?.visibility);
        }

        const updateData = {
          ...data,
          ...workflowPatch,
          ...(parentTaskId === undefined ? {} : { parentTaskId: resolvedParentTaskId }),
        };
        // `instruction` is the markdown source of truth while `editorData` is its
        // rich-text mirror. Text-only callers (for example the editTask builtin)
        // cannot produce Lexical JSON, so discard the stale mirror and let the
        // editor rebuild from markdown. Callers that provide both fields keep
        // their explicit editor state.
        const normalizedUpdateData =
          updateData.instruction !== undefined && updateData.editorData === undefined
            ? { ...updateData, editorData: null }
            : updateData;

        // Kanban drop anchors resolve to a fractional position against the
        // live rows (the board may have shifted while the drag was in flight).
        // When both anchors vanished mid-drag the write keeps its explicit
        // `position` (or none) rather than failing the whole update.
        const movePosition =
          beforeId || afterId
            ? await model.computeMovePosition(
                { afterId, beforeId },
                moveScope ?? undefined,
                resolved.id,
              )
            : null;
        const finalUpdateData =
          movePosition === null
            ? normalizedUpdateData
            : { ...normalizedUpdateData, position: movePosition };
        // Agent attribution comes from `resolveActivityActor` above. The
        // assignment activity is written inside this update's own transaction
        // (see `TaskModel.updateWithLog`), so a concurrent reassignment cannot
        // interleave between reading the old assignee and recording it.
        const task = status
          ? await ctx.serverDB.transaction(async (tx) => {
              const taskService = new TaskService(tx, ctx.userId, ctx.workspaceId ?? undefined);
              const updated = await taskService.updateTaskWithAssigneeLock(
                resolved.id,
                finalUpdateData,
                actor,
              );
              if (!updated) return null;

              const result = await taskService.updateStatus({ id: resolved.id, status }, actor);
              return result.task;
            })
          : await ctx.taskService.updateTaskWithAssigneeLock(resolved.id, finalUpdateData, actor);
        if (!task) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
        // Only an actual assignee change notifies — re-saving the same assignee
        // stays silent (self-assignment is filtered inside the helper).
        if (task.assigneeUserId !== resolved.assigneeUserId) {
          notifyAssignedBestEffort(ctx, task);
        }
        return { data: task, message: 'Task updated', success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof TaskDependencyError) {
          throw new TRPCError({ cause: error, code: error.code, message: error.message });
        }
        console.error('[task:update]', error);
        throw new TRPCError({
          cause: error,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update task',
        });
      }
    }),

  updateVisibility: taskProcedureWrite
    .input(idInput.merge(z.object({ visibility: z.enum(['private', 'public']) })))
    .mutation(async ({ input, ctx }) => {
      try {
        const resolved = await resolveOrThrow(ctx.taskModel, input.id);

        // Mirror the edit-lock contract from `update`: reject visibility flips
        // while another workspace member is actively editing this task. Without
        // this check a collaborator could silently retitle a private task to
        // public (or vice versa) while you're mid-edit.
        if (ctx.workspaceId) {
          const blockedBy = await ctx.editLockService.getBlockingHolder('task', resolved.id);
          if (blockedBy) {
            throw new TRPCError({
              cause: { data: { code: 'DocumentLocked' } },
              code: 'CONFLICT',
              message: 'Task is being edited by another user',
            });
          }
        }

        // The creator can always change visibility on their own tasks. In
        // workspace mode, workspace owners may still promote other members'
        // tasks (mirrors the transferTask policy at line ~1166), but demoting
        // to private stays creator-only: the task would land in
        // the creator's private list, so an owner-initiated demotion just
        // appropriates another member's data.
        if (ctx.workspaceId && resolved.createdByUserId !== ctx.userId) {
          if (input.visibility === 'private') {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Only the task creator can make this task private',
            });
          }
          const canOverride = await hasWorkspaceScopedPermission({
            action: 'AGENT_UPDATE',
            db: ctx.serverDB,
            scopes: ['ALL'],
            userId: ctx.userId,
            workspaceId: ctx.workspaceId,
          });
          if (!canOverride) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Only the task creator or workspace owner can change visibility',
            });
          }
        }

        // Demoting a mixed-creator subtree would fracture it: each descendant
        // stays owned by its creator, so the root creator loses other
        // members' subtasks while those members keep orphaned children whose
        // parent is hidden. Reject early — the subtree must be single-creator
        // to go private.
        if (input.visibility === 'private') {
          const hasOtherCreators = await ctx.taskModel.subtreeHasOtherCreators(
            resolved.id,
            resolved.createdByUserId ?? ctx.userId,
          );
          if (hasOtherCreators) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message:
                'Cannot make this task private while it has subtasks created by other members. Reassign or remove those subtasks first.',
            });
          }
        }

        // Demoting a member-assigned task to private would strand the
        // assignee: the task disappears from their view while still carrying
        // their name. Reject early — unassign first, then demote.
        if (input.visibility === 'private') {
          ctx.taskService.assertAssigneeUserVisibilityCompat(
            input.visibility,
            resolved.assigneeUserId,
            resolved.createdByUserId ?? ctx.userId,
          );
        }

        // Promoting a task to public while a private agent is its assignee
        // breaks the visibility invariant. Reject early — the user should
        // reassign first, then promote.
        if (input.visibility === 'public' && resolved.assigneeAgentId) {
          const agentVisibility = await ctx.agentModel.getAgentVisibility(resolved.assigneeAgentId);
          ctx.taskService.assertAgentVisibilityCompat(input.visibility, agentVisibility);
        }

        // Promoting a subtask to public while its parent is still private
        // would orphan the child in the workspace view — a subtask cannot
        // be more public than its parent. The user must promote the parent
        // chain first, or keep the subtask private.
        if (input.visibility === 'public' && resolved.parentTaskId) {
          const parent = await ctx.taskModel.findById(resolved.parentTaskId);
          ctx.taskService.assertParentVisibilityCompat(input.visibility, parent?.visibility);
        }

        const updated = await ctx.taskModel.updateVisibility(resolved.id, input.visibility, {
          source: 'user',
        });
        if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
        return { data: updated, message: 'Task visibility updated', success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof TaskDependencyError) {
          throw new TRPCError({ cause: error, code: error.code, message: error.message });
        }
        console.error('[task:updateVisibility]', error);
        throw new TRPCError({
          cause: error,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update task visibility',
        });
      }
    }),

  acquireTaskLock: taskProcedureWrite.input(idInput).mutation(async ({ ctx, input }) => {
    if (!ctx.workspaceId) return { expiresAt: null, holderId: null, lockedByOther: false };
    const resolved = await resolveOrThrow(ctx.taskModel, input.id);
    const prev = await ctx.editLockService.getActiveHolder('task', resolved.id);
    const result = await ctx.editLockService.acquire('task', resolved.id);
    if ((result.holderId ?? null) !== (prev ?? null)) {
      void publishResourceEvent(
        { id: resolved.id, type: 'task' },
        { actorId: ctx.userId, data: { holderId: result.holderId }, type: 'lock.changed' },
      );
    }
    return result;
  }),

  getTaskLock: taskProcedureWrite.input(idInput).query(async ({ ctx, input }) => {
    if (!ctx.workspaceId) return { expiresAt: null, holderId: null, lockedByOther: false };
    const resolved = await resolveOrThrow(ctx.taskModel, input.id);
    const holder = await ctx.editLockService.getActiveHolder('task', resolved.id);
    return {
      expiresAt: null,
      holderId: holder ?? null,
      lockedByOther: Boolean(holder) && holder !== ctx.userId,
    };
  }),

  releaseTaskLock: taskProcedureWrite.input(idInput).mutation(async ({ ctx, input }) => {
    if (!ctx.workspaceId) return;
    const resolved = await resolveOrThrow(ctx.taskModel, input.id);
    // Only broadcast "unlocked" when we actually released our own lock — if the
    // lease expired and another member took over, the lock is still held.
    const released = await ctx.editLockService.release('task', resolved.id);
    if (!released) return;
    void publishResourceEvent(
      { id: resolved.id, type: 'task' },
      { actorId: ctx.userId, data: { holderId: null }, type: 'lock.changed' },
    );
  }),

  updateConfig: taskProcedureWrite
    .input(idInput.merge(z.object({ config: z.record(z.string(), z.unknown()) })))
    .mutation(async ({ input, ctx }) => {
      const { id, config } = input;
      try {
        const model = ctx.taskModel;
        const resolved = await resolveOrThrow(model, id);
        const task = await model.updateTaskConfig(resolved.id, config, { invalidateRun: true });
        if (!task) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
        return { data: task, message: 'Config updated', success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof TaskDependencyError) {
          throw new TRPCError({ cause: error, code: error.code, message: error.message });
        }
        console.error('[task:updateConfig]', error);
        throw new TRPCError({
          cause: error,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update task config',
        });
      }
    }),

  previewSubtaskLayers: taskProcedure.input(idInput).query(async ({ input, ctx }) => {
    try {
      const plan = await ctx.taskService.previewSubtaskLayers(input.id);
      return { data: plan, success: true };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      console.error('[task:previewSubtaskLayers]', error);
      throw new TRPCError({
        cause: error,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to plan subtask layers',
      });
    }
  }),

  runReadySubtasks: taskProcedureWrite
    .input(
      idInput.merge(
        z.object({
          /** One client-generated identity for this manual "run all" action. */
          requestId: z.string().min(1).max(255).optional(),
        }),
      ),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await ctx.taskService.runReadySubtasks(input.id, input.requestId);
        return { data: result, success: result.failed.length === 0 };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error('[task:runReadySubtasks]', error);
        throw new TRPCError({
          cause: error,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to run subtasks',
        });
      }
    }),

  updateStatus: taskProcedureWrite
    .input(
      z.object({
        actorAgentId: z.string().optional(),
        error: z.string().optional(),
        id: z.string(),
        status: z.enum(TASK_STATUSES),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { actorAgentId, ...statusInput } = input;
      try {
        // A person (or their agent) changed it: record who. System
        // transitions call the service without an actor and stay silent.
        const actor = await resolveActivityActor(ctx, actorAgentId);
        const result = await ctx.taskService.updateStatus(statusInput, actor);
        const { task, unlocked, paused, checkpointTriggered, allSubtasksDone, parentTaskId } =
          result;
        return {
          data: task,
          message: `Task ${input.status}`,
          success: true,
          ...(unlocked.length > 0 && { unlocked }),
          ...(paused.length > 0 && { paused }),
          ...(checkpointTriggered && { checkpointTriggered: true }),
          ...(allSubtasksDone && { allSubtasksDone: true, parentTaskId }),
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof TaskDependencyError) {
          throw new TRPCError({ cause: error, code: error.code, message: error.message });
        }
        console.error('[task:updateStatus]', error);
        throw new TRPCError({
          cause: error,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update status',
        });
      }
    }),

  updateStatusCascade: taskProcedureWrite
    .input(
      z.object({
        /** Kanban drop anchors — same contract as `task.update`. */
        afterId: z.string().nullish(),
        beforeId: z.string().nullish(),
        id: z.string(),
        /** Dropped column's membership scope — see `update`. */
        moveScope: z
          .object({
            assigneeAgentId: z.string().nullish(),
            assigneeUserId: z.string().nullish(),
            priority: z.number().min(0).max(4).optional(),
            statuses: z.array(z.enum(TASK_STATUSES)).max(10).optional(),
          })
          .optional(),
        /** Explicit ordering key fallback; anchors take precedence. */
        position: z.number().optional(),
        status: z.enum(['canceled', 'completed']),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { afterId, beforeId, moveScope, position } = input;
      try {
        // Resolve once so the anchor computation can exclude the moving task —
        // the service re-resolves inside its own transaction anyway.
        const resolved = await resolveOrThrow(ctx.taskModel, input.id);
        // Compute the drop position up-front so it rides the cascade's single
        // transaction — status and position commit or fail together.
        const movePosition =
          beforeId || afterId
            ? await ctx.taskModel.computeMovePosition(
                { afterId, beforeId },
                moveScope ?? undefined,
                resolved.id,
              )
            : null;
        const result = await ctx.taskService.updateStatusCascade(
          {
            id: input.id,
            position: movePosition ?? position,
            status: input.status,
          },
          await resolveActivityActor(ctx),
        );
        return { data: result, message: `Task family ${input.status}`, success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof TaskDependencyError) {
          throw new TRPCError({ cause: error, code: error.code, message: error.message });
        }
        console.error('[task:updateStatusCascade]', error);
        throw new TRPCError({
          cause: error,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update task family status',
        });
      }
    }),

  // Cross-workspace task *transfer* is intentionally not supported anymore:
  // moving a task drags its whole subtree plus history (dependencies,
  // documents, comments) out of the workspace. Use `copyTaskToWorkspace`,
  // which clones the task definition only. The procedure is kept as a
  // compatibility stub so already-released clients get a stable business
  // error instead of a procedure-not-found failure.
  transferTask: taskProcedureWrite
    .input(
      z.object({
        targetVisibility: z.enum(['private', 'public']).optional(),
        targetWorkspaceId: z.string().nullable(),
        taskId: z.string(),
      }),
    )
    .mutation(async () => {
      throw new TRPCError({
        cause: { data: { code: TransferErrorCode.TransferNotSupported } },
        code: 'PRECONDITION_FAILED',
        message: 'Task transfer is no longer supported; use copyTaskToWorkspace instead',
      });
    }),

  copyTaskToWorkspace: taskProcedureWrite
    .input(
      z.object({
        targetVisibility: z.enum(['private', 'public']).optional(),
        targetWorkspaceId: z.string().nullable(),
        taskId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.taskModel.resolve(input.taskId);
      if (!task)
        throw new TRPCError({
          cause: { data: { code: TransferErrorCode.ResourceNotFound } },
          code: 'NOT_FOUND',
          message: 'Task not found',
        });

      // No source-side creator gate: copy is non-destructive and clones the
      // task definition only, so any member who can resolve the task (the
      // visibility-aware `resolve` above already hides others' private tasks)
      // may copy it.
      if (input.targetWorkspaceId) {
        const canWriteTarget = await hasWorkspaceScopedPermission({
          action: 'AGENT_UPDATE',
          db: ctx.serverDB,
          userId: ctx.userId,
          workspaceId: input.targetWorkspaceId,
        });
        if (!canWriteTarget) {
          throw new TRPCError({
            cause: { data: { code: TransferErrorCode.TargetNoWriteAccess } },
            code: 'FORBIDDEN',
            message: 'No write access to target workspace',
          });
        }
      }

      return ctx.taskModel.copyToWorkspace(
        task.id,
        input.targetWorkspaceId,
        ctx.userId,
        input.targetVisibility,
      );
    }),

  // ---------------------------------------------------------------------
  // Agent delegation + multi-user task inputs (teammates collaboration)
  // ---------------------------------------------------------------------

  // Server-authoritative input queue: the author is always the caller, the
  // sequence is allocated per task inside the write transaction, and a replayed
  // idempotency key returns the original row instead of appending a twin.
  submitTaskInput: taskProcedureWrite
    .input(
      z.object({
        baseTaskVersion: z.number().int().optional(),
        idempotencyKey: z.string().min(1).max(255),
        intentType: z.enum(TASK_INPUT_INTENT_TYPES),
        payload: z.record(z.string(), z.unknown()),
        taskId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const task = await resolveOrThrow(ctx.taskModel, input.taskId);

      if (input.intentType === 'instruction') {
        await assertTaskSteeringCapability(
          { serverDB: ctx.serverDB, userId: ctx.userId, workspaceId: ctx.workspaceId ?? undefined },
          task,
        );
      }

      return ctx.taskInputs.submit({
        baseTaskVersion: input.baseTaskVersion,
        idempotencyKey: input.idempotencyKey,
        intentType: input.intentType,
        payload: input.payload,
        taskId: task.id,
      });
    }),

  listTaskInputs: taskProcedure
    .input(
      z.object({
        status: z.enum(TASK_INPUT_STATUSES).optional(),
        taskId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const task = await resolveOrThrow(ctx.taskModel, input.taskId);
      return ctx.taskInputs.list({ status: input.status, taskId: task.id });
    }),

  // Delegating an agent onto a task consumes the caller's run capability (the
  // `agent:update` gate on taskProcedureWrite) plus the same usable-agent
  // predicate every other agent binding goes through.
  delegateAgent: taskProcedureWrite
    .input(
      z.object({
        agentId: z.string(),
        allowedActions: z.array(z.enum(DELEGATION_ACTIONS)).max(32).optional(),
        expiresAt: z.coerce.date().optional(),
        taskId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const task = await resolveOrThrow(ctx.taskModel, input.taskId);
      if (!task.workspaceId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Agent delegation requires a workspace task',
        });
      }

      await assertAgentUsableBy(ctx.serverDB, input.agentId, {
        userId: ctx.userId,
        workspaceId: task.workspaceId,
      });

      return ctx.delegation.createGrant({
        agentId: input.agentId,
        allowedActions: input.allowedActions,
        expiresAt: input.expiresAt,
        task: { id: task.id, projectId: task.projectId, workspaceId: task.workspaceId },
      });
    }),

  revokeDelegation: taskProcedureWrite
    .input(z.object({ grantId: z.string() }))
    .mutation(async ({ input, ctx }) => ctx.delegation.revokeGrant(input.grantId)),

  // Approvals live on taskProcedure (not Write): the decider is bound by the
  // recorded approver or a workspace-admin role, not by generic task-write
  // permission — an approver who is a viewer must still be able to reject.
  approveAction: taskProcedure
    .input(
      z.object({
        approvalId: z.string(),
        baseSha: z.string().optional(),
        baseVersion: z.number().int().optional(),
        decision: z.enum(['approved', 'rejected']),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.workspaceId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'workspaceId is required' });
      }
      const role = await getActiveWorkspaceMembershipRole(ctx.serverDB, {
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      });

      return ctx.approvals.decide({
        approvalId: input.approvalId,
        baseSha: input.baseSha,
        baseVersion: input.baseVersion,
        callerIsWorkspaceAdmin: role === 'owner' || role === 'admin',
        decision: input.decision,
      });
    }),
});
