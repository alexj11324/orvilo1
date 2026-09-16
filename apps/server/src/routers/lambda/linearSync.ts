import { TASK_STATUSES } from '@orvilo/builtin-tool-task';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { withScopedPermission } from '@/business/server/trpc-middlewares/rbacPermission';
import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { ConnectorModel } from '@/database/models/connector';
import { LinearSyncModel } from '@/database/models/linearSync';
import { ProjectModel } from '@/database/models/project';
import { TaskModel } from '@/database/models/task';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { LinearPlanningWorker } from '@/server/services/linearSync/planning';
import { createLinearGraphqlIssueProvider } from '@/server/services/linearSync/provider';
import { LinearSyncWorker } from '@/server/services/linearSync/worker';

const linearSyncProcedure = wsCompatProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;
  if (!ctx.workspaceId) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'workspaceId is required' });
  }

  return opts.next({
    ctx: {
      connectorModel: new ConnectorModel(ctx.serverDB, ctx.userId, ctx.workspaceId),
      linearSyncModel: new LinearSyncModel(ctx.serverDB, ctx.workspaceId),
      projectModel: new ProjectModel(ctx.serverDB, ctx.userId, ctx.workspaceId),
      taskModel: new TaskModel(ctx.serverDB, ctx.userId, ctx.workspaceId),
    },
  });
});

const linearSyncWriteProcedure = linearSyncProcedure.use(withScopedPermission('agent:update'));

const settingsSchema = z.object({
  assignmentMappings: z
    .array(
      z.object({
        linearUserId: z.string().min(1),
        orviloAgentId: z.string().optional(),
        orviloUserId: z.string().optional(),
      }),
    )
    .optional(),
  autoExecutionEnabled: z.boolean().optional(),
  replanningEnabled: z.boolean().optional(),
  statusMappings: z
    .array(z.object({ linearStateId: z.string().min(1), localStatus: z.enum(TASK_STATUSES) }))
    .optional(),
});

const snapshotSchema = z.object({
  archivedAt: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  createdAt: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  id: z.string().min(1),
  identifier: z.string().min(1),
  parentId: z.string().nullable().optional(),
  priority: z.number().nullable().optional(),
  projectId: z.string().nullable().optional(),
  stateId: z.string().nullable().optional(),
  stateType: z.string().nullable().optional(),
  teamId: z.string().nullable().optional(),
  title: z.string().min(1),
  updatedAt: z.string().nullable().optional(),
  url: z.string().url().nullable().optional(),
});

const planningActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('assign_task'),
    assigneeAgentId: z.string().nullable().optional(),
    assigneeUserId: z.string().nullable().optional(),
    reason: z.string().trim().min(1).max(8_000),
    taskId: z.string().min(1),
  }),
  z.object({
    action: z.literal('create_task'),
    description: z.string().max(8_000),
    instruction: z.string().min(1).max(50_000),
    name: z.string().trim().min(1).max(255),
    parentTaskId: z.string().nullable().optional(),
    priority: z.number().int().min(0).max(4).optional(),
    projectId: z.string().min(1),
    reason: z.string().trim().min(1).max(8_000),
  }),
  z.object({
    action: z.literal('escalate'),
    reason: z.string().trim().min(1).max(8_000),
  }),
  z.object({
    action: z.literal('noop'),
    reason: z.string().trim().min(1).max(8_000),
  }),
  z.object({
    action: z.literal('request_stop'),
    reason: z.string().trim().min(1).max(8_000),
    taskId: z.string().min(1),
  }),
  z.object({
    action: z.literal('set_dependency'),
    dependsOnTaskId: z.string().min(1),
    operation: z.enum(['add', 'remove']),
    reason: z.string().trim().min(1).max(8_000),
    taskId: z.string().min(1),
  }),
  z.object({
    action: z.literal('update_task'),
    patch: z
      .object({
        instruction: z.string().min(1).max(50_000).optional(),
        name: z.string().trim().min(1).max(255).optional(),
        priority: z.number().int().min(0).max(4).optional(),
      })
      .refine((patch) => Object.keys(patch).length > 0, 'Task patch cannot be empty'),
    reason: z.string().trim().min(1).max(8_000),
    taskId: z.string().min(1),
  }),
]);

