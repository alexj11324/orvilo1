import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { withRbacPermission } from '@/business/server/trpc-middlewares/rbacPermission';
import { wsMemberProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { router } from '@/libs/trpc/lambda';
import { marketUserInfo, serverDatabase } from '@/libs/trpc/lambda/middleware';
import { OwnCredsService } from '@/server/services/creds';
import { MarketService } from '@/server/services/market';

/**
 * Workspace-scope credentials router — the Orvilo-owned replacement for
 * Market's `organizations.creds`. `wsMemberProcedure` requires and verifies
 * membership of `X-Workspace-Id`, so `ctx.workspaceId` here is trustworthy.
 *
 * `list` merges org-owned rows (`ownerType: 'organization'`) with personal
 * rows members shared in (`ownerType: 'user'`); manage operations pin
 * `workspace_id` rows only — member-shared creds are mutated through the
 * personal `creds` router by their owner, mirroring the Market split.
 */
const workspaceCredsProcedure = wsMemberProcedure
  .use(serverDatabase)
  .use(marketUserInfo)
  .use(async (opts) => {
    const { ctx } = opts;

    const marketService = new MarketService({
      accessToken: ctx.marketAccessToken,
      userInfo: ctx.marketUserInfo,
    });

    return opts.next({
      ctx: {
        credsService: new OwnCredsService({
          marketService,
          serverDB: ctx.serverDB,
          userId: ctx.userId!,
          workspaceId: ctx.workspaceId!,
        }),
      },
    });
  });

const workspaceCredsManageProcedure = workspaceCredsProcedure.use(
  withRbacPermission('workspace:update:all'),
);

const wrapInternal = (domain: string, error: unknown): never => {
  if (error instanceof TRPCError) throw error;
  console.error(`[workspaceCreds:${domain}]`, error);
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

export const workspaceCredsRouter = router({
  createFile: workspaceCredsManageProcedure
    .input(
      z.object({
        ...createBaseInput,
        fileHashId: z.string().min(1),
        fileName: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const data = await ctx.credsService.createFile({ ...input, workspaceScope: true });
        return { data, success: true };
      } catch (error) {
        wrapInternal('createFile', error);
      }
    }),

  createKV: workspaceCredsManageProcedure
    .input(
      z.object({
        ...createBaseInput,
        type: z.enum(['kv-env', 'kv-header']),
        values: z.record(z.string(), z.string()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const data = await ctx.credsService.createKV({ ...input, workspaceScope: true });
        return { data, success: true };
      } catch (error) {
        wrapInternal('createKV', error);
      }
    }),

  createOAuth: workspaceCredsManageProcedure
    .input(z.object({ ...createBaseInput, oauthConnectionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const data = await ctx.credsService.createOAuth({ ...input, workspaceScope: true });
        return { data, success: true };
      } catch (error) {
        wrapInternal('createOAuth', error);
      }
    }),

  delete: workspaceCredsManageProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.credsService.delete(input.id, true);
      } catch (error) {
        wrapInternal('delete', error);
      }
    }),

  get: workspaceCredsManageProcedure
    .input(z.object({ decrypt: z.boolean().optional(), id: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        const data = await ctx.credsService.getWorkspace(input.id, { decrypt: input.decrypt });
        return { data, success: true };
      } catch (error) {
        wrapInternal('get', error);
      }
    }),

  getByKey: workspaceCredsManageProcedure
    .input(z.object({ decrypt: z.boolean().optional(), key: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        const data = await ctx.credsService.getWorkspaceByKey(input.key, {
          decrypt: input.decrypt,
        });
        return { data, success: true };
      } catch (error) {
        wrapInternal('getByKey', error);
      }
    }),

  list: workspaceCredsProcedure.query(async ({ ctx }) => {
    try {
      return await ctx.credsService.listWorkspace();
    } catch (error) {
      wrapInternal('list', error);
    }
  }),

  listOAuthConnections: workspaceCredsManageProcedure.query(async ({ ctx }) => {
    try {
      return await ctx.credsService.listOAuthConnections();
    } catch (error) {
      wrapInternal('listOAuthConnections', error);
    }
  }),

  update: workspaceCredsManageProcedure
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
        const data = await ctx.credsService.update({ ...input, workspaceScope: true });
        return { data, success: true };
      } catch (error) {
        wrapInternal('update', error);
      }
    }),

  uploadFile: workspaceCredsManageProcedure
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
