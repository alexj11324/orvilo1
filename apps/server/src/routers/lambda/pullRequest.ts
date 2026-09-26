import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { PullRequestReviewReceiptModel } from '@/database/models/pullRequestReviewReceipt';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import {
  PullRequestReviewError,
  PullRequestReviewService,
} from '@/server/services/pullRequestReview';
import { GitHubAuthorizationExpiredError } from '@/server/services/pullRequestReview/githubOAuthProxy';

import { assertPullRequestReviewWriteEnabled } from './_helpers/pullRequestReviewWriteGate';

const reviewProcedure = wsCompatProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;
  return opts.next({
    ctx: {
      pullRequestReviews: new PullRequestReviewService(ctx.userId, ctx.workspaceId ?? undefined, {
        db: ctx.serverDB,
        receipts: new PullRequestReviewReceiptModel(ctx.serverDB),
      }),
    },
  });
});

/**
 * Read procedures authenticate with the caller's personal GitHub OAuth
 * connection. Writes additionally require an active workspace — accounts
 * always run inside one, and this is the capability boundary between "can
 * read pull requests" and "may publish review writes as a workspace actor".
 * `cloudWorkspaceAuth` has already verified membership for the scoped
 * workspace by the time this middleware runs.
 */
const reviewWriteProcedure = reviewProcedure.use(async (opts) => {
  const { ctx } = opts;
  if (!ctx.workspaceId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Review writes require an active workspace',
    });
  }
  return opts.next();
});

/**
 * Write-path idempotency key — required so every write lands inside a claimed
 * operation identity. The review client derives it from the intent payload, so
 * a retried click replays the same operation instead of minting a new write.
 */
const operationIdSchema = z.string().min(8).max(128);
const observedHeadShaSchema = z
  .string()
  .regex(/^[0-9a-f]{7,64}$/i, 'observedHeadSha must be a git sha');
const snapshotIdSchema = z.string().min(8).max(128).optional();

const mapError = (procedure: string, error: unknown): never => {
  if (error instanceof GitHubAuthorizationExpiredError) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error.message });
  }
  if (error instanceof PullRequestReviewError) {
    if (error.code === 'GITHUB_NOT_CONNECTED') {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error.message });
    }
    if (error.code === 'NOT_FOUND') {
      throw new TRPCError({ code: 'NOT_FOUND', message: error.message });
    }
    if (error.code === 'INVALID_REVIEW_ID' || error.code === 'THREAD_MISMATCH') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: `${error.code}: ${error.message}` });
    }
    if (error.code === 'PERMISSION_DENIED') {
      throw new TRPCError({ code: 'FORBIDDEN', message: `${error.code}: ${error.message}` });
    }
    if (
      error.code === 'HEAD_DRIFTED' ||
      error.code === 'STALE_SNAPSHOT' ||
      error.code === 'PENDING_REVIEW_CONFLICT' ||
      error.code === 'OPERATION_CONFLICT' ||
      error.code === 'OUTCOME_UNKNOWN'
    ) {
      throw new TRPCError({ code: 'CONFLICT', message: `${error.code}: ${error.message}` });
    }
    console.error(`[pullRequest:${procedure}]`, error);
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `${error.code}: ${error.message}`,
    });
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
  /** Line-anchored comment on the observed head diff. `line` is the side's line number. */
  addFileComment: reviewWriteProcedure
    .input(
      z.object({
        body: z.string().trim().min(1).max(65_535),
        id: z.string().min(1),
        line: z.number().int().positive(),
        observedHeadSha: observedHeadShaSchema,
        operationId: operationIdSchema,
        path: z.string().min(1),
        side: z.enum(['LEFT', 'RIGHT']).optional(),
        snapshotId: snapshotIdSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPullRequestReviewWriteEnabled();
      try {
        const result = await ctx.pullRequestReviews.addFileComment({
          body: input.body,
          id: input.id,
          line: input.line,
          observedHeadSha: input.observedHeadSha,
          operationId: input.operationId,
          path: input.path,
          side: input.side,
          snapshotId: input.snapshotId,
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
        return {
          data: {
            ...(await ctx.pullRequestReviews.pullRequest(input.id)),
            reviewWritesEnabled: process.env.ORVILO_PR_REVIEW_WRITE === '1',
          },
          success: true,
        };
      } catch (error) {
        mapError('detail', error);
      }
    }),

  /**
   * Next page of one detail collection (files / threads / reviews / comments /
   * checks). The response re-reads the head: `stale` marks the page when the
   * head moved since the snapshot the client is paging through.
   */
  page: reviewProcedure
    .input(
      z.object({
        collection: z.enum(['files', 'threads', 'reviews', 'comments', 'checks']),
        cursor: z.string().nullish(),
        expectedHeadSha: z.string().nullish(),
        id: z.string().min(1),
        threadId: z.string().min(1).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        return {
          data: await ctx.pullRequestReviews.page({
            collection: input.collection,
            cursor: input.cursor,
            expectedHeadSha: input.expectedHeadSha,
            id: input.id,
            threadId: input.threadId,
          }),
          success: true,
        };
      } catch (error) {
        mapError('page', error);
      }
    }),

  /**
   * `/reviews` PR queue — real GitHub pull requests addressed to the viewer.
   * 'for-me' = open non-draft PRs authored by the viewer OR carrying a
   * pending review request for them (the Linear "For you" lane); 'created' =
   * the viewer's own open PRs. A disconnected GitHub account surfaces as a
   * PRECONDITION_FAILED error with the connect path, never an empty queue.
   * `cursor` pages the queue; `hasMore`/`completeness` tell the client the
   * list is partial rather than complete.
   */
  queue: reviewProcedure
    .input(
      z.object({
        cursor: z.string().nullish(),
        tab: z.enum(['created', 'for-me']).default('for-me'),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        return {
          data: await ctx.pullRequestReviews.reviewQueue({
            cursor: input.cursor,
            tab: input.tab,
          }),
          success: true,
        };
      } catch (error) {
        mapError('queue', error);
      }
    }),

  replyThread: reviewWriteProcedure
    .input(
      z.object({
        body: z.string().trim().min(1).max(65_535),
        id: z.string().min(1),
        observedHeadSha: observedHeadShaSchema,
        operationId: operationIdSchema,
        snapshotId: snapshotIdSchema,
        threadId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPullRequestReviewWriteEnabled();
      try {
        const result = await ctx.pullRequestReviews.replyToThread({
          body: input.body,
          id: input.id,
          observedHeadSha: input.observedHeadSha,
          operationId: input.operationId,
          snapshotId: input.snapshotId,
          threadId: input.threadId,
        });
        return { data: result, success: true };
      } catch (error) {
        mapError('replyThread', error);
      }
    }),

  submitReview: reviewWriteProcedure
    .input(
      z.object({
        body: z.string().max(65_535).optional(),
        event: z.enum(['APPROVE', 'COMMENT', 'REQUEST_CHANGES']),
        id: z.string().min(1),
        observedHeadSha: observedHeadShaSchema,
        operationId: operationIdSchema,
        reviewSessionId: z.string().min(1).optional(),
        snapshotId: snapshotIdSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPullRequestReviewWriteEnabled();
      try {
        const result = await ctx.pullRequestReviews.submitReview({
          body: input.body,
          event: input.event,
          id: input.id,
          observedHeadSha: input.observedHeadSha,
          operationId: input.operationId,
          reviewSessionId: input.reviewSessionId,
          snapshotId: input.snapshotId,
        });
        return { data: result, success: true };
      } catch (error) {
        mapError('submitReview', error);
      }
    }),
});
