import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { wsMemberProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { CollaborationService } from '@/server/services/collaboration';

const roomSchema = z.object({
  id: z.string().min(1),
  scope: z.enum(['project', 'task', 'workspace']),
});

const collaborationProcedure = wsMemberProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;
  if (!ctx.workspaceId) {
    // Rooms are workspace-scoped — without a workspace selector there is
    // nothing to authorize against.
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'workspaceId is required' });
  }
  return opts.next({
    ctx: {
      collaboration: new CollaborationService(ctx.serverDB, ctx.userId, ctx.workspaceId),
    },
  });
});

/**
 * Realtime room authorization and reconnect snapshots. Naming a room grants
 * nothing — the service re-verifies scope, tenant binding and caller
 * visibility before minting the short-lived ticket the gateway requires.
 */
export const collaborationRouter = router({
  authorize: collaborationProcedure
    .input(z.object({ room: roomSchema }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await ctx.collaboration.authorize(input.room);
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error('[collaboration:authorize]', error);
        throw new TRPCError({
          cause: error,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to authorize room',
        });
      }
    }),

  // Polling fallback for clients without a WebSocket path: the same room
  // authz, then presence + recent authorized activity events.
  snapshot: collaborationProcedure
    .input(z.object({ cursor: z.string().optional(), room: roomSchema }))
    .query(async ({ input, ctx }) => {
      try {
        return await ctx.collaboration.snapshot({ cursor: input.cursor, room: input.room });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error('[collaboration:snapshot]', error);
        throw new TRPCError({
          cause: error,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to load room snapshot',
        });
      }
    }),
});
