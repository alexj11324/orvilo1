import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { withScopedPermission } from '@/business/server/trpc-middlewares/rbacPermission';
import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { TaskModel } from '@/database/models/task';
import { TeamModel } from '@/database/models/team';
import { hasWorkspaceAdminAccess } from '@/database/models/workspace';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';

/**
 * Team domain surface (linear-workspace-v3): durable responsibility domains
 * that own workflow states, cycles, defaults and projectless tasks. Team
 * reads are open to workspace members; writes require `agent:update` like
 * project commands; admin-only surfaces add the workspace role check.
 */
const teamProcedure = wsCompatProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;
  if (!ctx.workspaceId) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'workspaceId is required' });
  }
  return opts.next({
    ctx: {
      taskModel: new TaskModel(ctx.serverDB, ctx.userId, ctx.workspaceId),
      teamModel: new TeamModel(ctx.serverDB, ctx.userId, ctx.workspaceId),
    },
  });
});

const teamWriteProcedure = teamProcedure.use(withScopedPermission('agent:update'));

const teamIdInput = z.object({ teamId: z.string().min(1) });
const teamKeyInput = z
  .string()
  .trim()
  .min(2)
  .max(12)
  .regex(/^[A-Z][A-Z0-9]*$/i, 'Team key must be alphanumeric');

const orchestrationPolicySchema = z.object({
  allowedAgentIds: z.array(z.string().min(1)).max(100).optional(),
  allowedRoles: z.array(z.string().trim().min(1)).max(100).optional(),
  autoDispatch: z.boolean().optional(),
  concurrencyLimit: z.number().int().min(1).max(100).optional(),
  defaultAgentId: z.string().min(1).optional(),
  executionBudget: z
    .object({ maxCost: z.number().min(0).optional(), maxRuns: z.number().int().min(1).optional() })
    .optional(),
  planningBudget: z.object({ maxRevisions: z.number().int().min(1).optional() }).optional(),
  replanMode: z.enum(['disabled', 'observe', 'suggest', 'apply']).optional(),
  requireHumanReview: z.boolean().optional(),
});

export const teamRouter = router({
  teams: teamProcedure.query(async ({ ctx }) => {
    return { data: await ctx.teamModel.listReadable(), success: true };
  }),

  team: teamProcedure.input(teamIdInput).query(async ({ ctx, input }) => {
    // Private teams are readable by their members (and workspace admins) only —
    // a miss is reported as NOT_FOUND so existence does not leak.
    if (!(await ctx.teamModel.hasReadAccess(input.teamId))) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Team not found' });
    }
    const team = await ctx.teamModel.findById(input.teamId);
    if (!team) throw new TRPCError({ code: 'NOT_FOUND', message: 'Team not found' });
    const [members, workflowStates, cycles, projectIds] = await Promise.all([
      ctx.teamModel.listMembers(team.id),
      ctx.teamModel.listWorkflowStates(team.id),
      ctx.teamModel.listCycles(team.id),
      ctx.teamModel.listProjectIdsForTeam(team.id),
    ]);
    return { data: { cycles, members, projectIds, team, workflowStates }, success: true };
  }),

  createTeam: teamWriteProcedure
    .input(
      z.object({
        defaultAgentId: z.string().min(1).nullable().optional(),
        description: z.string().max(8_000).optional(),
        isDefault: z.boolean().optional(),
        key: teamKeyInput,
        name: z.string().trim().min(1).max(255),
        visibility: z.enum(['private', 'public']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // PERMISSIONS: creating a team is a workspace-admin operation.
      if (
        !(await hasWorkspaceAdminAccess(ctx.serverDB, {
          userId: ctx.userId,
          workspaceId: ctx.workspaceId,
        }))
      ) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Workspace admin required' });
      }
      const team = await ctx.teamModel.create(input);
      return { data: team, message: 'Team created', success: true };
    }),

  updateTeam: teamWriteProcedure
    .input(
      teamIdInput.extend({
        defaultAgentId: z.string().min(1).nullable().optional(),
        description: z.string().max(8_000).nullable().optional(),
        key: teamKeyInput.optional(),
        name: z.string().trim().min(1).max(255).optional(),
        orchestrationPolicy: orchestrationPolicySchema.optional(),
        status: z.enum(['active', 'archived']).optional(),
        visibility: z.enum(['private', 'public']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!(await ctx.teamModel.hasAdminAccess(input.teamId))) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Team admin required' });
      }
      const { teamId, ...patch } = input;
      const team = await ctx.teamModel.update(teamId, patch);
      if (!team) throw new TRPCError({ code: 'NOT_FOUND', message: 'Team not found' });
      return { data: team, message: 'Team updated', success: true };
    }),

  addMember: teamWriteProcedure
    .input(
      teamIdInput.extend({
        role: z.enum(['lead', 'member']).default('member'),
        userId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!(await ctx.teamModel.hasAdminAccess(input.teamId))) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Team admin required' });
      }
      const member = await ctx.teamModel.addMember(input.teamId, input.userId, input.role);
      return { data: member, message: 'Team member added', success: true };
    }),

  removeMember: teamWriteProcedure
    .input(teamIdInput.extend({ userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (!(await ctx.teamModel.hasAdminAccess(input.teamId))) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Team admin required' });
      }
      await ctx.teamModel.removeMember(input.teamId, input.userId);
      return { message: 'Team member removed', success: true };
    }),

  linkProject: teamWriteProcedure
    .input(teamIdInput.extend({ projectId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (!(await ctx.teamModel.hasAdminAccess(input.teamId))) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Team admin required' });
      }
      await ctx.teamModel.linkProject(input.projectId, input.teamId);
      return { message: 'Project linked to team', success: true };
    }),

  unlinkProject: teamWriteProcedure
    .input(teamIdInput.extend({ projectId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (!(await ctx.teamModel.hasAdminAccess(input.teamId))) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Team admin required' });
      }
      await ctx.teamModel.unlinkProject(input.projectId, input.teamId);
      return { message: 'Project unlinked from team', success: true };
    }),

  /**
   * Move a task into a team (or back to personal scope with `teamId: null`).
   * The model dirties the old and new planning scopes in one transaction.
   */
  moveTaskToTeam: teamWriteProcedure
    .input(z.object({ taskId: z.string().min(1), teamId: z.string().min(1).nullable() }))
    .mutation(async ({ ctx, input }) => {
      // PERMISSIONS: the target team must be visible and writable, and moving
      // out of the current team requires write access there too.
      const current = await ctx.taskModel.findById(input.taskId);
      if (!current) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
      for (const teamId of new Set([current.teamId, input.teamId].filter(Boolean) as string[])) {
        if (!(await ctx.teamModel.hasWriteAccess(teamId))) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Team write access required' });
        }
      }
      const task = await ctx.taskModel.moveToTeam(input.taskId, input.teamId, {
        source: 'user',
      });
      if (!task) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
      return { data: task, message: 'Task moved', success: true };
    }),
});
