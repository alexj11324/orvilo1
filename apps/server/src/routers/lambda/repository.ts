import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { withScopedPermission } from '@/business/server/trpc-middlewares/rbacPermission';
import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { RepositoryModel } from '@/database/models/repository';
import { TeamModel } from '@/database/models/team';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { resolveGithubAccessToken, verifyGithubRepository } from '@/server/services/githubRepo';

/**
 * Repository surface (linear-workspace-v3, WM-06/07). Repositories are shared
 * workspace code resources — registering one or a checkout never grants
 * execution rights; the deterministic `resolveForTask` resolver only reads
 * confirmed/applied associations.
 */
const repositoryProcedure = wsCompatProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;
  if (!ctx.workspaceId) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'workspaceId is required' });
  }
  return opts.next({
    ctx: {
      repositoryModel: new RepositoryModel(ctx.serverDB, ctx.userId, ctx.workspaceId),
      teamModel: new TeamModel(ctx.serverDB, ctx.userId, ctx.workspaceId),
    },
  });
});

const repositoryWriteProcedure = repositoryProcedure.use(withScopedPermission('agent:update'));

const repositoryIdInput = z.object({ repositoryId: z.string().min(1) });
const decisionIdInput = z.object({ decisionId: z.string().min(1) });

const evidenceSchema = z.object({
  detail: z.string().min(1).max(2_000),
  kind: z.enum([
    'ai_suggestion',
    'controlled_create_receipt',
    'description_similarity',
    'explicit_link',
    'historical_pr',
    'name_similarity',
    'path_hint',
    'stable_id',
    'verified_remote',
  ]),
});

