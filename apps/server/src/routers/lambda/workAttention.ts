import {
  ACTION_SOURCE_KINDS,
  type MyWorkMode,
  type TaskStatus,
  type TaskWorkflowCategory,
  WORK_QUERY_STATUS_COLUMNS,
  WORK_QUERY_WORKFLOW_COLUMNS,
  type WorkQuery,
  type WorkQueryFilter,
  type WorkQueryPredicate,
} from '@orvilo/types';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { withScopedPermission } from '@/business/server/trpc-middlewares/rbacPermission';
import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { NavigationFavoriteModel } from '@/database/models/navigationFavorite';
import { NotificationModel } from '@/database/models/notification';
import { SavedViewConflictError, SavedViewModel } from '@/database/models/savedView';
import { TaskModel, TaskRevisionConflictError } from '@/database/models/task';
import { TaskDependencyError } from '@/database/models/taskDependency';
import { TaskSubscriptionModel } from '@/database/models/taskSubscription';
import { TeamModel } from '@/database/models/team';
import {
  applyWorkQueryLayout,
  myWorkQueryForMode,
  WorkQueryError,
  WorkQueryModel,
} from '@/database/models/workQuery';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { ActionSourceRegistry, mapFeedWithLiveActions } from '@/server/services/workAttention';

const workQueryPredicateSchema: z.ZodType<WorkQueryPredicate> = z.object({
  field: z.enum([
    'assigneeUserId',
    'createdByUserId',
    'cycleId',
    'delegatedByUserId',
    'id',
    'priority',
    'projectId',
    'reviewerUserId',
    'status',
    'teamId',
    'triageStatus',
    'workflowCategory',
  ]),
  op: z.enum(['eq', 'in', 'isNotNull', 'isNull', 'neq', 'notIn']),
  value: z
    .union([
      z.object({ ref: z.literal('currentUser') }),
      z.array(z.string()),
      z.boolean(),
      z.null(),
      z.number(),
      z.string(),
    ])
    .optional(),
});

const workQueryFilterSchema: z.ZodType<WorkQueryFilter> = z.lazy(() =>
  z.object({
    all: z.array(z.union([workQueryFilterSchema, workQueryPredicateSchema])).optional(),
    any: z.array(z.union([workQueryFilterSchema, workQueryPredicateSchema])).optional(),
  }),
);

const workQuerySchema: z.ZodType<WorkQuery> = z.object({
  entityType: z.enum(['project', 'task']),
  filter: workQueryFilterSchema.optional(),
  groupBy: z.enum(['none', 'status', 'workflowCategory']).optional(),
  layout: z.enum(['board', 'list']).optional(),
  schemaVersion: z.literal(1),
  sort: z
    .array(
      z.object({
        direction: z.enum(['asc', 'desc']),
        field: z.enum([
          'assigneeUserId',
          'createdByUserId',
          'cycleId',
          'delegatedByUserId',
          'id',
          'priority',
          'projectId',
          'reviewerUserId',
          'status',
          'teamId',
          'triageStatus',
          'updatedAt',
          'workflowCategory',
        ]),
      }),
    )
    .optional(),
});

const mapQueryError = (error: unknown): never => {
  if (error instanceof WorkQueryError) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: error.code === 'CURSOR_INVALID' ? error.code : error.message,
    });
  }
  throw error;
};

const workAttentionProcedure = wsCompatProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;
  const workspaceId = ctx.workspaceId ?? undefined;
  const role = ctx.workspaceRole;
  return opts.next({
    ctx: {
      actionSources: new ActionSourceRegistry(
        ctx.serverDB,
        ctx.userId,
        workspaceId,
        role === 'owner' || role === 'admin',
      ),
      favoriteModel: new NavigationFavoriteModel(ctx.serverDB, ctx.userId, ctx.workspaceId ?? null),
      notificationModel: new NotificationModel(ctx.serverDB, ctx.userId, {
        workspaceId: ctx.workspaceId ?? null,
      }),
      savedViewModel: new SavedViewModel(ctx.serverDB, ctx.userId, workspaceId),
      subscriptionModel: new TaskSubscriptionModel(ctx.serverDB, ctx.userId, workspaceId),
      taskModel: new TaskModel(ctx.serverDB, ctx.userId, workspaceId),
      teamModel: workspaceId ? new TeamModel(ctx.serverDB, ctx.userId, workspaceId) : undefined,
      workQueryModel: new WorkQueryModel(ctx.serverDB, ctx.userId, workspaceId),
    },
  });
});

