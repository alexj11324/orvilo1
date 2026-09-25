import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { withScopedPermission } from '@/business/server/trpc-middlewares/rbacPermission';
import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { TaskCommentDraftModel } from '@/database/models/taskCommentDraft';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';

const draftProcedure = wsCompatProcedure.use(serverDatabase).use(async ({ ctx, next }) =>
  next({
    ctx: {
      taskCommentDraftModel: new TaskCommentDraftModel(
        ctx.serverDB,
        ctx.userId,
        ctx.workspaceId ?? undefined,
      ),
    },
  }),
);

const draftWriteProcedure = draftProcedure.use(withScopedPermission('agent:update'));
const taskIdInput = z.object({ taskId: z.string().min(1) });

export const taskDraftRouter = router({
  count: draftProcedure.query(async ({ ctx }) => ({
    data: await ctx.taskCommentDraftModel.count(),
    success: true,
  })),

  delete: draftWriteProcedure.input(taskIdInput).mutation(async ({ ctx, input }) => ({
    data: await ctx.taskCommentDraftModel.delete(input.taskId),
    message: 'Draft deleted',
    success: true,
  })),

  deleteAll: draftWriteProcedure.mutation(async ({ ctx }) => ({
    data: await ctx.taskCommentDraftModel.deleteAll(),
    message: 'Drafts deleted',
    success: true,
  })),

  get: draftProcedure.input(taskIdInput).query(async ({ ctx, input }) => ({
    data: await ctx.taskCommentDraftModel.get(input.taskId),
    success: true,
  })),

  list: draftProcedure.query(async ({ ctx }) => ({
    data: await ctx.taskCommentDraftModel.list(),
    success: true,
  })),

  upsert: draftWriteProcedure
    .input(
      taskIdInput.extend({
        content: z.string().max(100_000),
        editorData: z.unknown().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.taskCommentDraftModel.upsert(
        input.taskId,
        input.content,
        input.editorData,
      );
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
      return { data: row, message: 'Draft saved', success: true };
    }),
});