export const repositoryRouter = router({
  repositories: repositoryProcedure.query(async ({ ctx }) => {
    return { data: await ctx.repositoryModel.listByWorkspace(), success: true };
  }),

  repository: repositoryProcedure.input(repositoryIdInput).query(async ({ ctx, input }) => {
    const repository = await ctx.repositoryModel.findById(input.repositoryId);
    if (!repository) throw new TRPCError({ code: 'NOT_FOUND', message: 'Repository not found' });
    const checkouts = await ctx.repositoryModel.listCheckouts(repository.id);
    const safeCheckouts = checkouts.map((checkout) => ({
      createdAt: checkout.createdAt,
      id: checkout.id,
      lastVerifiedAt: checkout.lastVerifiedAt,
      remoteRepositoryId: checkout.remoteRepositoryId,
      remoteRole: checkout.remoteRole,
      repositoryId: checkout.repositoryId,
      status: checkout.status,
      updatedAt: checkout.updatedAt,
      workspaceId: checkout.workspaceId,
    }));
    return { data: { checkouts: safeCheckouts, repository }, success: true };
  }),

  /**
   * Register a repository by verified remote identity. The slug/URL is only a
   * hint — identity comes from the provider API's stable repository id, so a
   * renamed repo never produces a duplicate row. Unverifiable remotes fail
   * rather than minting a synthetic id; use `registerLocalRepository` for
   * genuinely local-only copies.
   */
  registerRemoteRepository: repositoryWriteProcedure
    .input(z.object({ repo: z.string().min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const token = await resolveGithubAccessToken({
        db: ctx.serverDB,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId ?? undefined,
      });
      const verified = await verifyGithubRepository(input.repo, token);
      if (!verified) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            'Could not verify this repository on github.com. Check the coordinate or connect a GitHub credential with access.',
        });
      }
      const repository = await ctx.repositoryModel.upsertByRemoteIdentity({
        coordinate: {
          defaultBranch: verified.defaultBranch ?? null,
          name: verified.coordinate.name,
          owner: verified.coordinate.owner,
          url: verified.coordinate.url ?? null,
        },
        isFork: verified.isFork,
        parentCoordinate: verified.parent ?? null,
        providerHost: 'github.com',
        remoteRepositoryId: verified.remoteRepositoryId,
      });
      return { data: repository, message: 'Repository registered', success: true };
    }),

  /** Register a local-only repository (no verified remote). */
  registerLocalRepository: repositoryWriteProcedure
    .input(
      z.object({
        localOnlyKey: z.string().min(1).max(255),
        name: z.string().min(1).max(255),
        owner: z.string().min(1).max(255),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const repository = await ctx.repositoryModel.createLocalOnly({
        coordinate: { name: input.name, owner: input.owner },
        localOnlyKey: input.localOnlyKey,
      });
      return { data: repository, message: 'Local repository registered', success: true };
    }),

  /**
   * Record an authorized local checkout. `canonicalPath` stays server-side.
   * This grants no execution or push rights.
   */
  registerCheckout: repositoryWriteProcedure
    .input(
      repositoryIdInput.extend({
        canonicalPath: z.string().min(1).max(2_000),
        deviceId: z.string().min(1).optional(),
        remoteRole: z.enum(['origin', 'upstream', 'other']).optional(),
        remoteUrl: z.string().max(2_000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { repositoryId, ...rest } = input;
      const checkout = await ctx.repositoryModel.registerCheckout({
        repositoryId,
        ...rest,
      });
      return { data: checkout, message: 'Checkout registered', success: true };
    }),

  revokeCheckout: repositoryWriteProcedure
    .input(z.object({ checkoutId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const checkout = await ctx.repositoryModel.revokeCheckout(input.checkoutId);
      if (!checkout) throw new TRPCError({ code: 'NOT_FOUND', message: 'Checkout not found' });
      return { message: 'Checkout revoked', success: true };
    }),

  linkProject: repositoryWriteProcedure
    .input(z.object({ projectId: z.string().min(1), repositoryId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.repositoryModel.linkProject(input.projectId, input.repositoryId);
      return { message: 'Repository linked to project', success: true };
    }),

  unlinkProject: repositoryWriteProcedure
    .input(z.object({ projectId: z.string().min(1), repositoryId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.repositoryModel.unlinkProject(input.projectId, input.repositoryId);
      return { message: 'Repository unlinked from project', success: true };
    }),

  setTeamDefault: repositoryWriteProcedure
    .input(
      z.object({
        isPrimary: z.boolean().optional(),
        repositoryId: z.string().min(1),
        teamId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!(await ctx.teamModel.hasAdminAccess(input.teamId))) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Team admin required' });
      }
      await ctx.repositoryModel.setTeamDefault(
        input.teamId,
        input.repositoryId,
        input.isPrimary ?? false,
      );
      return { message: 'Team repository default updated', success: true };
    }),

  // ── Association decisions ──────────────────────────────────────────────

  proposeAssociation: repositoryWriteProcedure
    .input(
      z.object({
        confidence: z.number().min(0).max(1).optional(),
        evidence: z.array(evidenceSchema).min(1),
        idempotencyKey: z.string().min(1).max(255),
        inputRevision: z.number().int().min(0).optional(),
        policyRevision: z.number().int().min(0).optional(),
        relation: z.enum(['project_repository', 'task_repository', 'team_repository_default']),
        source: z.enum(['ai', 'deterministic', 'import', 'manual']),
        sourceId: z.string().min(1),
        sourceKind: z.enum(['project', 'task', 'team']),
        targetRepositoryId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const decision = await ctx.repositoryModel.proposeAssociation(input);
      if (!decision) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Association proposal conflict' });
      }
      return { data: decision, message: 'Association proposed', success: true };
    }),

  applyAssociation: repositoryWriteProcedure
    .input(decisionIdInput)
    .mutation(async ({ ctx, input }) => {
      const decision = await ctx.repositoryModel.applyAssociation(input.decisionId);
      if (!decision) throw new TRPCError({ code: 'NOT_FOUND', message: 'Decision not found' });
      return { data: decision, message: 'Association applied', success: true };
    }),

  rejectAssociation: repositoryWriteProcedure
    .input(decisionIdInput.extend({ resolutionNote: z.string().max(2_000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const decision = await ctx.repositoryModel.rejectAssociation(
        input.decisionId,
        input.resolutionNote,
      );
      if (!decision) throw new TRPCError({ code: 'NOT_FOUND', message: 'Decision not found' });
      return { data: decision, message: 'Association rejected', success: true };
    }),

  /** Revoke an applied decision — removes the relation row it wrote. */
  revokeAssociation: repositoryWriteProcedure
    .input(decisionIdInput.extend({ resolutionNote: z.string().max(2_000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const decision = await ctx.repositoryModel.revokeAssociation(
        input.decisionId,
        input.resolutionNote,
      );
      if (!decision) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Applied decision not found',
        });
      }
      return { data: decision, message: 'Association revoked', success: true };
    }),

  associationDecisions: repositoryProcedure
    .input(
      z
        .object({
          sourceId: z.string().min(1).optional(),
          sourceKind: z.enum(['project', 'task', 'team']).optional(),
          status: z.enum(['applied', 'proposed', 'rejected', 'revoked']).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      return { data: await ctx.repositoryModel.listDecisions(input ?? {}), success: true };
    }),

  /**
   * Deterministic execution-resource resolution for a task. `ok: false` with
   * `ambiguous`/`unresolved` is a blocking answer — the dispatcher must never
   * silently pick a candidate.
   */
  resolveForTask: repositoryProcedure
    .input(z.object({ taskId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return { data: await ctx.repositoryModel.resolveForTask(input.taskId), success: true };
    }),
});
