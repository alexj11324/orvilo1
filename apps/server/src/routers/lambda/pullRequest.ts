import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import {
  PullRequestReviewError,
  PullRequestReviewService,
} from '@/server/services/pullRequestReview';

import { assertPullRequestReviewWriteEnabled } from './_helpers/pullRequestReviewWriteGate';

const reviewProcedure = wsCompatProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;
  return opts.next({
    ctx: {
      pullRequestReviews: new PullRequestReviewService(ctx.userId, ctx.workspaceId ?? undefined),
    },
  });
});

const mapError = (procedure: string, error: unknown): never => {
  if (error instanceof PullRequestReviewError) {
    if (error.code === 'GITHUB_NOT_CONNECTED') {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error.message });
    }
    if (error.code === 'NOT_FOUND') {
      throw new TRPCError({ code: 'NOT_FOUND', message: error.message });
    }
    if (error.code === 'INVALID_REVIEW_ID') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: error.message });
    }
    console.error(`[pullRequest:${procedure}]`, error);
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
  if (error instanceof TRPCError) throw error;
  console.error(`[pullRequest:${procedure}]`, error);
  throw new TRPCError({
    cause: error,
    code: 'INTERNAL_SERVER_ERROR',
    message: 'GitHub pull request request failed',
  });
};

export const pullRequestRouter = router({
  /** Line-anchored comment on the head diff (`line` = RIGHT-side line number). */
  addFileComment: reviewProcedure
    .input(
      z.object({
        body: z.string().trim().min(1).max(65_535),
        id: z.string().min(1),
        line: z.number().int().positive(),
        path: z.string().min(1),
        side: z.enum(['LEFT', 'RIGHT']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPullRequestReviewWriteEnabled();
      try {
        const result = await ctx.pullRequestReviews.addFileComment({
          body: input.body,
          line: input.line,
          path: input.path,
          reviewId: input.id,
          side: input.side,
        });
        return { data: result, success: true };
      } catch (error) {
        mapError('addFileComment', error);
      }
    }),

  detail: reviewProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      try {
        return { data: await ctx.pullRequestReviews.pullRequest(input.id), success: true };
      } catch (error) {
        mapError('detail', error);
      }
    }),

  /**
   * `/reviews` PR queue — real GitHub pull requests addressed to the viewer.
   * 'for-me' = open non-draft PRs with a pending review request; 'created' =
   * the viewer's own open PRs. A disconnected GitHub account surfaces as a
   * PRECONDITION_FAILED error with the connect path, never an empty queue.
   */
  queue: reviewProcedure
    .input(z.object({ tab: z.enum(['created', 'for-me']).default('for-me') }))
    .query(async ({ ctx, input }) => {
      try {
        return { data: await ctx.pullRequestReviews.reviewQueue(input.tab), success: true };
      } catch (error) {
        mapError('queue', error);
      }
    }),

  replyThread: reviewProcedure
    .input(
      z.object({
        body: z.string().trim().min(1).max(65_535),
        id: z.string().min(1),
        threadId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPullRequestReviewWriteEnabled();
      try {
        const result = await ctx.pullRequestReviews.replyToThread({
          body: input.body,
          reviewId: input.id,
          threadId: input.threadId,
        });
        return { data: result, success: true };
      } catch (error) {
        mapError('replyThread', error);
      }
    }),

  submitReview: reviewProcedure
    .input(
      z.object({
        body: z.string().max(65_535).optional(),
        event: z.enum(['APPROVE', 'COMMENT', 'REQUEST_CHANGES']),
        id: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPullRequestReviewWriteEnabled();
      try {
        const result = await ctx.pullRequestReviews.submitReview({
          body: input.body,
          event: input.event,
          reviewId: input.id,
        });
        return { data: result, success: true };
      } catch (error) {
        mapError('submitReview', error);
      }
    }),
});
