/**
 * Client mirror of `apps/server/src/services/pullRequestReview` response
 * shapes. The server owns the contract — keep these structural, no brand-new
 * client-only fields.
 */

/**
 * What a review write attempt resolved to. `unknown` means the request's
 * outcome could not be confirmed (the response was lost mid-flight) — the
 * draft must be kept and the same operation retried, never silently re-minted.
 */
export type WriteOutcome = 'applied' | 'failed' | 'unknown';

export interface PullRequestCollection<T> {
  completeness: 'complete' | 'partial' | 'unknown';
  endCursor: string | null;
  hasMore: boolean;
  items: T[];
  loaded: number;
  total: number | null;
}

export interface ReviewRateLimit {
  cost: number | null;
  remaining: number | null;
  resetAt: string | null;
}

export interface NormalizedCheckItem {
  detailsUrl: string | null;
  name: string;
  rawConclusion: string | null;
  rawStatus: string | null;
  status: 'failing' | 'passed' | 'pending' | 'unknown';
}

export interface CheckSummary {
  failing: number;
  loaded: boolean;
  passed: number;
  pending: number;
  state: 'failing' | 'partial' | 'passed' | 'pending' | 'unknown';
  total: number;
  unknown: number;
}

export interface ReviewFile {
  additions: number;
  deletions: number;
  filename: string;
  patch: string | null;
  previousFilename: string | null;
  status: string;
}

export interface ReviewThreadComment {
  author: string | null;
  authorAvatar: string | null;
  body: string;
  createdAt: string | null;
  id: string | null;
  line: number | null;
  outdated: boolean;
  path: string | null;
  side: 'LEFT' | 'RIGHT' | null;
}

export interface ReviewThread {
  comments: PullRequestCollection<ReviewThreadComment>;
  diffSide: 'LEFT' | 'RIGHT' | null;
  id: string;
  isOutdated: boolean;
  isResolved: boolean;
  line: number | null;
  path: string | null;
  startDiffSide: 'LEFT' | 'RIGHT' | null;
  startLine: number | null;
  viewerCanReply: boolean;
}

export interface ReviewEntry {
  appliedHeadSha: string | null;
  author: string | null;
  authorAvatar: string | null;
  body: string;
  databaseId: number | null;
  id: string | null;
  state: string | null;
  submittedAt: string | null;
}

export interface PullRequestDetail {
  additions: number;
  author: string | null;
  authorAvatar: string | null;
  baseRef: string | null;
  body: string;
  changedFiles: number;
  checks: PullRequestCollection<NormalizedCheckItem> & { summary: CheckSummary };
  deletions: number;
  files: PullRequestCollection<ReviewFile>;
  headRef: string | null;
  headSha: string | null;
  id: string;
  isDraft: boolean;
  mergeable: string | null;
  number: number;
  rateLimit: ReviewRateLimit | null;
  repositoryPermission: string | null;
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
  reviews: PullRequestCollection<ReviewEntry>;
  reviewSession: {
    pendingReviewCreatedAt: string | null;
    pendingReviewId: string | null;
  };
  snapshotId: string;
  state: string | null;
  threads: PullRequestCollection<ReviewThread>;
  title: string;
  url: string;
  viewerLogin: string | null;
}

export interface PageResponse<T> extends PullRequestCollection<T> {
  collection: string;
  headSha: string | null;
  rateLimit: ReviewRateLimit | null;
  stale: boolean;
}
