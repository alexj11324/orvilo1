import { TASK_STATUSES } from '@orvilo/builtin-tool-task';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { withScopedPermission } from '@/business/server/trpc-middlewares/rbacPermission';
import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import {
  LINEAR_ISSUE_LINK_LIST_DEFAULT_LIMIT,
  LINEAR_ISSUE_LINK_TASK_ID_CAP,
  LinearSyncModel,
} from '@/database/models/linearSync';
import { ProjectModel } from '@/database/models/project';
import { TaskModel } from '@/database/models/task';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { KeyVaultsGateKeeper } from '@/server/modules/KeyVaultsEncrypt';
import { LinearIntegrationTaskService } from '@/server/services/linearSync/integrationTask';
import {
  buildLinearAuthorizationUrl,
  createLinearPkcePair,
  generateLinearOAuthState,
  getLinearOAuthConfig,
  getLinearOAuthRedirectUri,
  revokeLinearToken,
} from '@/server/services/linearSync/oauth';
import { saveLinearOAuthState } from '@/server/services/linearSync/oauthState';
import { LinearPlanningWorker } from '@/server/services/linearSync/planning';
import {
  createLinearGraphqlIssueProvider,
  LinearScopeValidationError,
} from '@/server/services/linearSync/provider';
import { LinearSyncWorker } from '@/server/services/linearSync/worker';
import { LinearSyncWorkflow } from '@/server/workflows/linearSync';

const linearSyncProcedure = wsCompatProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;
  if (!ctx.workspaceId) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'workspaceId is required' });
  }

  return opts.next({
    ctx: {
      linearSyncModel: new LinearSyncModel(ctx.serverDB, ctx.workspaceId),
      projectModel: new ProjectModel(ctx.serverDB, ctx.userId, ctx.workspaceId),
      taskModel: new TaskModel(ctx.serverDB, ctx.userId, ctx.workspaceId),
    },
  });
});

const linearSyncWriteProcedure = linearSyncProcedure.use(
  withScopedPermission('workspace:settings_update'),
);

