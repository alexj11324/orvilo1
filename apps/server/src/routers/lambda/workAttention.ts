import {
  ACTION_SOURCE_KINDS,
  applyDelegatedFilter,
  applyNoProjectFilter,
  type MyWorkMode,
  type TaskStatus,
  type TaskWorkflowCategory,
  WORK_QUERY_FACET_FIELDS,
  WORK_QUERY_MAX_IN_VALUES,
  WORK_QUERY_STATUS_COLUMNS,
  WORK_QUERY_WORKFLOW_COLUMNS,
  WORK_SEARCH_MAX_PER_TYPE,
  WORKFLOW_STATE_REQUIRED,
  type WorkQuery,
  type WorkQueryFilter,
  type WorkQueryPredicate,
} from '@orvilo/types';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { withScopedPermission } from '@/business/server/trpc-middlewares/rbacPermission';
import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import {
  NavigationFavoriteConflictError,
  NavigationFavoriteModel,
} from '@/database/models/navigationFavorite';
import { NotificationModel } from '@/database/models/notification';
import { ProjectModel } from '@/database/models/project';
import {
  SavedViewBuiltinError,
  SavedViewConflictError,
  SavedViewModel,
  SavedViewTeamError,
} from '@/database/models/savedView';
import { TaskModel, TaskRevisionConflictError } from '@/database/models/task';
import { TaskDependencyError } from '@/database/models/taskDependency';
import { TaskSubscriptionModel } from '@/database/models/taskSubscription';
import { TeamModel } from '@/database/models/team';
import { resolveWorkflowMove } from '@/database/models/workflowMove';
import {
  applyWorkQueryLayout,
  myWorkQueryForMode,
  WorkQueryError,
  WorkQueryModel,
} from '@/database/models/workQuery';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { ActionSourceRegistry, buildInboxFeed } from '@/server/services/workAttention';

// Predicate-first: a predicate object would also satisfy the filter object
// (all/any are both optional), so the union must try predicates first and the
// filter object must be strict, otherwise predicates collapse into empty
// filters and unknown fields are silently stripped.
const workQueryPredicateSchema: z.ZodType<WorkQueryPredicate> = z.strictObject({
  field: z.enum([
    'assigneeUserId',
    'createdByUserId',
    'cycleId',
    'delegatedByUserId',
    'id',
    'ownerUserId',
    'priority',
    'projectId',
    'reviewerUserId',
    'status',
    'teamId',
    'triageStatus',
    'visibility',
    'workflowCategory',
  ]),
  op: z.enum(['eq', 'in', 'isNotNull', 'isNull', 'neq', 'notIn']),
  value: z
    .union([
      z.object({ ref: z.literal('currentUser') }),
      z.array(z.string().min(1)).min(1).max(WORK_QUERY_MAX_IN_VALUES),
      z.boolean(),
      z.null(),
      z.number(),
      z.string(),
    ])
    .optional(),
});

// `strictObject` — a node carrying foreign keys (e.g. a predicate whose field
// failed the enum) must not fall back to the all-optional filter shape and get
// key-stripped into a silent `{}` node.
const workQueryFilterSchema: z.ZodType<WorkQueryFilter> = z.lazy(() =>
  z.strictObject({
    all: z.array(workQueryNodeSchema).optional(),
    any: z.array(workQueryNodeSchema).optional(),
  }),
);

// Predicate must be tried before the all-optional filter object — otherwise
// zod's default key-stripping reduces every predicate node to `{}` on save.
const workQueryNodeSchema: z.ZodType<WorkQueryFilter | WorkQueryPredicate> = z.lazy(() =>
  z.union([workQueryPredicateSchema, workQueryFilterSchema]),
);

