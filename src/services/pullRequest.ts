import { lambdaClient } from '@/libs/trpc/client';

export type ReviewPageCollection = 'checks' | 'comments' | 'files' | 'reviews' | 'threads';

/**
 * Write inputs carry the review-write contract: `observedHeadSha` pins the
 * write to the head the reviewer actually saw, `snapshotId` identifies the
 * loaded conversation snapshot, and `operationId` — REQUIRED, derived from
 * the write intent — makes a retried submit idempotent instead of a blind
 * resubmit. `reviewSessionId` adopts an existing pending review.
 */
class PullRequestService {
  addFileComment = (input: {
    body: string;
    id: string;
    line: number;
    observedHeadSha: string;
    operationId: string;
    path: string;
    side?: 'LEFT' | 'RIGHT';
    snapshotId?: string;
  }) => lambdaClient.pullRequest.addFileComment.mutate(input);

  detail = (id: string) => lambdaClient.pullRequest.detail.query({ id });

  page = (input: {
    collection: ReviewPageCollection;
    cursor?: string | null;
    expectedHeadSha?: string | null;
    id: string;
    threadId?: string;
  }) => lambdaClient.pullRequest.page.query(input);

  queue = (tab: 'created' | 'for-me', cursor?: string | null) =>
    lambdaClient.pullRequest.queue.query({ cursor: cursor ?? null, tab });

  replyThread = (input: {
    body: string;
    id: string;
    observedHeadSha: string;
    operationId: string;
    snapshotId?: string;
    threadId: string;
  }) => lambdaClient.pullRequest.replyThread.mutate(input);

  submitReview = (input: {
    body?: string;
    event: 'APPROVE' | 'COMMENT' | 'REQUEST_CHANGES';
    id: string;
    observedHeadSha: string;
    operationId: string;
    reviewSessionId?: string;
    snapshotId?: string;
  }) => lambdaClient.pullRequest.submitReview.mutate(input);
}

export const pullRequestService = new PullRequestService();