const linearSyncAdminProcedure = linearSyncProcedure.use(
  withScopedPermission('workspace:settings_update'),
);

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
    .array(
      z
        .object({
          linearStateId: z.string().min(1),
          localStatus: z.enum(TASK_STATUSES).optional(),
          workflowCategory: z
            .enum(['backlog', 'canceled', 'done', 'in_progress', 'in_review', 'todo', 'triage'])
            .optional(),
        })
        .refine((mapping) => mapping.localStatus || mapping.workflowCategory, {
          message: 'A Linear state mapping needs a workflow category or legacy local status',
        }),
    )
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

  installationRecovery: linearSyncAdminProcedure.query(async ({ ctx }) => {
    try {
      return { data: await ctx.linearSyncModel.listInstallationRecoveryState(), success: true };
    } catch (error) {
      mapError(error, 'installationRecovery');
    }
  }),

  operations: linearSyncAdminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }))
    .query(async ({ ctx, input }) => {
      try {
        return { data: await ctx.linearSyncModel.listRecoveryRows(input.limit), success: true };
      } catch (error) {
        mapError(error, 'operations');
      }
    }),

  retryOperation: linearSyncAdminProcedure
    .input(
      z.object({
        expectedUpdatedAt: z.string().datetime(),
        id: z.string().uuid(),
        kind: z.enum(['inbox', 'outbox', 'planning']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const retried = await ctx.linearSyncModel.retryRecoveryRow({
          expectedUpdatedAt: new Date(input.expectedUpdatedAt),
          id: input.id,
          kind: input.kind,
        });
        if (!retried) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'The Linear operation changed or is currently running',
          });
        }

        if (input.kind === 'planning') {
          await LinearSyncWorkflow.trigger({ workspaceId: ctx.workspaceId!, limit: 20 });
        } else {
          await LinearSyncWorkflow.triggerInstallation({
            installationId: retried.installationId,
            limit: 20,
            workspaceId: ctx.workspaceId!,
          });
        }

        return {
          data: { id: retried.id, kind: input.kind },
          message: 'Linear retry queued',
          success: true,
        };
      } catch (error) {
        mapError(error, 'retryOperation');
      }
    }),

  catalog: linearSyncProcedure
    .input(z.object({ installationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        const installation = await ctx.linearSyncModel.findInstallationById(input.installationId);
        if (!installation) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Linear installation not found' });
        }
        if (installation.status !== 'active') {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Linear installation is unavailable',
          });
        }
        const provider = createLinearGraphqlIssueProvider({
          db: ctx.serverDB,
          installationId: installation.id,
          organizationId: installation.organizationId,
          workspaceId: ctx.workspaceId!,
        });
        const [organizations, projects, teams, members] = await Promise.all([
          provider.listOrganizations(),
          provider.listProjects(),
          provider.listTeams(),
          provider.listMembers(),
        ]);
        const workflowStates = Object.fromEntries(
          teams.map((team) => [team.id, team.workflowStates ?? []]),
        );
        return {
          data: {
            members,
            organizations,
            projects,
            teams: teams.map(({ id, key, name }) => ({ id, key, name })),
            workflowStates,
          },
          success: true,
        };
      } catch (error) {
        mapError(error, 'catalog');
      }
    }),

  createIssueLink: linearSyncWriteProcedure
    .input(
      z.object({
        bindingId: z.string().uuid(),
        linearIdentifier: z.string().min(1),
        linearIssueId: z.string().min(1),
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
        if (task.visibility !== 'public' || task.projectId !== binding.projectId) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only public tasks in the bound project can be linked to Linear',
          });
        }
        const installation = await ctx.linearSyncModel.findInstallationById(binding.installationId);
        if (!installation) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Linear installation not found' });
        }
        const existing = await ctx.linearSyncModel.findIssueLinkByTaskId(task.id);
        if (existing) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Task is already linked to Linear' });
        }

        const provider = createLinearGraphqlIssueProvider({
          db: ctx.serverDB,
          installationId: installation.id,
          organizationId: installation.organizationId,
          workspaceId: ctx.workspaceId!,
        });
        const remoteIssue = await provider.getIssue(input.linearIssueId);
        if (
          remoteIssue.id !== input.linearIssueId ||
          remoteIssue.identifier !== input.linearIdentifier ||
          remoteIssue.projectId !== binding.linearProjectId
        ) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Linear issue is outside the bound project',
          });
        }
        const inScope = await new LinearIntegrationTaskService(
          ctx.serverDB,
          ctx.workspaceId!,
          installation.id,
        ).validateIssueScope({ binding, installation, issue: remoteIssue });
        if (!inScope) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Linear issue is outside the validated organization and team scope',
          });
        }

        return {
          data: await ctx.linearSyncModel.createIssueLink({
            bindingId: binding.id,
            installationId: installation.id,
            linearIdentifier: input.linearIdentifier,
            linearIssueId: input.linearIssueId,
            organizationId: installation.organizationId,
            remoteSnapshot: remoteIssue,
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
        if (installation.status !== 'active') {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Linear installation is unavailable',
          });
        }
        const project = await ctx.projectModel.findManageableById(input.projectId);
        if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });

        const provider = createLinearGraphqlIssueProvider({
          db: ctx.serverDB,
          installationId: installation.id,
          organizationId: installation.organizationId,
          workspaceId: ctx.workspaceId!,
        });
        const [scope, members] = await Promise.all([
          provider.validateProjectScope!({
            defaultTeamId: input.defaultTeamId,
            organizationId: installation.organizationId,
            projectId: input.linearProjectId,
            teamIds: input.teamIds,
          }),
          provider.listMembers(),
        ]);
        const visibleMemberIds = new Set(members.map((member) => member.id));
        const invalidAssignment = input.settings?.assignmentMappings?.find(
          (mapping) => !visibleMemberIds.has(mapping.linearUserId),
        );
        if (invalidAssignment) {
          throw new LinearScopeValidationError(
            `Linear assignment user ${invalidAssignment.linearUserId} is not visible in the installed organization`,
          );
        }

        const binding = await ctx.linearSyncModel.upsertBinding({
          defaultTeamId: input.defaultTeamId,
          installationId: installation.id,
          linearProjectId: input.linearProjectId,
          projectId: project.id,
          settings: input.settings,
          syncEnabled: input.syncEnabled,
          teamIds: scope.teamIds,
        });
        await LinearSyncWorkflow.triggerInstallation({
          installationId: installation.id,
          limit: 20,
          workspaceId: ctx.workspaceId!,
        });

        return {
          data: binding,
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

  importProject: linearSyncWriteProcedure
    .input(
      z.object({
        bindingId: z.string().uuid(),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const binding = await ctx.linearSyncModel.findBindingById(input.bindingId);
        if (!binding) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Linear project binding not found' });
        }
        const installation = await ctx.linearSyncModel.findInstallationById(binding.installationId);
        if (!installation) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Linear installation not found' });
        }
        const provider = createLinearGraphqlIssueProvider({
          db: ctx.serverDB,
          installationId: installation.id,
          organizationId: installation.organizationId,
          workspaceId: ctx.workspaceId!,
        });
        const data = await new LinearSyncWorker(ctx.serverDB, ctx.workspaceId!).importBinding(
          provider,
          binding.id,
          input.limit,
        );
        return { data, message: 'Linear project import processed', success: true };
      } catch (error) {
        mapError(error, 'importProject');
      }
    }),

  issueLinks: linearSyncProcedure
    .input(
      z.object({
        bindingId: z.string().uuid().optional(),
        limit: z
          .number()
          .int()
          .min(1)
          .max(LINEAR_ISSUE_LINK_TASK_ID_CAP)
          .default(LINEAR_ISSUE_LINK_LIST_DEFAULT_LIMIT),
        offset: z.number().int().min(0).default(0),
        taskIds: z.array(z.string().min(1)).min(1).max(LINEAR_ISSUE_LINK_TASK_ID_CAP).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        return {
          data: await ctx.linearSyncModel.listIssueLinks(input),
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

  projects: linearSyncProcedure.query(async ({ ctx }) => {
    try {
      return { data: await ctx.projectModel.list(), success: true };
    } catch (error) {
      mapError(error, 'projects');
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
          db: ctx.serverDB,
          installationId: installation.id,
          organizationId: installation.organizationId,
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
          db: ctx.serverDB,
          installationId: installation.id,
          organizationId: installation.organizationId,
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
        approvalConfirmed: z.literal(true),
        revisionId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const data = await new LinearPlanningWorker(ctx.serverDB, ctx.workspaceId!).applyProposal(
          input.revisionId,
          ctx.userId,
          input.approvalConfirmed,
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

  startOAuth: linearSyncWriteProcedure
    .input(
      z.object({
        returnTo: z
          .string()
          .regex(/^\//, 'returnTo must be a relative application path')
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const config = getLinearOAuthConfig();
        const redirectUri = getLinearOAuthRedirectUri();
        const state = generateLinearOAuthState();
        const { challenge, verifier } = createLinearPkcePair();
        await saveLinearOAuthState(state, {
          actor: 'app',
          clientId: config.clientId,
          codeVerifier: verifier,
          lobeUserId: ctx.userId,
          redirectUri,
          returnTo: input.returnTo,
          scopes: config.scopes,
          workspaceId: ctx.workspaceId!,
        });

        return {
          authorizationUrl: buildLinearAuthorizationUrl({
            clientId: config.clientId,
            codeChallenge: challenge,
            redirectUri,
            scopes: config.scopes,
            state,
          }),
        };
      } catch (error) {
        mapError(error, 'startOAuth');
      }
    }),

  revokeInstallation: linearSyncWriteProcedure
    .input(z.object({ installationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const installation = await ctx.linearSyncModel.findInstallationForAuth(
          input.installationId,
        );
        if (!installation) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Linear installation not found' });
        }
        const config = getLinearOAuthConfig();
        const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();
        if (installation.accessTokenCiphertext) {
          const accessToken = await gateKeeper.decrypt(installation.accessTokenCiphertext);
          if (!accessToken.wasAuthentic || !accessToken.plaintext) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Linear installation credentials are invalid',
            });
          }
          await revokeLinearToken({
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            token: accessToken.plaintext,
            tokenTypeHint: 'access_token',
          });
        }
        await ctx.linearSyncModel.markInstallationUnavailable(input.installationId, {
          message: 'Linear installation revoked by workspace user',
          reason: 'user_revoked',
          status: 'revoked',
        });

        return {
          data: { installationId: input.installationId, status: 'revoked' },
          message: 'Linear installation revoked',
          success: true,
        };
      } catch (error) {
        mapError(error, 'revokeInstallation');
      }
    }),
});