const planningProposalSchema = z.object({
  actions: z.array(planningActionSchema).max(50),
  explanation: z.string().trim().min(1).max(20_000),
  requiresApproval: z.boolean(),
});

const mapError = (error: unknown, operation: string): never => {
  if (error instanceof TRPCError) throw error;
  console.error(`[linearSync:${operation}]`, error);
  throw new TRPCError({
    cause: error,
    code: 'BAD_REQUEST',
    message: error instanceof Error ? error.message : `Failed to ${operation}`,
  });
};

export const linearSyncRouter = router({
  bindings: linearSyncProcedure.query(async ({ ctx }) => {
    try {
      return { data: await ctx.linearSyncModel.listBindings(), success: true };
    } catch (error) {
      mapError(error, 'listBindings');
    }
  }),

  createIssueLink: linearSyncWriteProcedure
    .input(
      z.object({
        bindingId: z.string().uuid(),
        linearIdentifier: z.string().min(1),
        linearIssueId: z.string().min(1),
        organizationId: z.string().min(1),
        remoteSnapshot: snapshotSchema.optional(),
        taskId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const binding = await ctx.linearSyncModel.findBindingById(input.bindingId);
        if (!binding)
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Linear binding not found' });
        const task = await ctx.taskModel.resolve(input.taskId);
        if (!task) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
        const installation = await ctx.linearSyncModel.findInstallationById(binding.installationId);
        if (!installation) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Linear installation not found' });
        }
        const existing = await ctx.linearSyncModel.findIssueLinkByTaskId(task.id);
        if (existing) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Task is already linked to Linear' });
        }

        return {
          data: await ctx.linearSyncModel.createIssueLink({
            bindingId: binding.id,
            installationId: installation.id,
            linearIdentifier: input.linearIdentifier,
            linearIssueId: input.linearIssueId,
            organizationId: input.organizationId,
            remoteSnapshot: input.remoteSnapshot,
            taskId: task.id,
          }),
          message: 'Linear issue linked',
          success: true,
        };
      } catch (error) {
        mapError(error, 'createIssueLink');
      }
    }),

  createProjectBinding: linearSyncWriteProcedure
    .input(
      z.object({
        defaultTeamId: z.string().optional(),
        installationId: z.string().uuid(),
        linearProjectId: z.string().min(1),
        projectId: z.string(),
        settings: settingsSchema.optional(),
        syncEnabled: z.boolean().optional(),
        teamIds: z.array(z.string().min(1)).max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const installation = await ctx.linearSyncModel.findInstallationById(input.installationId);
        if (!installation) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Linear installation not found' });
        }
        const project = await ctx.projectModel.findManageableById(input.projectId);
        if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });

        return {
          data: await ctx.linearSyncModel.upsertBinding({
            defaultTeamId: input.defaultTeamId,
            installationId: installation.id,
            linearProjectId: input.linearProjectId,
            projectId: project.id,
            settings: input.settings,
            syncEnabled: input.syncEnabled,
            teamIds: input.teamIds,
          }),
          message: 'Linear project binding saved',
          success: true,
        };
      } catch (error) {
        mapError(error, 'createProjectBinding');
      }
    }),

  installations: linearSyncProcedure.query(async ({ ctx }) => {
    try {
      return { data: await ctx.linearSyncModel.listInstallations(), success: true };
    } catch (error) {
      mapError(error, 'listInstallations');
    }
  }),

  issueLinks: linearSyncProcedure
    .input(z.object({ bindingId: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      try {
        return {
          data: await ctx.linearSyncModel.listIssueLinks(input.bindingId),
          success: true,
        };
      } catch (error) {
        mapError(error, 'listIssueLinks');
      }
    }),

  planningRevisions: linearSyncProcedure
    .input(
      z.object({ limit: z.number().int().min(1).max(100).default(20), scopeId: z.string().uuid() }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const scope = await ctx.linearSyncModel.findPlanningScopeById(input.scopeId);
        if (!scope) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Planning scope not found' });
        }
        return {
          data: await ctx.linearSyncModel.listPlanningRevisions(scope.id, input.limit),
          success: true,
        };
      } catch (error) {
        mapError(error, 'listPlanningRevisions');
      }
    }),

  planningScopes: linearSyncProcedure.query(async ({ ctx }) => {
    try {
      return { data: await ctx.linearSyncModel.listPlanningScopes(), success: true };
    } catch (error) {
      mapError(error, 'listPlanningScopes');
    }
  }),

  processInbox: linearSyncWriteProcedure
    .input(
      z.object({
        installationId: z.string().uuid(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const installation = await ctx.linearSyncModel.findInstallationById(input.installationId);
        if (!installation) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Linear installation not found' });
        }
        const provider = createLinearGraphqlIssueProvider({
          userId: installation.installedByUserId ?? ctx.userId,
          workspaceId: ctx.workspaceId!,
        });
        const data = await new LinearSyncWorker(ctx.serverDB, ctx.workspaceId!).processPending(
          provider,
          input.limit,
          installation.id,
        );
        return { data, message: 'Linear inbox processed', success: true };
      } catch (error) {
        mapError(error, 'processInbox');
      }
    }),

  processOutbox: linearSyncWriteProcedure
    .input(
      z.object({
        installationId: z.string().uuid(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const installation = await ctx.linearSyncModel.findInstallationById(input.installationId);
        if (!installation) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Linear installation not found' });
        }
        const provider = createLinearGraphqlIssueProvider({
          userId: installation.installedByUserId ?? ctx.userId,
          workspaceId: ctx.workspaceId!,
        });
        const data = await new LinearSyncWorker(ctx.serverDB, ctx.workspaceId!).processOutbox(
          provider,
          input.limit,
          installation.id,
        );
        return { data, message: 'Linear outbox processed', success: true };
      } catch (error) {
        mapError(error, 'processOutbox');
      }
    }),

  processPlanning: linearSyncWriteProcedure
    .input(z.object({ limit: z.number().int().min(1).max(20).default(10) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const data = await new LinearPlanningWorker(ctx.serverDB, ctx.workspaceId!).processPending(
          undefined,
          input.limit,
        );
        return { data, message: 'Linear planning scopes processed', success: true };
      } catch (error) {
        mapError(error, 'processPlanning');
      }
    }),

  applyPlanningProposal: linearSyncWriteProcedure
    .input(
      z.object({
        proposal: planningProposalSchema,
        revisionId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const data = await new LinearPlanningWorker(ctx.serverDB, ctx.workspaceId!).applyProposal(
          input.revisionId,
          input.proposal,
          ctx.userId,
        );
        return { data, message: 'Linear planning proposal applied', success: true };
      } catch (error) {
        mapError(error, 'applyPlanningProposal');
      }
    }),

  requeuePlanningScope: linearSyncWriteProcedure
    .input(z.object({ scopeId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const scope = await ctx.linearSyncModel.findPlanningScopeById(input.scopeId);
        if (!scope) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Planning scope not found' });
        }
        return {
          data: await ctx.linearSyncModel.requeuePlanningScope(scope.id),
          message: 'Planning scope requeued',
          success: true,
        };
      } catch (error) {
        mapError(error, 'requeuePlanningScope');
      }
    }),

  upsertInstallation: linearSyncWriteProcedure
    .input(
      z.object({
        connectorId: z.string(),
        organizationId: z.string().min(1),
        organizationName: z.string().optional(),
        webhookSecretRef: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const connector = await ctx.connectorModel.findPublicById(input.connectorId);
        if (!connector || connector.identifier !== 'linear') {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Linear connector not found' });
        }

        return {
          data: await ctx.linearSyncModel.upsertInstallation({
            connectorId: connector.id,
            installedByUserId: ctx.userId,
            organizationId: input.organizationId,
            organizationName: input.organizationName,
            webhookSecretRef: input.webhookSecretRef,
          }),
          message: 'Linear installation saved',
          success: true,
        };
      } catch (error) {
        mapError(error, 'upsertInstallation');
      }
    }),
});