const organizeProcedure = workAttentionProcedure.use(withScopedPermission('notification:organize'));
const taskWriteProcedure = workAttentionProcedure.use(withScopedPermission('agent:update'));

export const workAttentionRouter = router({
  decide: organizeProcedure
    .input(
      z.object({
        actionRef: z.object({
          executionGeneration: z.number().int().nullable().optional(),
          kind: z.enum(ACTION_SOURCE_KINDS),
          requestId: z.string().min(1),
          sourceRevision: z.union([z.number(), z.string()]).nullable().optional(),
        }),
        decision: z.enum(['approve', 'cancel', 'decline', 'reject', 'submit_input']),
        expectedExecutionGeneration: z.number().int().nullable().optional(),
        expectedSourceRevision: z.union([z.number(), z.string()]).nullable().optional(),
        idempotencyKey: z.string().min(1),
        inputPayload: z.record(z.string(), z.unknown()).optional(),
        paramsHash: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const receipt = await ctx.actionSources.decide(input);
        if (
          receipt.status === 'already_decided' ||
          receipt.status === 'source_accepted' ||
          receipt.status === 'source_confirmed' ||
          receipt.status === 'source_rejected'
        ) {
          await ctx.notificationModel.resolveAction(input.actionRef.requestId);
        }
        return { data: receipt, success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error('[workAttention:decide]', error);
        throw new TRPCError({
          cause: error,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to apply the decision',
        });
      }
    }),

  favoriteList: workAttentionProcedure.query(async ({ ctx }) => {
    return { data: await ctx.favoriteModel.list(), success: true };
  }),

  favoritePin: organizeProcedure
    .input(
      z.object({
        rank: z.number().int().optional(),
        targetId: z.string().min(1),
        targetType: z.enum(['project', 'savedView', 'task', 'team']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.favoriteModel.pin(input);
      return { data: row, message: 'Pinned', success: true };
    }),

  favoriteUnpin: organizeProcedure
    .input(
      z.object({
        targetId: z.string().min(1),
        targetType: z.enum(['project', 'savedView', 'task', 'team']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.favoriteModel.unpin(input);
      return { message: 'Unpinned', success: true };
    }),

  feed: workAttentionProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        filter: z.enum(['all', 'archived', 'mentions', 'snoozed', 'unread']).optional(),
        kind: z.enum(['action', 'update']).optional(),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const pending = await ctx.actionSources.listPendingForActor();
      await ctx.notificationModel.ensureActionCards(pending);
      const rows = await ctx.notificationModel.listFeed(input);
      return { data: mapFeedWithLiveActions(rows, pending), success: true };
    }),

  feedSummary: workAttentionProcedure.query(async ({ ctx }) => {
    return { data: await ctx.actionSources.summarizeFeed(ctx.notificationModel), success: true };
  }),

  myWork: workAttentionProcedure
    .input(
      z.object({
        afterId: z.string().min(1).optional(),
        groupBy: z.enum(['none', 'status', 'workflowCategory']).optional(),
        groupKey: z.string().min(1).optional(),
        layout: z.enum(['board', 'list']).optional(),
        limit: z.number().min(1).max(100).default(50),
        mode: z.enum(['assigned', 'created', 'delegated', 'review', 'subscribed']),
        queryHash: z.string().min(1).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const query = applyWorkQueryLayout(
          myWorkQueryForMode(input.mode as MyWorkMode),
          input.layout,
          input.groupBy,
        );
        const result = await ctx.workQueryModel.queryTasks({
          afterId: input.afterId,
          groupKey: input.groupKey,
          limit: input.limit,
          mode: input.mode,
          query,
          queryHash: input.queryHash,
        });
        const subscribedTaskIds = await ctx.subscriptionModel.listActiveForTaskIds(
          result.tasks.map((task) => task.id),
        );
        const externalReviews =
          input.mode === 'review' ? await ctx.workQueryModel.queryExternalReviews() : [];
        return { data: { ...result, externalReviews, subscribedTaskIds }, success: true };
      } catch (error) {
        return mapQueryError(error);
      }
    }),

  query: workAttentionProcedure
    .input(
      z.object({
        afterId: z.string().min(1).optional(),
        groupKey: z.string().min(1).optional(),
        limit: z.number().min(1).max(100).default(50),
        query: workQuerySchema,
        queryHash: z.string().min(1).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        if (input.query.entityType === 'project') {
          const result = await ctx.workQueryModel.queryProjects({
            limit: input.limit,
            query: input.query,
          });
          return { data: result, success: true };
        }
        const result = await ctx.workQueryModel.queryTasks({
          afterId: input.afterId,
          groupKey: input.groupKey,
          limit: input.limit,
          query: input.query,
          queryHash: input.queryHash,
        });
        return { data: result, success: true };
      } catch (error) {
        return mapQueryError(error);
      }
    }),

  savedViewCreate: taskWriteProcedure
    .input(
      z.object({
        displayOptions: z.record(z.string(), z.unknown()).optional(),
        entityType: z.enum(['project', 'task']),
        layout: z.enum(['board', 'list']).optional(),
        name: z.string().trim().min(1).max(255),
        query: workQuerySchema,
        teamId: z.string().nullable().optional(),
        visibility: z.enum(['private', 'team', 'workspace']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const row = await ctx.savedViewModel.create(input);
        return { data: row, message: 'View saved', success: true };
      } catch (error) {
        return mapQueryError(error);
      }
    }),

  savedViewDelete: taskWriteProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await ctx.savedViewModel.delete(input.id);
      if (!deleted) throw new TRPCError({ code: 'NOT_FOUND', message: 'View not found' });
      return { message: 'View deleted', success: true };
    }),

  savedViewEvaluate: workAttentionProcedure
    .input(
      z.object({
        afterId: z.string().min(1).optional(),
        groupKey: z.string().min(1).optional(),
        id: z.string().min(1),
        limit: z.number().min(1).max(100).default(50),
        queryHash: z.string().min(1).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const view = await ctx.savedViewModel.findById(input.id);
      if (!view) throw new TRPCError({ code: 'NOT_FOUND', message: 'View not found' });
      try {
        const evaluation = await ctx.savedViewModel.evaluate(view, {
          afterId: input.afterId,
          groupKey: input.groupKey,
          limit: input.limit,
          queryHash: input.queryHash,
        });
        return {
          data: { evaluation, view: await ctx.savedViewModel.present(view) },
          success: true,
        };
      } catch (error) {
        return mapQueryError(error);
      }
    }),

  savedViewGet: workAttentionProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const view = await ctx.savedViewModel.findById(input.id);
      if (!view) throw new TRPCError({ code: 'NOT_FOUND', message: 'View not found' });
      return { data: await ctx.savedViewModel.present(view), success: true };
    }),

  savedViewList: workAttentionProcedure.query(async ({ ctx }) => {
    const rows = await ctx.savedViewModel.list();
    return {
      data: await Promise.all(rows.map((row) => ctx.savedViewModel.present(row))),
      success: true,
    };
  }),

  savedViewUpdate: taskWriteProcedure
    .input(
      z.object({
        displayOptions: z.record(z.string(), z.unknown()).optional(),
        expectedDefinitionVersion: z.number().int().min(1),
        id: z.string().min(1),
        layout: z.enum(['board', 'list']).optional(),
        name: z.string().trim().min(1).max(255).optional(),
        query: workQuerySchema.optional(),
        teamId: z.string().nullable().optional(),
        visibility: z.enum(['private', 'team', 'workspace']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input;
      if (patch.visibility === 'team' && !patch.teamId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'team visibility requires teamId' });
      }
      try {
        const row = await ctx.savedViewModel.update(id, {
          ...patch,
          ...(patch.visibility && patch.visibility !== 'team' ? { teamId: null } : {}),
        });
        if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'View not found' });
        return { data: row, message: 'View updated', success: true };
      } catch (error) {
        if (error instanceof SavedViewConflictError) {
          throw new TRPCError({ code: 'CONFLICT', message: error.message });
        }
        return mapQueryError(error);
      }
    }),

  subscribe: organizeProcedure
    .input(z.object({ taskId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.taskModel.findById(input.taskId);
      if (!task) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
      const row = await ctx.subscriptionModel.subscribe(input.taskId);
      return { data: row, message: 'Subscribed', success: true };
    }),

  moveBoard: taskWriteProcedure
    .input(
      z.object({
        expectedDomainRevision: z.number().int().min(1),
        groupBy: z.enum(['status', 'workflowCategory']),
        targetKey: z.string().min(1),
        taskId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.taskModel.findById(input.taskId);
      if (!task) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
      if (input.groupBy === 'workflowCategory') {
        if (!(WORK_QUERY_WORKFLOW_COLUMNS as readonly string[]).includes(input.targetKey)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown workflow column' });
        }
        if (task.workflowStateId) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Business workflow moves require a linked Linear issue',
          });
        }
      } else if (!(WORK_QUERY_STATUS_COLUMNS as readonly string[]).includes(input.targetKey)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown status column' });
      }
      const patch =
        input.groupBy === 'workflowCategory'
          ? { workflowCategory: input.targetKey as TaskWorkflowCategory }
          : { status: input.targetKey as TaskStatus };
      try {
        const updated = await ctx.taskModel.update(input.taskId, patch, {
          expectedDomainRevision: input.expectedDomainRevision,
          source: 'user',
        });
        return { data: updated, message: 'Moved', success: true };
      } catch (error) {
        if (error instanceof TaskRevisionConflictError) {
          throw new TRPCError({ code: 'CONFLICT', message: error.message });
        }
        if (error instanceof TaskDependencyError) {
          throw new TRPCError({
            cause: error,
            code: error.code,
            message: error.message,
          });
        }
        throw error;
      }
    }),

  triage: taskWriteProcedure
    .input(
      z.object({
        action: z.enum(['accept', 'decline', 'duplicate', 'reassign']),
        assigneeUserId: z.string().min(1).optional(),
        canonicalTaskId: z.string().min(1).optional(),
        expectedDomainRevision: z.number().int().min(1),
        taskId: z.string().min(1),
        teamId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.teamModel) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'workspace required' });
      }
      if (!(await ctx.teamModel.hasWriteAccess(input.teamId))) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Team write access required' });
      }
      const task = await ctx.taskModel.findById(input.taskId);
      if (!task || task.teamId !== input.teamId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
      }
      if (input.action === 'reassign') {
        if (!input.assigneeUserId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'reassign requires assigneeUserId' });
        }
        const members = await ctx.teamModel.listMembers(input.teamId);
        if (!members.some((member) => member.userId === input.assigneeUserId)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'assignee must be a team member' });
        }
      }
      if (input.action === 'duplicate') {
        if (!input.canonicalTaskId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'duplicate requires canonicalTaskId',
          });
        }
        if (input.canonicalTaskId === input.taskId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'canonical task cannot be itself' });
        }
        const canonical = await ctx.taskModel.findById(input.canonicalTaskId);
        if (!canonical) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Canonical task not found' });
        }
        if (canonical.duplicateOfTaskId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'canonical task is already a duplicate',
          });
        }
      }
      const triageStatus =
        input.action === 'accept'
          ? 'accepted'
          : input.action === 'decline'
            ? 'declined'
            : input.action === 'duplicate'
              ? 'duplicate'
              : 'accepted';
      try {
        const updated = await ctx.taskModel.update(
          input.taskId,
          {
            triageStatus,
            ...(input.action === 'duplicate' && input.canonicalTaskId
              ? { duplicateOfTaskId: input.canonicalTaskId }
              : {}),
            ...(input.action === 'reassign' && input.assigneeUserId
              ? { assigneeUserId: input.assigneeUserId }
              : {}),
          },
          { expectedDomainRevision: input.expectedDomainRevision, source: 'user' },
        );
        return { data: updated, message: 'Triage updated', success: true };
      } catch (error) {
        if (error instanceof TaskRevisionConflictError) {
          throw new TRPCError({ code: 'CONFLICT', message: error.message });
        }
        throw error;
      }
    }),

  unsubscribe: organizeProcedure
    .input(z.object({ taskId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.taskModel.findById(input.taskId);
      if (!task) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
      await ctx.subscriptionModel.unsubscribe(input.taskId);
      return { message: 'Unsubscribed', success: true };
    }),
});

export type WorkAttentionRouter = typeof workAttentionRouter;
