import { createHash } from 'node:crypto';

/**
 * Snapshot / operation digests for the review-write contract.
 *
 * `snapshotId` pins the exact PR surface the reviewer was looking at: the PR
 * node id, the observed head, every loaded thread id and the loaded review
 * ids. Any change to the conversation or the head produces a different
 * snapshot, so a write arriving with a stale one is re-reviewed instead of
 * silently applied.
 */

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

export const REVIEW_SNAPSHOT_VERSION = 'v1';

export const computeReviewSnapshotId = (input: {
  changedFiles: number | null;
  headSha: string | null;
  pullRequestId: string;
  reviewIds: string[];
  threadIds: string[];
}): string =>
  sha256(
    [
      REVIEW_SNAPSHOT_VERSION,
      input.pullRequestId,
      input.headSha ?? '',
      String(input.changedFiles ?? ''),
      input.threadIds.join(','),
      input.reviewIds.join(','),
    ].join('|'),
  );

/**
 * Digest of one write's routed parameters. Replayed `operationId`s must carry
 * the same digest; a mismatch means the id was reused for different content.
 */
export const computeReviewOperationDigest = (input: Record<string, unknown>): string =>
  sha256(JSON.stringify(input, Object.keys(input).sort()));

/** Maps a submit event to the review state it produces once landed. */
export const REVIEW_EVENT_STATES = {
  APPROVE: 'APPROVED',
  COMMENT: 'COMMENTED',
  REQUEST_CHANGES: 'CHANGES_REQUESTED',
} as const;

export type ReviewSubmitEvent = keyof typeof REVIEW_EVENT_STATES;
