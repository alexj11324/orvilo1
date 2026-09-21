import { PROJECT_IDENTIFIER_REGEX, PROJECT_STATUSES, PROJECT_VISIBILITIES } from '@orvilo/types';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { withScopedPermission } from '@/business/server/trpc-middlewares/rbacPermission';
import {
  requireWorkspaceRoleWhenScoped,
  type WorkspaceRole,
  wsCompatProcedure,
} from '@/business/server/trpc-middlewares/workspaceAuth';
import { AgentModel } from '@/database/models/agent';
import { ProjectModel } from '@/database/models/project';
import { TaskModel } from '@/database/models/task';
import { UserModel } from '@/database/models/user';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';

const isWorkspaceAdmin = (ctx: unknown) => {
  const workspaceRole = (ctx as { workspaceRole?: WorkspaceRole }).workspaceRole;
  return workspaceRole === 'admin' || workspaceRole === 'owner';
};

const projectProcedure = wsCompatProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;
  return opts.next({
    ctx: {
      projectModel: new ProjectModel(ctx.serverDB, ctx.userId, ctx.workspaceId ?? undefined),
      projectPolicyModel: new ProjectModel(ctx.serverDB, ctx.userId, ctx.workspaceId ?? undefined, {
        canManageAll: isWorkspaceAdmin(ctx),
      }),
    },
  });
});

const projectWriteProcedure = projectProcedure.use(withScopedPermission('agent:update'));
const projectPolicyProcedure = projectProcedure
  .use(withScopedPermission('agent:update'))
  .use(requireWorkspaceRoleWhenScoped('admin'));
const idInput = z.object({ id: z.string() });
const PROJECT_SLUG_REGEX = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const projectIdentifierInput = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(PROJECT_IDENTIFIER_REGEX, 'Invalid project identifier'));
const projectSlugInput = z.string().max(100).regex(PROJECT_SLUG_REGEX, 'Invalid project slug');
const orchestrationPolicySchema = z.object({
  allowedAgentIds: z.array(z.string().min(1)).max(100).optional(),
  allowedRoles: z.array(z.string().trim().min(1)).max(100).optional(),
  autoDispatch: z.boolean(),
  concurrencyLimit: z.number().int().min(1).max(100).optional(),
  executionBudget: z
    .object({
      maxCost: z.number().min(0).max(100_000).optional(),
      maxRuns: z.number().int().min(1).max(1000).optional(),
    })
    .optional(),
  planningBudget: z
    .object({
      maxRevisions: z.number().int().min(1).max(1000).optional(),
    })
    .optional(),
  replanMode: z.enum(['disabled', 'observe', 'suggest', 'apply']),
  requireHumanReview: z.boolean(),
});

function requireResult<T>(result: T | null, message = 'Project not found'): T {
  if (!result) throw new TRPCError({ code: 'NOT_FOUND', message });
  return result;
}

function mapProjectError(error: unknown, operation: string): never {
  if (error instanceof TRPCError) throw error;
  const message = error instanceof Error ? error.message : `Failed to ${operation} project`;
  console.error(`[project:${operation}]`, error);
  throw new TRPCError({ cause: error, code: 'BAD_REQUEST', message });
}

