/**
 * PR review write-operation contracts.
 *
 * Receipt identity and persistence vocabulary for `pullRequestReview` service
 * writes (submitReview / replyToThread / addFileComment). The server records a
 * receipt per (userId, workspaceId, connectionId, repoId, pullRequestId,
 * operation, operationId) so a retried operationId replays its stored outcome
 * instead of applying the write twice.
 */

export const PULL_REQUEST_REVIEW_OPERATIONS = {
  ADD_FILE_COMMENT: 'addFileComment',
  REPLY_TO_THREAD: 'replyToThread',
  SUBMIT_REVIEW: 'submitReview',
} as const;

export type PullRequestReviewOperation =
  (typeof PULL_REQUEST_REVIEW_OPERATIONS)[keyof typeof PULL_REQUEST_REVIEW_OPERATIONS];

/**
 * Claim lifecycle + terminal outcomes, in order:
 * 'prepared' — the operation claimed its identity and authorized, but has not
 *   dispatched any remote mutation yet.
 * 'dispatched' — the remote mutation was sent; `remoteId` carries the remote
 *   object it acts on once known (the review node for a submit).
 * 'applied' — the write verifiably landed and the receipt carries the result.
 * 'outcome_unknown' — a mutation was attempted but its remote outcome could
 *   not be verified; the row exists so a replay never applies the write twice.
 */
export type PullRequestReviewReceiptStatus =
  'applied' | 'dispatched' | 'outcome_unknown' | 'prepared';

/** Receipt payload; shape depends on the operation that produced it. */
export interface PullRequestReviewReceiptData {
  comment?: {
    databaseId: number | null;
    id: string | null;
  };
  databaseId?: number | null;
  id?: string | null;
  state?: string | null;
  thread?: {
    id: string;
  };
  url?: string | null;
}
