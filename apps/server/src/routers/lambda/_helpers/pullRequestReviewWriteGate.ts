import { TRPCError } from '@trpc/server';

/**
 * Server-side write gate for GitHub pull-request mutations
 * (pullRequest.addFileComment / replyThread / submitReview).
 *
 * These procedures post to GitHub under the caller's OAuth connection, so the
 * capability is opt-in per deployment: set ORVILO_PR_REVIEW_WRITE=1 to enable.
 * Default-off means a misconfigured or malicious client cannot write to a
 * review surface the deployment has not signed off on. Read paths (queue,
 * detail) stay open regardless.
 */
export const assertPullRequestReviewWriteEnabled = () => {
  if (process.env.ORVILO_PR_REVIEW_WRITE !== '1') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Pull request review writes are disabled on this deployment',
    });
  }
};
