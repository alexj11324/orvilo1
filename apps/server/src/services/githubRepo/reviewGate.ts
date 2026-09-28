import type { RemotePrReviewSnapshot } from './reviewSnapshot';

/** GitHub-side readiness only; NOT a substitute for acceptance or writer/epoch ownership. */
export const isRemotePrMergeReady = (snapshot: RemotePrReviewSnapshot): boolean =>
  snapshot.open &&
  !snapshot.merged &&
  !snapshot.draft &&
  snapshot.mergeable === true &&
  snapshot.mergeableState === 'clean' &&
  (snapshot.reviewDecision === null || snapshot.reviewDecision === 'APPROVED') &&
  snapshot.requestedChangeReviewIds.length === 0 &&
  snapshot.requestedReviewers.length === 0 &&
  snapshot.unresolvedThreadIds.length === 0 &&
  snapshot.checks.pending.length === 0 &&
  snapshot.checks.failed.length === 0 &&
  snapshot.checks.successful.length > 0;
