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
