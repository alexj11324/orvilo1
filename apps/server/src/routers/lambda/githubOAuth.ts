import { TRPCError } from '@trpc/server';

import { authedProcedure, router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import {
  disconnectGitHubOAuth,
  getGitHubOAuthStatus,
  startGitHubOAuth,
} from '@/server/services/githubOAuth';

const githubOAuthProcedure = authedProcedure.use(serverDatabase);

export const githubOAuthRouter = router({
  disconnect: githubOAuthProcedure.mutation(async ({ ctx }) => {
    try {
      await disconnectGitHubOAuth({ db: ctx.serverDB, userId: ctx.userId });
      return { message: 'GitHub disconnected', success: true as const };
    } catch (error) {
      console.error('[githubOAuth:disconnect]', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Could not disconnect GitHub',
      });
    }
  }),
  start: githubOAuthProcedure.mutation(async ({ ctx }) => {
    try {
      return {
        data: { authorizationUrl: await startGitHubOAuth(ctx.userId) },
        success: true as const,
      };
    } catch (error) {
      console.error('[githubOAuth:start]', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Could not start GitHub authorization',
      });
    }
  }),
  status: githubOAuthProcedure.query(async ({ ctx }) => {
    try {
      return {
        data: await getGitHubOAuthStatus({ db: ctx.serverDB, userId: ctx.userId }),
        success: true as const,
      };
    } catch (error) {
      console.error('[githubOAuth:status]', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Could not get GitHub connection',
      });
    }
  }),
});