export const projectRouter = router({
  /**
   * Linear parity — the project Activity tab: newest-first task field-change
   * feed for the project's issues (assignee/status/priority moves), with the
   * actor resolved so the row renders without a second fetch.
   */
  activityFeed: projectProcedure
    .input(
      idInput.extend({
        cursor: z.string().nullish(),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const project = requireResult(await ctx.projectModel.findByIdOrSlug(input.id));
        const taskModel = new TaskModel(ctx.serverDB, ctx.userId, ctx.workspaceId ?? undefined);
        const { items: rows, nextCursor } = await taskModel.getProjectActivities(
          project.id,
          input.limit,
          input.cursor ?? undefined,
        );

        const agentIds = new Set<string>();
        const userIds = new Set<string>();
        for (const row of rows) {
          if (row.activity.actorAgentId) agentIds.add(row.activity.actorAgentId);
          if (row.activity.actorUserId) userIds.add(row.activity.actorUserId);
          // Assignment events carry participant ids on both sides of the
          // change; resolve them so the row can name the new assignee.
          const type = row.activity.type;
          if (type === 'assignee_agent' || type === 'assignee_user' || type === 'reviewer') {
            const target = type === 'assignee_agent' ? agentIds : userIds;
            for (const id of [row.activity.payload?.fromId, row.activity.payload?.toId]) {
              if (id) target.add(id);
            }
          }
        }
        const [agentRows, userRows] = await Promise.all([
          agentIds.size
            ? new AgentModel(
                ctx.serverDB,
                ctx.userId,
                ctx.workspaceId ?? undefined,
              ).getAgentAvatarsByIds([...agentIds])
            : [],
          userIds.size ? UserModel.findByIds(ctx.serverDB, [...userIds]) : [],
        ]);
        const actors = new Map<
          string,
          { avatar?: string | null; id: string; name?: string | null; type: 'agent' | 'user' }
        >();
        for (const a of agentRows) {
          actors.set(a.id, { avatar: a.avatar, id: a.id, name: a.title || a.name, type: 'agent' });
        }
        for (const u of userRows) {
          actors.set(u.id, {
            avatar: u.avatar,
            id: u.id,
            name: u.fullName || u.username,
            type: 'user',
          });
        }

        return {
          data: {
            items: rows.map((row) => ({
              actor:
                (row.activity.actorAgentId && actors.get(row.activity.actorAgentId)) ||
                (row.activity.actorUserId && actors.get(row.activity.actorUserId)) ||
                undefined,
              createdAt: row.activity.createdAt.toISOString(),
              fromTarget:
                (row.activity.payload?.fromId && actors.get(row.activity.payload.fromId)) ||
                undefined,
              id: row.activity.id,
              payload: row.activity.payload,
              target:
                (row.activity.payload?.toId && actors.get(row.activity.payload.toId)) || undefined,
              taskId: row.taskId,
              taskIdentifier: row.taskIdentifier,
              taskTitle: row.taskTitle,
              type: row.activity.type,
            })),
            nextCursor: nextCursor ?? null,
          },
          success: true,
        };
      } catch (error) {
        mapProjectError(error, 'activityFeed');
      }
    }),

  acceptCompletion: projectWriteProcedure
    .input(idInput.extend({ comment: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return {
          data: requireResult(
            await ctx.projectModel.reviewCompletion(input.id, 'accepted', input.comment),
          ),
          message: 'Project completion accepted',
          success: true,
        };
      } catch (error) {
        mapProjectError(error, 'acceptCompletion');
      }
    }),

  addAgent: projectWriteProcedure
    .input(
      idInput.extend({
        agentId: z.string(),
        enabled: z.boolean().optional(),
        responsibility: z.string().nullish(),
        role: z.string().nullish(),
        sortOrder: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input: { id, ...input } }) => {
      try {
        return {
          data: requireResult(await ctx.projectModel.addAgent(id, input)),
          message: 'Agent added to project',
          success: true,
        };
      } catch (error) {
        mapProjectError(error, 'addAgent');
      }
    }),

  addKnowledgeBase: projectWriteProcedure
    .input(
      idInput.extend({
        enabled: z.boolean().optional(),
        knowledgeBaseId: z.string(),
        sortOrder: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input: { id, ...input } }) => {
      try {
        return {
          data: requireResult(await ctx.projectModel.addKnowledgeBase(id, input)),
          message: 'Knowledge base added to project',
          success: true,
        };
      } catch (error) {
        mapProjectError(error, 'addKnowledgeBase');
      }
    }),

  addWork: projectWriteProcedure
    .input(idInput.extend({ sortOrder: z.number().int().optional(), workId: z.string() }))
    .mutation(async ({ ctx, input: { id, ...input } }) => {
      try {
        return {
          data: requireResult(await ctx.projectModel.addWork(id, input)),
          message: 'Work added to project',
          success: true,
        };
      } catch (error) {
        mapProjectError(error, 'addWork');
      }
    }),

  create: projectWriteProcedure
    .input(
      z.object({
        avatar: z.string().optional(),
        description: z.string().optional(),
        identifier: projectIdentifierInput,
        name: z.string().min(1).max(255),
        slug: projectSlugInput.optional(),
        visibility: z.enum(PROJECT_VISIBILITIES).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return {
          data: await ctx.projectModel.create(input),
          message: 'Project created',
          success: true,
        };
      } catch (error) {
        mapProjectError(error, 'create');
      }
    }),

  delete: projectWriteProcedure.input(idInput).mutation(async ({ ctx, input }) => {
    try {
      return {
        data: requireResult(await ctx.projectModel.delete(input.id)),
        message: 'Project deleted',
        success: true,
      };
    } catch (error) {
      mapProjectError(error, 'delete');
    }
  }),

  detail: projectProcedure.input(idInput).query(async ({ ctx, input }) => {
    try {
      const project = requireResult(await ctx.projectModel.findByIdOrSlug(input.id));
      const [agents, completionReviews, knowledgeBases, tasks, works] = await Promise.all([
        ctx.projectModel.listAgents(project.id),
        ctx.projectModel.listCompletionReviews(project.id),
        ctx.projectModel.listKnowledgeBases(project.id),
        ctx.projectModel.listTasks(project.id),
        ctx.projectModel.listWorks(project.id),
      ]);
      return {
        data: { agents, completionReviews, knowledgeBases, project, tasks, works },
        success: true,
      };
    } catch (error) {
      mapProjectError(error, 'detail');
    }
  }),

  find: projectProcedure.input(idInput).query(async ({ ctx, input }) => {
    try {
      return {
        data: requireResult(await ctx.projectModel.findByIdOrSlug(input.id)),
        success: true,
      };
    } catch (error) {
      mapProjectError(error, 'find');
    }
  }),

  getOrchestrationPolicy: projectPolicyProcedure.input(idInput).query(async ({ ctx, input }) => {
    try {
      return {
        data: requireResult(await ctx.projectPolicyModel.getOrchestrationPolicy(input.id)),
        success: true,
      };
    } catch (error) {
      mapProjectError(error, 'getOrchestrationPolicy');
    }
  }),

  list: projectProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
        statuses: z.array(z.enum(PROJECT_STATUSES)).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        return { data: await ctx.projectModel.list(input), success: true };
      } catch (error) {
        mapProjectError(error, 'list');
      }
    }),

  listCompletionReviews: projectProcedure.input(idInput).query(async ({ ctx, input }) => {
    try {
      return {
        data: requireResult(await ctx.projectModel.listCompletionReviews(input.id)),
        success: true,
      };
    } catch (error) {
      mapProjectError(error, 'listCompletionReviews');
    }
  }),

  moveTask: projectWriteProcedure
    .input(idInput.extend({ taskId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const rows = requireResult(await ctx.projectModel.moveTaskTree(input.id, input.taskId));
        return { data: rows, message: `${rows.length} task(s) moved`, success: true };
      } catch (error) {
        mapProjectError(error, 'moveTask');
      }
    }),

  rejectCompletion: projectWriteProcedure
    .input(idInput.extend({ comment: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return {
          data: requireResult(
            await ctx.projectModel.reviewCompletion(input.id, 'rejected', input.comment),
          ),
          message: 'Project completion rejected',
          success: true,
        };
      } catch (error) {
        mapProjectError(error, 'rejectCompletion');
      }
    }),

  removeAgent: projectWriteProcedure
    .input(idInput.extend({ agentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const removed = await ctx.projectModel.removeAgent(input.id, input.agentId);
        if (!removed) throw new TRPCError({ code: 'NOT_FOUND', message: 'Binding not found' });
        return { message: 'Agent removed from project', success: true };
      } catch (error) {
        mapProjectError(error, 'removeAgent');
      }
    }),

  removeKnowledgeBase: projectWriteProcedure
    .input(idInput.extend({ knowledgeBaseId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const removed = await ctx.projectModel.removeKnowledgeBase(input.id, input.knowledgeBaseId);
        if (!removed) throw new TRPCError({ code: 'NOT_FOUND', message: 'Binding not found' });
        return { message: 'Knowledge base removed from project', success: true };
      } catch (error) {
        mapProjectError(error, 'removeKnowledgeBase');
      }
    }),

  removeWork: projectWriteProcedure
    .input(idInput.extend({ workId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const removed = await ctx.projectModel.removeWork(input.id, input.workId);
        if (!removed) throw new TRPCError({ code: 'NOT_FOUND', message: 'Binding not found' });
        return { message: 'Work removed from project', success: true };
      } catch (error) {
        mapProjectError(error, 'removeWork');
      }
    }),

  reopen: projectWriteProcedure.input(idInput).mutation(async ({ ctx, input }) => {
    try {
      return {
        data: requireResult(await ctx.projectModel.reopen(input.id)),
        message: 'Project reopened',
        success: true,
      };
    } catch (error) {
      mapProjectError(error, 'reopen');
    }
  }),

  requestCompletion: projectWriteProcedure.input(idInput).mutation(async ({ ctx, input }) => {
    try {
      return {
        data: requireResult(await ctx.projectModel.requestCompletion(input.id)),
        message: 'Project completion requested',
        success: true,
      };
    } catch (error) {
      mapProjectError(error, 'requestCompletion');
    }
  }),

  update: projectWriteProcedure
    .input(
      idInput.extend({
        avatar: z.string().nullish(),
        description: z.string().nullish(),
        name: z.string().min(1).max(255).optional(),
        slug: projectSlugInput.nullish(),
        visibility: z.enum(PROJECT_VISIBILITIES).optional(),
      }),
    )
    .mutation(async ({ ctx, input: { id, ...input } }) => {
      try {
        return {
          data: requireResult(await ctx.projectModel.update(id, input)),
          message: 'Project updated',
          success: true,
        };
      } catch (error) {
        mapProjectError(error, 'update');
      }
    }),

  updateOrchestrationPolicy: projectPolicyProcedure
    .input(
      idInput.extend({
        coordinatorAgentId: z.string().min(1),
        expectedRevision: z.number().int().min(1),
        orchestrationPolicy: orchestrationPolicySchema,
      }),
    )
    .mutation(async ({ ctx, input: { id, ...input } }) => {
      try {
        return {
          data: requireResult(await ctx.projectPolicyModel.updateOrchestrationPolicy(id, input)),
          message: 'Project orchestration policy saved',
          success: true,
        };
      } catch (error) {
        mapProjectError(error, 'updateOrchestrationPolicy');
      }
    }),

  updateStatus: projectWriteProcedure
    .input(
      idInput.extend({
        status: z.enum(PROJECT_STATUSES).exclude(['completed', 'reviewing']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return {
          data: requireResult(await ctx.projectModel.updateStatus(input.id, input.status)),
          message: 'Project status updated',
          success: true,
        };
      } catch (error) {
        mapProjectError(error, 'updateStatus');
      }
    }),
});
