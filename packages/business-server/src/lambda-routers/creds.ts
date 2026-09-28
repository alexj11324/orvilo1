import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { cloudWorkspaceAuth } from '@/business/server/trpc-middlewares/workspaceAuth';
import { authedProcedure, router } from '@/libs/trpc/lambda';
import { marketUserInfo, serverDatabase } from '@/libs/trpc/lambda/middleware';
import { OwnCredsService } from '@/server/services/creds';
import { MarketService } from '@/server/services/market';

/**
 * Personal-scope credentials router — the Orvilo-owned replacement for
 * `market.creds`. Every row is pinned to `owner_user_id = ctx.userId` with
 * `workspace_id IS NULL`; the Market SDK is only used for the pieces that stay
 * there by design (OAuth connect broker, skill declarations, sandbox runtime
 * that `inject` writes env into). No `requireMarketAuth`: callers authenticate
 * as Orvilo users and Market calls go out under the trusted-client identity.
 */
const credsProcedure = authedProcedure
  .use(serverDatabase)
  // Verifies `X-Workspace-Id` when present so `sharedToActiveWorkspace`,
  // `share` and scope selection can never target a workspace the caller isn't
  // a member of.
  .use(cloudWorkspaceAuth)
  .use(marketUserInfo)
  .use(async (opts) => {
    const { ctx } = opts;
    if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED' });

    const marketService = new MarketService({
      accessToken: ctx.marketAccessToken,
      userInfo: ctx.marketUserInfo,
    });

    return opts.next({
      ctx: {
        credsService: new OwnCredsService({
          marketService,
          serverDB: ctx.serverDB,
          userId: ctx.userId,
          workspaceId: ctx.workspaceId ?? undefined,
        }),
      },
    });
  });

const wrapInternal = (domain: string, error: unknown): never => {
  if (error instanceof TRPCError) throw error;
  console.error(`[creds:${domain}]`, error);
  throw new TRPCError({
    cause: error,
    code: 'INTERNAL_SERVER_ERROR',
    message: `Failed to ${domain}`,
  });
};

const createBaseInput = {
  description: z.string().optional(),
  key: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
};

export const credsRouter = router({
  createFile: credsProcedure
    .input(
      z.object({
        ...createBaseInput,
        fileHashId: z.string().min(1),
        fileName: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const data = await ctx.credsService.createFile({ ...input, workspaceScope: false });
        return { data, success: true };
      } catch (error) {
        wrapInternal('createFile', error);
      }
    }),

  createKV: credsProcedure
    .input(
      z.object({
        ...createBaseInput,
        type: z.enum(['kv-env', 'kv-header']),
        values: z.record(z.string(), z.string()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const data = await ctx.credsService.createKV({ ...input, workspaceScope: false });
        return { data, success: true };
      } catch (error) {
        wrapInternal('createKV', error);
      }
    }),

  createOAuth: credsProcedure
    .input(z.object({ ...createBaseInput, oauthConnectionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const data = await ctx.credsService.createOAuth({ ...input, workspaceScope: false });
        return { data, success: true };
      } catch (error) {
        wrapInternal('createOAuth', error);
      }
    }),

  delete: credsProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    try {
      return await ctx.credsService.delete(input.id, false);
    } catch (error) {
      wrapInternal('delete', error);
    }
  }),

  deleteByKey: credsProcedure
    .input(z.object({ key: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.credsService.deleteByKey(input.key);
      } catch (error) {
        wrapInternal('deleteByKey', error);
      }
    }),

  get: credsProcedure
    .input(z.object({ decrypt: z.boolean().optional(), id: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        const data = await ctx.credsService.getPersonal(input.id, { decrypt: input.decrypt });
        return { data, success: true };
      } catch (error) {
        wrapInternal('get', error);
      }
    }),

  getByKey: credsProcedure
    .input(z.object({ decrypt: z.boolean().optional(), key: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        const data = await ctx.credsService.getPersonalByKey(input.key, {
          decrypt: input.decrypt,
        });
        return { data, success: true };
      } catch (error) {
        wrapInternal('getByKey', error);
      }
    }),

  getSkillCredStatus: credsProcedure
    .input(z.object({ skillIdentifier: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        return await ctx.credsService.getSkillCredStatus(input.skillIdentifier);
      } catch (error) {
        wrapInternal('getSkillCredStatus', error);
      }
    }),

  // `userId` stays in the input for shape compatibility with the Market
  // contract, but credentials are always resolved for the authenticated
  // caller — a caller must never inject into a session they don't own.
  inject: credsProcedure
    .input(
      z.object({
        keys: z.array(z.string()),
        sandbox: z.boolean().optional().default(true),
        topicId: z.string(),
        userId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.credsService.inject({
          keys: input.keys,
          sandbox: input.sandbox,
          topicId: input.topicId,
        });
      } catch (error) {
        wrapInternal('inject', error);
      }
    }),

  injectForSkill: credsProcedure
    .input(
      z.object({
        sandbox: z.boolean().optional().default(true),
        skillIdentifier: z.string(),
        topicId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.credsService.injectForSkill(input);
      } catch (error) {
        wrapInternal('injectForSkill', error);
      }
    }),

  list: credsProcedure.query(async ({ ctx }) => {
    try {
      return await ctx.credsService.listPersonal();
    } catch (error) {
      wrapInternal('list', error);
    }
  }),

  listOAuthConnections: credsProcedure.query(async ({ ctx }) => {
    try {
      return await ctx.credsService.listOAuthConnections();
    } catch (error) {
      wrapInternal('listOAuthConnections', error);
    }
  }),

  publish: credsProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    try {
      const data = await ctx.credsService.publish(input.id);
      return { data, success: true };
    } catch (error) {
      wrapInternal('publish', error);
    }
  }),

  share: credsProcedure
    .input(
      z.object({
        id: z.string(),
        visibility: z.enum(['private', 'public']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const data = await ctx.credsService.share(input.id, { visibility: input.visibility });
        return { data, success: true };
      } catch (error) {
        wrapInternal('share', error);
      }
    }),

  unshare: credsProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    try {
      const data = await ctx.credsService.unshare(input.id);
      return { data, success: true };
    } catch (error) {
      wrapInternal('unshare', error);
    }
  }),

  update: credsProcedure
    .input(
      z.object({
        description: z.string().optional(),
        id: z.string(),
        name: z.string().min(1).max(255).optional(),
        values: z.record(z.string(), z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const data = await ctx.credsService.update({ ...input, workspaceScope: false });
        return { data, success: true };
      } catch (error) {
        wrapInternal('update', error);
      }
    }),

  uploadFile: credsProcedure
    .input(
      z.object({
        file: z.string(),
        fileName: z.string().min(1),
        fileType: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.credsService.uploadFile(input);
      } catch (error) {
        wrapInternal('uploadFile', error);
      }
    }),
});