export const workQuerySchema: z.ZodType<WorkQuery> = z.object({
  entityType: z.enum(['project', 'task']),
  filter: workQueryFilterSchema.optional(),
  groupBy: z.enum(['attention', 'none', 'status', 'workflowCategory']).optional(),
  layout: z.enum(['board', 'list']).optional(),
  schemaVersion: z.literal(1),
  sort: z
    .array(
      z.object({
        direction: z.enum(['asc', 'desc']),
        field: z.enum([
          'assigneeUserId',
          'createdAt',
          'createdByUserId',
          'cycleId',
          'delegatedByUserId',
          'id',
          'name',
          'ownerUserId',
          'priority',
          'projectId',
          'reviewerUserId',
          'status',
          'teamId',
          'triageStatus',
          'updatedAt',
          'visibility',
          'workflowCategory',
        ]),
      }),
    )
    .optional(),
  sortMode: z.enum(['field', 'manual']).optional(),
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
      projectModel: new ProjectModel(ctx.serverDB, ctx.userId, workspaceId),
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

const searchRelevance = (query: string, title: string) => {
  const needle = query.trim().toLowerCase();
  const haystack = title.toLowerCase();
  if (haystack === needle) return 1;
  if (haystack.startsWith(needle)) return 2;
  return 3;
};

export const workAttentionRouter = router({
  // Source-authorized human decisions. Organize is inbox housekeeping, not
  // approve. getAuthorized still FORBIDDEN when the caller is not the actor.
  decide: workAttentionProcedure
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

  favoriteReorder: organizeProcedure
    .input(
      z.object({
        items: z
          .array(
            z.object({
              expectedVersion: z.number().int().min(1),
              rank: z.number().int(),
              targetId: z.string().min(1),
              targetType: z.enum(['project', 'savedView', 'task', 'team']),
            }),
          )
          .min(1)
          .max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const rows = await ctx.favoriteModel.reorder(input);
        return { data: rows, message: 'Reordered', success: true };
      } catch (error) {
        if (error instanceof NavigationFavoriteConflictError) {
          throw new TRPCError({ code: 'CONFLICT', message: error.message });
        }
        throw error;
      }
    }),

  feed: workAttentionProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        filter: z.enum(['all', 'archived', 'mentions', 'snoozed', 'unread']).optional(),
        kind: z.enum(['action', 'update', 'priority', 'other']).optional(),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      return {
        data: await buildInboxFeed({
          actionSources: ctx.actionSources,
          input,
          notificationModel: ctx.notificationModel,
          projectModel: ctx.projectModel,
          taskModel: ctx.taskModel,
        }),
        success: true,
      };
    }),

  feedSummary: workAttentionProcedure.query(async ({ ctx }) => {
    return { data: await ctx.actionSources.summarizeFeed(ctx.notificationModel), success: true };
  }),

  myWork: workAttentionProcedure
    .input(
      z.object({
        afterId: z.string().min(1).optional(),
        groupBy: z.enum(['attention', 'none', 'status', 'workflowCategory']).optional(),
        groupKey: z.string().min(1).optional(),
        layout: z.enum(['board', 'list']).optional(),
        limit: z.number().min(1).max(100).default(50),
        delegated: z.boolean().optional(),
        mode: z.enum(['activity', 'assigned', 'created', 'delegated', 'review', 'subscribed']),
        noProject: z.boolean().optional(),
        queryHash: z.string().min(1).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const query = applyNoProjectFilter(
          applyDelegatedFilter(
            applyWorkQueryLayout(
              myWorkQueryForMode(input.mode as MyWorkMode),
              input.layout,
              input.groupBy,
            ),
            Boolean(input.delegated),
          ),
          Boolean(input.noProject),
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

  /**
   * Reviews surface — `/reviews?tab=for-me|created`. 'for-me' returns tasks
   * awaiting my review plus non-task approvals addressed to me; 'created'
   * returns approvals I requested plus tasks I created that carry a reviewer.
   */
  reviews: workAttentionProcedure
    .input(
      z.object({
        afterId: z.string().min(1).optional(),
        groupKey: z.string().min(1).optional(),
        layout: z.enum(['board', 'list']).optional(),
        limit: z.number().min(1).max(100).default(50),
        queryHash: z.string().min(1).optional(),
        tab: z.enum(['created', 'for-me']).default('for-me'),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const me = { ref: 'currentUser' } as const;
        const filter: WorkQueryFilter =
          input.tab === 'for-me'
            ? { all: [{ field: 'reviewerUserId', op: 'eq', value: me }] }
            : {
                all: [
                  { field: 'createdByUserId', op: 'eq', value: me },
                  { field: 'reviewerUserId', op: 'isNotNull' },
                ],
              };
        const query = applyWorkQueryLayout(
          {
            entityType: 'task',
            filter,
            schemaVersion: 1,
            sort: [
              { direction: 'desc', field: 'updatedAt' },
              { direction: 'asc', field: 'id' },
            ],
          },
          input.layout,
        );
        const [result, externalReviews] = await Promise.all([
          ctx.workQueryModel.queryTasks({
            afterId: input.afterId,
            groupKey: input.groupKey,
            limit: input.limit,
            query,
            queryHash: input.queryHash,
          }),
          ctx.workQueryModel.queryExternalReviews(input.tab),
        ]);
        return { data: { ...result, externalReviews }, success: true };
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
            afterId: input.afterId,
            limit: input.limit,
            query: input.query,
            queryHash: input.queryHash,
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

  count: workAttentionProcedure
    .input(z.object({ query: workQuerySchema }))
    .query(async ({ ctx, input }) => {
      try {
        if (input.query.entityType === 'project') {
          const result = await ctx.workQueryModel.queryProjects({
            limit: 1,
            query: input.query,
          });
          return {
            data: { queryHash: result.queryHash, total: result.total },
            success: true,
          };
        }
        const result = await ctx.workQueryModel.countTasks({ query: input.query });
        return { data: result, success: true };
      } catch (error) {
        return mapQueryError(error);
      }
    }),

  facet: workAttentionProcedure
    .input(
      z.object({
        field: z.enum(WORK_QUERY_FACET_FIELDS),
        query: workQuerySchema,
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const result = await ctx.workQueryModel.facetTasks({
          field: input.field,
          query: input.query,
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
      if (input.visibility === 'team' && !input.teamId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'team visibility requires teamId' });
      }
      try {
        const row = await ctx.savedViewModel.create(input);
        return { data: row, message: 'View saved', success: true };
      } catch (error) {
        if (error instanceof SavedViewTeamError) {
          throw new TRPCError({ code: 'FORBIDDEN', message: error.message });
        }
        return mapQueryError(error);
      }
    }),

  savedViewDelete: taskWriteProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const deleted = await ctx.savedViewModel.delete(input.id);
        if (!deleted) throw new TRPCError({ code: 'NOT_FOUND', message: 'View not found' });
        return { message: 'View deleted', success: true };
      } catch (error) {
        if (error instanceof SavedViewBuiltinError) {
          throw new TRPCError({ code: 'FORBIDDEN', message: error.message });
        }
        throw error;
      }
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

  search: workAttentionProcedure
    .input(
      z.object({
        limitPerType: z.number().min(1).max(WORK_SEARCH_MAX_PER_TYPE).default(5),
        query: z.string().trim().min(1).max(200),
        type: z.enum(['project', 'savedView', 'task', 'team']).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const limit = input.limitPerType;
      const needle = input.query;
      const wants = (type: 'project' | 'savedView' | 'task' | 'team') =>
        !input.type || input.type === type;
      const matches = (value: string) => value.toLowerCase().includes(needle.toLowerCase());

      const [taskRows, projectRows, views, teams] = await Promise.all([
        wants('task') ? ctx.workQueryModel.searchTasks(needle, limit) : [],
        wants('project') ? ctx.workQueryModel.searchProjects(needle, limit) : [],
        wants('savedView') ? ctx.savedViewModel.list() : [],
        wants('team') && ctx.teamModel ? ctx.teamModel.listReadable() : [],
      ]);

      const items = [
        ...taskRows.map((row) => {
          const title = row.name || row.identifier;
          return {
            createdAt: row.createdAt,
            description: row.identifier,
            id: row.id,
            relevance: searchRelevance(needle, title),
            title,
            type: 'task' as const,
            updatedAt: row.updatedAt,
          };
        }),
        ...projectRows.map((row) => ({
          createdAt: row.createdAt,
          description: null,
          id: row.id,
          relevance: searchRelevance(needle, row.name),
          title: row.name,
          type: 'project' as const,
          updatedAt: row.updatedAt,
        })),
        ...views
          .filter((row) => matches(row.name) || matches(row.id))
          .slice(0, limit)
          .map((row) => ({
            createdAt: row.createdAt,
            description: null,
            id: row.id,
            relevance: searchRelevance(needle, row.name),
            title: row.name,
            type: 'savedView' as const,
            updatedAt: row.updatedAt,
          })),
        ...teams
          .filter((row) => matches(row.name) || matches(row.key))
          .slice(0, limit)
          .map((row) => ({
            createdAt: row.createdAt,
            description: row.key,
            id: row.id,
            relevance: searchRelevance(needle, row.name),
            title: row.name,
            type: 'team' as const,
            updatedAt: row.updatedAt,
          })),
      ];

      return { data: items, success: true };
    }),

  /**
   * Picker data for `projectId` filter rows: authorized server-side name
   * search with a keyset cursor, or `ids` to hydrate selected values that are
   * not on the loaded page. Same ACL as `query`/`search`.
   */
  projectOptions: workAttentionProcedure
    .input(
      z.object({
        afterId: z.string().min(1).optional(),
        ids: z.array(z.string().min(1)).min(1).max(50).optional(),
        limit: z.number().min(1).max(100).default(25),
        query: z.string().trim().max(200).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const result = await ctx.workQueryModel.searchProjectOptions({
          afterId: input.afterId,
          ids: input.ids,
          limit: input.limit,
          needle: input.query,
        });
        return { data: result, success: true };
      } catch (error) {
        return mapQueryError(error);
      }
    }),

  /**
   * Picker data for `cycleId` filter rows — one authorized query over the
   * caller's readable teams, optionally narrowed to the team already chosen
   * in the filter. `ids` hydrates selected values.
   */
  cycleOptions: workAttentionProcedure
    .input(
      z.object({
        ids: z.array(z.string().min(1)).min(1).max(50).optional(),
        limit: z.number().min(1).max(200).default(100),
        query: z.string().trim().max(200).optional(),
        teamId: z.string().min(1).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const items = await ctx.workQueryModel.listCycleOptions({
        ids: input.ids,
        limit: input.limit,
        needle: input.query,
        teamId: input.teamId,
      });
      return { data: items, success: true };
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
        if (error instanceof SavedViewBuiltinError) {
          throw new TRPCError({ code: 'FORBIDDEN', message: error.message });
        }
        if (error instanceof SavedViewTeamError) {
          throw new TRPCError({ code: 'FORBIDDEN', message: error.message });
        }
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
        targetWorkflowStateRefId: z.string().min(1).optional(),
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
      } else if (!(WORK_QUERY_STATUS_COLUMNS as readonly string[]).includes(input.targetKey)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown status column' });
      }

      let patch: {
        status?: TaskStatus;
        workflowCategory?: TaskWorkflowCategory;
        workflowStateId?: string | null;
        workflowStateRefId?: string | null;
      } =
        input.groupBy === 'workflowCategory'
          ? { workflowCategory: input.targetKey as TaskWorkflowCategory }
          : { status: input.targetKey as TaskStatus };

      if (input.groupBy === 'workflowCategory' && task.teamId && ctx.teamModel) {
        const resolved = resolveWorkflowMove({
          category: input.targetKey as TaskWorkflowCategory,
          states: await ctx.teamModel.listWorkflowStates(task.teamId),
          targetWorkflowStateRefId: input.targetWorkflowStateRefId,
        });
        if (resolved.type === 'required') {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: WORKFLOW_STATE_REQUIRED });
        }
        if (resolved.type === 'invalid') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown workflow state' });
        }
        if (resolved.type === 'exact') {
          patch = {
            workflowCategory: resolved.workflowCategory,
            workflowStateId: resolved.workflowStateId,
            workflowStateRefId: resolved.workflowStateRefId,
          };
        }
      } else if (input.targetWorkflowStateRefId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown workflow state' });
      }

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
      const triageTeam = await ctx.teamModel.findById(input.teamId);
      if (triageTeam?.orchestrationPolicy?.triageEnabled === false) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Triage intake is disabled for this team',
        });
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
