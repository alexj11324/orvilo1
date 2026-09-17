import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  acceptInvitation,
  previewInvitation,
  resendInvitation,
  revokeInvitation,
} from '@/business/server/workspaceInvitation';
import { authedProcedure, router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';

const tokenInput = z.object({ token: z.string().min(1) });
const invitationIdInput = z.object({ invitationId: z.string().min(1) });

const wrapInternal = (domain: string, error: unknown): never => {
  if (error instanceof TRPCError) throw error;
  console.error(`[invitation:${domain}]`, error);
  throw new TRPCError({
    cause: error,
    code: 'INTERNAL_SERVER_ERROR',
    message: `Failed to ${domain}`,
  });
};

// The invitee is not a member yet, so these procedures gate on the session —
// not X-Workspace-Id. preview/accept authorize by token + verified account
// email; resend/revoke re-check the caller's admin role on the invitation's
// own workspace rather than trusting a caller-supplied tenant.
export const invitationRouter = router({
  accept: authedProcedure
    .use(serverDatabase)
    .input(tokenInput)
    .mutation(async ({ input, ctx }) => {
      try {
        return await acceptInvitation(ctx.serverDB, {
          ipAddress: ctx.clientIp ?? undefined,
          token: input.token,
          userId: ctx.userId,
        });
      } catch (error) {
        return wrapInternal('accept', error);
      }
    }),

  preview: authedProcedure
    .use(serverDatabase)
    .input(tokenInput)
    .query(async ({ input, ctx }) => {
      try {
        return await previewInvitation(ctx.serverDB, {
          token: input.token,
          userId: ctx.userId,
        });
      } catch (error) {
        return wrapInternal('preview', error);
      }
    }),

  resend: authedProcedure
    .use(serverDatabase)
    .input(invitationIdInput)
    .mutation(async ({ input, ctx }) => {
      try {
        return await resendInvitation(ctx.serverDB, {
          actorUserId: ctx.userId,
          invitationId: input.invitationId,
          ipAddress: ctx.clientIp ?? undefined,
        });
      } catch (error) {
        return wrapInternal('resend', error);
      }
    }),

  revoke: authedProcedure
    .use(serverDatabase)
    .input(invitationIdInput)
    .mutation(async ({ input, ctx }) => {
      try {
        return await revokeInvitation(ctx.serverDB, {
          actorUserId: ctx.userId,
          invitationId: input.invitationId,
          ipAddress: ctx.clientIp ?? undefined,
        });
      } catch (error) {
        return wrapInternal('revoke', error);
      }
    }),
});
