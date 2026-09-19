import {
  createGitHubMarketTransport,
  type GitHubMarketClient,
  type GitHubMarketProxyRequest,
} from '@orvilo/connector-data/github';
import { z } from 'zod';

import { MarketService } from '@/server/services/market';

import {
  aggregateChecks,
  type CheckSummary,
  normalizeCheck,
  type NormalizedCheck,
  type RawCheckContext,
} from './checks';
import {
  ADD_THREAD_MUTATION,
  CHECKS_PAGE_QUERY,
  CREATE_PENDING_REVIEW_MUTATION,
  DETAIL_QUERY,
  QUEUE_QUERY,
  REPLY_THREAD_MUTATION,
  REVIEW_CONTEXT_QUERY,
  REVIEW_RECONCILE_QUERY,
  REVIEWS_PAGE_QUERY,
  SUBMIT_REVIEW_MUTATION,
  THREAD_COMMENTS_QUERY,
  THREADS_PAGE_QUERY,
} from './queries';
import {
  computeReviewOperationDigest,
  computeReviewSnapshotId,
  REVIEW_EVENT_STATES,
  type ReviewSubmitEvent,
} from './snapshot';

/**
 * Real PR review surface backed by the user's GitHub OAuth connection (Market
 * proxy). A pull request's canonical id is `gh:<host>:<owner>/<repo>#<number>`
 * — it never depends on a local Task row, so a PR with no task link still lists
 * and completes review (F02).
 *
 * Write path contract (v6):
 * - Every write re-verifies identity, repository permission, the routed PR,
 *   thread↔PR binding, the observed head and the request digest before a byte
 *   reaches GitHub.
 * - Head drift between what the reviewer saw and what the write would land on
 *   is an explicit `HEAD_DRIFTED` signal, never a silent apply.
 * - A pending review the viewer opened outside Orvilo is never silently
 *   submitted: the client must adopt it explicitly via `reviewSessionId`.
 * - A null/empty mutation payload is a provider error, not a success — and a
 *   timed-out write is reconciled against the remote before any retry.
 */

const GITHUB_HOST = 'github.com';
/** The Market transport speaks GitHub only — any other host is rejected here. */
const SUPPORTED_REVIEW_HOSTS = new Set([GITHUB_HOST]);

const QUEUE_PAGE_SIZE = 30;
const FILES_PAGE_SIZE = 100;
const THREADS_PAGE_SIZE = 20;
const THREAD_COMMENTS_PAGE_SIZE = 10;
const REVIEWS_PAGE_SIZE = 20;
const CHECKS_PAGE_SIZE = 50;

/** Permissions that allow the viewer to submit pull request reviews. */
const REVIEWABLE_PERMISSIONS = new Set(['ADMIN', 'MAINTAIN', 'READ', 'TRIAGE', 'WRITE']);

const OPERATION_LEDGER_LIMIT = 500;

export interface PullRequestReviewId {
  host: string;
  number: number;
  owner: string;
  repo: string;
}

export const formatPullRequestReviewId = (id: PullRequestReviewId): string =>
  `gh:${id.host}:${id.owner}:${id.repo}:${id.number}`;

export const parsePullRequestReviewId = (value: string): PullRequestReviewId => {
  const parts = value.split(':');
  if (parts.length !== 5 || parts[0] !== 'gh') {
    throw new PullRequestReviewError('INVALID_REVIEW_ID', `Unknown review id: ${value}`);
  }
  const [, host, owner, repo, rawNumber] = parts;
  const number = Number(rawNumber);
  if (!host || !owner || !repo || !Number.isSafeInteger(number) || number <= 0) {
    throw new PullRequestReviewError('INVALID_REVIEW_ID', `Unknown review id: ${value}`);
  }
  if (!SUPPORTED_REVIEW_HOSTS.has(host)) {
    throw new PullRequestReviewError(
      'INVALID_REVIEW_ID',
      `Unsupported review host: ${host} (the review transport only serves ${GITHUB_HOST})`,
    );
  }
  return { host, number, owner, repo };
};

export type PullRequestReviewErrorCode =
  | 'GITHUB_NOT_CONNECTED'
  | 'HEAD_DRIFTED'
  | 'INVALID_REVIEW_ID'
  | 'NOT_FOUND'
  | 'OPERATION_CONFLICT'
  | 'PENDING_REVIEW_CONFLICT'
  | 'PERMISSION_DENIED'
  | 'PROVIDER_ERROR'
  | 'REMOTE_EMPTY'
  | 'STALE_SNAPSHOT'
  | 'THREAD_MISMATCH';

export class PullRequestReviewError extends Error {
  constructor(
    public readonly code: PullRequestReviewErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PullRequestReviewError';
  }
}

// ---------------------------------------------------------------------------
// Wire shapes
// ---------------------------------------------------------------------------

export interface PullRequestCollection<T> {
  completeness: 'complete' | 'partial';
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

export interface ReviewThreadComment {
  author: string | null;
  authorAvatar: string | null;
  body: string;
  createdAt: string | null;
  id: string | null;
  line: number | null;
  outdated: boolean;
  path: string | null;
  /** Direction inherited from the owning thread (`diffSide`). */
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

export interface ReviewFile {
  additions: number;
  deletions: number;
  filename: string;
  patch: string | null;
  previousFilename: string | null;
  status: string;
}

export interface ReviewWriteReceipt<TData> {
  /** The head sha the write actually landed on. */
  appliedHeadSha: string | null;
  data: TData;
  /** Parameter digest echoed so the client can match the landed write. */
  digest: string;
  /** true when the write was recovered by reconciliation instead of resubmission. */
  reconciled: boolean;
}

// ---------------------------------------------------------------------------
// Response schemas (GraphQL envelope `data` payloads)
// ---------------------------------------------------------------------------

const authorSchema = z
  .object({
    avatarUrl: z.string().nullable().optional(),
    login: z.string().nullable().optional(),
  })
  .nullable()
  .optional();

const rateLimitSchema = z
  .object({
    cost: z.number().nullable().optional(),
    remaining: z.number().nullable().optional(),
    resetAt: z.string().nullable().optional(),
  })
  .nullable()
  .optional();

const pageInfoSchema = z
  .object({
    endCursor: z.string().nullable().optional(),
    hasNextPage: z.boolean().optional(),
  })
  .optional();

const queueItemSchema = z.object({
  additions: z.number().optional(),
  author: authorSchema,
  changedFiles: z.number().optional(),
  deletions: z.number().optional(),
  isDraft: z.boolean().optional(),
  number: z.number(),
  repository: z.object({
    databaseId: z.number().optional(),
    nameWithOwner: z.string(),
  }),
  reviewDecision: z
    .enum(['APPROVED', 'CHANGES_REQUESTED', 'REVIEW_REQUIRED'])
    .nullable()
    .optional(),
  title: z.string(),
  updatedAt: z.string().optional(),
  url: z.string(),
});

const queueResponseSchema = z.object({
  rateLimit: rateLimitSchema,
  search: z.object({
    issueCount: z.number(),
    nodes: z.array(queueItemSchema),
    pageInfo: pageInfoSchema,
  }),
});

const checkContextSchema = z.object({
  __typename: z.string().optional(),
  completedAt: z.string().nullable().optional(),
  conclusion: z.string().nullable().optional(),
  context: z.string().optional(),
  detailsUrl: z.string().nullable().optional(),
  name: z.string().optional(),
  startedAt: z.string().nullable().optional(),
  state: z.string().optional(),
  status: z.string().optional(),
  targetUrl: z.string().nullable().optional(),
});

const checksConnectionSchema = z.object({
  nodes: z.array(checkContextSchema),
  pageInfo: pageInfoSchema,
  totalCount: z.number().optional(),
});

const threadCommentSchema = z.object({
  author: authorSchema,
  body: z.string(),
  createdAt: z.string().optional(),
  databaseId: z.number().nullable().optional(),
  id: z.string().optional(),
  line: z.number().nullable().optional(),
  outdated: z.boolean().optional(),
  path: z.string().nullable().optional(),
});

const threadCommentsConnectionSchema = z.object({
  nodes: z.array(threadCommentSchema),
  pageInfo: pageInfoSchema,
  totalCount: z.number().optional(),
});

const diffSideSchema = z.enum(['LEFT', 'RIGHT']).nullable().optional();

const threadNodeSchema = z.object({
  comments: threadCommentsConnectionSchema.nullable().optional(),
  diffSide: diffSideSchema,
  id: z.string(),
  isOutdated: z.boolean().optional(),
  isResolved: z.boolean().optional(),
  line: z.number().nullable().optional(),
  path: z.string().nullable().optional(),
  startDiffSide: diffSideSchema,
  startLine: z.number().nullable().optional(),
  viewerCanReply: z.boolean().optional(),
});

const threadsConnectionSchema = z.object({
  nodes: z.array(threadNodeSchema),
  pageInfo: pageInfoSchema,
  totalCount: z.number().optional(),
});

const pendingReviewSchema = z.object({
  author: authorSchema,
  createdAt: z.string().optional(),
  id: z.string(),
  state: z.string().optional(),
});

const reviewNodeSchema = z.object({
  author: authorSchema,
  body: z.string().optional(),
  commit: z.object({ oid: z.string() }).nullable().optional(),
  databaseId: z.number().nullable().optional(),
  id: z.string().optional(),
  state: z.string().optional(),
  submittedAt: z.string().optional(),
});

const pullRequestCoreSchema = z.object({
  additions: z.number().optional(),
  author: authorSchema,
  baseRefName: z.string().optional(),
  body: z.string().optional(),
  changedFiles: z.number().optional(),
  commits: z
    .object({
      nodes: z
        .array(
          z.object({
            commit: z.object({
              oid: z.string(),
              statusCheckRollup: z
                .object({
                  contexts: checksConnectionSchema.nullable().optional(),
                  state: z.string().nullable().optional(),
                })
                .nullable()
                .optional(),
            }),
          }),
        )
        .optional(),
    })
    .optional(),
  deletions: z.number().optional(),
  headRefName: z.string().optional(),
  headRefOid: z.string().optional(),
  id: z.string(),
  isDraft: z.boolean().optional(),
  mergeable: z.string().nullable().optional(),
  number: z.number(),
  pendingReviews: z.object({ nodes: z.array(pendingReviewSchema) }).optional(),
  reviewDecision: z
    .enum(['APPROVED', 'CHANGES_REQUESTED', 'REVIEW_REQUIRED'])
    .nullable()
    .optional(),
  reviews: z
    .object({
      nodes: z.array(reviewNodeSchema),
      pageInfo: pageInfoSchema,
      totalCount: z.number().optional(),
    })
    .optional(),
  reviewThreads: threadsConnectionSchema.optional(),
  state: z.string().optional(),
  title: z.string(),
  url: z.string(),
});

const detailResponseSchema = z.object({
  rateLimit: rateLimitSchema,
  repository: z
    .object({
      pullRequest: pullRequestCoreSchema.nullable(),
      viewerPermission: z.string().nullable().optional(),
    })
    .nullable(),
  viewer: z.object({ login: z.string().optional() }).nullable().optional(),
});

const contextResponseSchema = z.object({
  rateLimit: rateLimitSchema,
  repository: z
    .object({
      pullRequest: z
        .object({
          changedFiles: z.number().optional(),
          headRefOid: z.string().optional(),
          id: z.string(),
          number: z.number(),
          pendingReviews: z.object({ nodes: z.array(pendingReviewSchema) }).optional(),
          reviews: z.object({ nodes: z.array(reviewNodeSchema) }).optional(),
          reviewThreads: z
            .object({
              nodes: z.array(z.object({ id: z.string() })),
              totalCount: z.number().optional(),
            })
            .optional(),
        })
        .nullable(),
      viewerPermission: z.string().nullable().optional(),
    })
    .nullable(),
  viewer: z.object({ login: z.string().optional() }).nullable().optional(),
});

const threadsPageResponseSchema = z.object({
  rateLimit: rateLimitSchema,
  repository: z
    .object({
      pullRequest: z
        .object({
          headRefOid: z.string().optional(),
          id: z.string(),
          reviewThreads: threadsConnectionSchema.optional(),
        })
        .nullable(),
    })
    .nullable(),
});

const reviewsPageResponseSchema = z.object({
  rateLimit: rateLimitSchema,
  repository: z
    .object({
      pullRequest: z
        .object({
          headRefOid: z.string().optional(),
          id: z.string(),
          reviews: z
            .object({
              nodes: z.array(reviewNodeSchema),
              pageInfo: pageInfoSchema,
              totalCount: z.number().optional(),
            })
            .optional(),
        })
        .nullable(),
    })
    .nullable(),
});

const checksPageResponseSchema = z.object({
  rateLimit: rateLimitSchema,
  repository: z
    .object({
      pullRequest: z
        .object({
          commits: z
            .object({
              nodes: z
                .array(
                  z.object({
                    commit: z.object({
                      oid: z.string(),
                      statusCheckRollup: z
                        .object({ contexts: checksConnectionSchema.nullable().optional() })
                        .nullable()
                        .optional(),
                    }),
                  }),
                )
                .optional(),
            })
            .optional(),
          headRefOid: z.string().optional(),
          id: z.string(),
        })
        .nullable(),
    })
    .nullable(),
});

const threadCommentsResponseSchema = z.object({
  node: z
    .object({
      comments: threadCommentsConnectionSchema.nullable().optional(),
      diffSide: diffSideSchema,
      id: z.string(),
      path: z.string().nullable().optional(),
      pullRequest: z
        .object({
          headRefOid: z.string().optional(),
          id: z.string(),
          number: z.number(),
        })
        .optional(),
      repository: z.object({ nameWithOwner: z.string() }).optional(),
      viewerCanReply: z.boolean().optional(),
    })
    .nullable(),
  rateLimit: rateLimitSchema,
});

const reconcileResponseSchema = z.object({
  repository: z
    .object({
      pullRequest: z
        .object({
          headRefOid: z.string().optional(),
          id: z.string(),
          reviews: z.object({ nodes: z.array(reviewNodeSchema) }).optional(),
        })
        .nullable(),
    })
    .nullable(),
});

const fileSchema = z.object({
  additions: z.number().optional(),
  deletions: z.number().optional(),
  filename: z.string(),
  patch: z.string().optional(),
  previousFilename: z.string().optional(),
  sha: z.string().optional(),
  status: z.string().optional(),
});

const pullHeadSchema = z.object({
  head: z.object({ sha: z.string() }).optional(),
});

const createReviewResponseSchema = z.object({
  addPullRequestReview: z
    .object({
      pullRequestReview: z
        .object({
          databaseId: z.number().nullable().optional(),
          id: z.string().optional(),
          state: z.string().optional(),
        })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
});

const submitReviewResponseSchema = z.object({
  submitPullRequestReview: z
    .object({
      pullRequestReview: z
        .object({
          commit: z.object({ oid: z.string() }).nullable().optional(),
          databaseId: z.number().nullable().optional(),
          id: z.string().optional(),
          state: z.string().optional(),
          url: z.string().optional(),
        })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
});

const replyThreadResponseSchema = z.object({
  addPullRequestReviewThreadReply: z
    .object({
      comment: z
        .object({ databaseId: z.number().nullable().optional(), id: z.string().optional() })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
});

const addThreadResponseSchema = z.object({
  addPullRequestReviewThread: z
    .object({
      thread: z.object({ id: z.string().optional() }).nullable().optional(),
    })
    .nullable()
    .optional(),
});

// ---------------------------------------------------------------------------
// GraphQL transport shape (structural — satisfied by the Market transport)
// ---------------------------------------------------------------------------

interface GraphQLTransport {
  getAuthenticatedUser: () => Promise<{ id: number | string; login: string }>;
  request: <Variables extends Record<string, unknown>>(input: {
    operation: string;
    query: string;
    variables: Variables;
  }) => Promise<unknown>;
}

/** Injectable clients — tests provide fakes; production uses Market. */
export interface PullRequestReviewServiceDeps {
  market?: GitHubMarketClient;
  transport?: GraphQLTransport;
}

interface WriteContext {
  headSha: string;
  pendingReview: { createdAt: string | null; id: string; login: string | null } | null;
  pullRequestId: string;
  rateLimit: ReviewRateLimit | null;
  reviews: {
    author: string | null;
    body: string;
    commitSha: string | null;
    id: string | null;
    state: string | null;
    submittedAt: string | null;
  }[];
  snapshotId: string;
  viewerLogin: string | null;
}

interface OperationRecord {
  digest: string;
  receipt: ReviewWriteReceipt<unknown>;
}

const operationLedger = new Map<string, OperationRecord>();

const rememberOperation = (operationId: string, record: OperationRecord) => {
  if (operationLedger.size >= OPERATION_LEDGER_LIMIT) {
    const oldest = operationLedger.keys().next().value;
    if (oldest !== undefined) operationLedger.delete(oldest);
  }
  operationLedger.set(operationId, record);
};

const toRateLimit = (value: z.infer<typeof rateLimitSchema> | undefined): ReviewRateLimit | null =>
  value
    ? {
        cost: value.cost ?? null,
        remaining: value.remaining ?? null,
        resetAt: value.resetAt ?? null,
      }
    : null;

const toCollection = <T>(
  items: T[],
  page: { endCursor?: string | null; hasNextPage?: boolean; total?: number | null },
): PullRequestCollection<T> => {
  const total = page.total ?? null;
  const hasMore = page.hasNextPage ?? (total !== null ? items.length < total : false);
  return {
    completeness: hasMore ? 'partial' : 'complete',
    endCursor: page.endCursor ?? null,
    hasMore,
    items,
    loaded: items.length,
    total,
  };
};

/**
 * GitHub REST `files[].patch` is hunk-only (`@@ …`); diff renderers parse the
 * `--- a/…` / `+++ b/…` file headers, so synthesize them around the hunk.
 * Patches that already carry headers (or `diff --git`) pass through.
 */
const FILE_PATCH_HEADER = /^(?:diff --git|---\s)/;
const withPatchHeaders = (
  filename: string,
  previousFilename: string | null | undefined,
  patch: string | null | undefined,
): string | null => {
  if (!patch) return null;
  if (FILE_PATCH_HEADER.test(patch)) return patch;
  return `--- a/${previousFilename ?? filename}\n+++ b/${filename}\n${patch}`;
};

const mapThreadComment = (
  comment: z.infer<typeof threadCommentSchema>,
  side: 'LEFT' | 'RIGHT' | null,
  threadPath: string | null,
): ReviewThreadComment => ({
  author: comment.author?.login ?? null,
  authorAvatar: comment.author?.avatarUrl ?? null,
  body: comment.body,
  createdAt: comment.createdAt ?? null,
  id: comment.id ?? null,
  line: comment.line ?? null,
  outdated: comment.outdated ?? false,
  path: comment.path ?? threadPath,
  side,
});

const mapThread = (thread: z.infer<typeof threadNodeSchema>): ReviewThread => {
  const diffSide = thread.diffSide ?? null;
  const comments = thread.comments;
  return {
    comments: toCollection(
      (comments?.nodes ?? []).map((comment) =>
        mapThreadComment(comment, diffSide, thread.path ?? null),
      ),
      {
        endCursor: comments?.pageInfo?.endCursor ?? null,
        hasNextPage: comments?.pageInfo?.hasNextPage ?? false,
        total: comments?.totalCount ?? null,
      },
    ),
    diffSide,
    id: thread.id,
    isOutdated: thread.isOutdated ?? false,
    isResolved: thread.isResolved ?? false,
    line: thread.line ?? null,
    path: thread.path ?? null,
    startDiffSide: thread.startDiffSide ?? null,
    startLine: thread.startLine ?? null,
    viewerCanReply: thread.viewerCanReply ?? false,
  };
};

const mapReviewEntry = (review: z.infer<typeof reviewNodeSchema>): ReviewEntry => ({
  appliedHeadSha: review.commit?.oid ?? null,
  author: review.author?.login ?? null,
  authorAvatar: review.author?.avatarUrl ?? null,
  body: review.body ?? '',
  databaseId: review.databaseId ?? null,
  id: review.id ?? null,
  state: review.state ?? null,
  submittedAt: review.submittedAt ?? null,
});

const requireParsed = <T>(
  result: { data?: T; error?: { message: string }; success: boolean },
  what: string,
): T => {
  if (!result.success || result.data === undefined) {
    throw new PullRequestReviewError(
      'PROVIDER_ERROR',
      `${what}: ${result.error?.message ?? 'invalid response'}`,
    );
  }
  return result.data;
};

const proxyResponseSchema = z.object({ data: z.unknown().optional(), status: z.number() });

export type ReviewPageCollection = 'checks' | 'comments' | 'files' | 'reviews' | 'threads';

export class PullRequestReviewService {
  constructor(
    private readonly userId: string,
    private readonly workspaceId?: string,
    private readonly deps: PullRequestReviewServiceDeps = {},
  ) {}

  private clients = async (): Promise<{
    market: GitHubMarketClient;
    transport: GraphQLTransport;
  }> => {
    if (this.deps.market && this.deps.transport) {
      return { market: this.deps.market, transport: this.deps.transport };
    }
    const market = new MarketService({
      userInfo: { userId: this.userId, workspaceId: this.workspaceId ?? undefined },
    });
    const status = await market.market.skills.getStatus('github');
    if (!status.success || !status.connected) {
      throw new PullRequestReviewError(
        'GITHUB_NOT_CONNECTED',
        'Connect GitHub in Settings → Integrations to review pull requests.',
      );
    }
    return {
      market,
      transport: createGitHubMarketTransport({ market }),
    };
  };

  private rest = async <T>(
    market: GitHubMarketClient,
    request: GitHubMarketProxyRequest,
    schema: z.ZodType<T>,
    what: string,
  ): Promise<T> => {
    const raw = await market.proxyOAuthRequest(request);
    const response = proxyResponseSchema.safeParse(raw);
    if (!response.success) {
      throw new PullRequestReviewError('PROVIDER_ERROR', `${what} returned an invalid envelope`);
    }
    if (response.data.status < 200 || response.data.status >= 300) {
      throw new PullRequestReviewError(
        'PROVIDER_ERROR',
        `${what} returned ${response.data.status}`,
      );
    }
    return requireParsed(schema.safeParse(response.data.data), what);
  };

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  /** For-me = open PRs with a pending review request; created = my own open PRs. */
  reviewQueue = async (params: { cursor?: string | null; tab: 'created' | 'for-me' }) => {
    const { transport } = await this.clients();
    const viewer = await transport.getAuthenticatedUser();
    const search =
      params.tab === 'for-me'
        ? `is:pr is:open -is:draft review-requested:${viewer.login}`
        : `is:pr is:open author:${viewer.login}`;
    const response = await transport.request<{
      after: string | null;
      first: number;
      query: string;
    }>({
      operation: 'PullRequestReviewQueue',
      query: QUEUE_QUERY,
      variables: { after: params.cursor ?? null, first: QUEUE_PAGE_SIZE, query: search },
    });
    const parsed = requireParsed(
      queueResponseSchema.safeParse(response),
      'GitHub queue response invalid',
    );
    const pageInfo = parsed.search.pageInfo;
    const items = parsed.search.nodes.map((node) => ({
      author: node.author?.login ?? null,
      authorAvatar: node.author?.avatarUrl ?? null,
      changedFiles: node.changedFiles ?? 0,
      deletions: node.deletions ?? 0,
      additions: node.additions ?? 0,
      id: formatPullRequestReviewId({
        host: GITHUB_HOST,
        number: node.number,
        owner: node.repository.nameWithOwner.split('/')[0] ?? '',
        repo: node.repository.nameWithOwner.split('/')[1] ?? node.repository.nameWithOwner,
      }),
      isDraft: node.isDraft ?? false,
      number: node.number,
      remoteRepositoryId: node.repository.databaseId ?? null,
      repository: node.repository.nameWithOwner,
      reviewDecision: node.reviewDecision ?? null,
      title: node.title,
      updatedAt: node.updatedAt ?? null,
      url: node.url,
    }));
    const page = toCollection(items, {
      endCursor: pageInfo?.endCursor ?? null,
      hasNextPage: pageInfo?.hasNextPage ?? false,
      total: parsed.search.issueCount,
    });
    return {
      ...page,
      connected: true,
      rateLimit: toRateLimit(parsed.rateLimit),
      viewer: viewer.login,
    };
  };

  pullRequest = async (reviewId: string) => {
    const id = parsePullRequestReviewId(reviewId);
    const { market, transport } = await this.clients();
    const response = await transport.request<{
      number: number;
      owner: string;
      repo: string;
    }>({
      operation: 'PullRequestDetail',
      query: DETAIL_QUERY,
      variables: { number: id.number, owner: id.owner, repo: id.repo },
    });
    const parsed = requireParsed(
      detailResponseSchema.safeParse(response),
      'GitHub detail response invalid',
    );
    const pullRequest = parsed.repository?.pullRequest;
    if (!pullRequest) {
      throw new PullRequestReviewError('NOT_FOUND', 'Pull request not found or not readable');
    }

    // Unified patches only exist on the REST surface — GraphQL never returns them.
    const files = await this.rest(
      market,
      {
        endpoint: `/repos/${encodeURIComponent(id.owner)}/${encodeURIComponent(id.repo)}/pulls/${id.number}/files`,
        method: 'GET',
        parameters: [{ in: 'query', name: 'per_page', value: FILES_PAGE_SIZE }],
        provider: 'github',
      },
      z.array(fileSchema),
      'GitHub files request',
    );

    const viewerLogin = parsed.viewer?.login ?? null;
    const pendingNode = (pullRequest.pendingReviews?.nodes ?? []).find(
      // GitHub only exposes pending reviews to their author; the login check is
      // defense-in-depth for proxies that widen visibility.
      (review) => review.author?.login === viewerLogin,
    );

    const rollup = pullRequest.commits?.nodes?.[0]?.commit.statusCheckRollup;
    const checkContexts: RawCheckContext[] = rollup?.contexts?.nodes ?? [];
    const normalizedChecks: NormalizedCheck[] = checkContexts.map((context) =>
      normalizeCheck(context),
    );
    const checksCollection = toCollection(normalizedChecks, {
      endCursor: rollup?.contexts?.pageInfo?.endCursor ?? null,
      hasNextPage: rollup?.contexts?.pageInfo?.hasNextPage ?? false,
      total: rollup?.contexts?.totalCount ?? null,
    });
    const checksSummary: CheckSummary = aggregateChecks(normalizedChecks, {
      complete: checksCollection.completeness === 'complete',
    });

    const threads = toCollection((pullRequest.reviewThreads?.nodes ?? []).map(mapThread), {
      endCursor: pullRequest.reviewThreads?.pageInfo?.endCursor ?? null,
      hasNextPage: pullRequest.reviewThreads?.pageInfo?.hasNextPage ?? false,
      total: pullRequest.reviewThreads?.totalCount ?? null,
    });
    const reviews = toCollection(
      (pullRequest.reviews?.nodes ?? [])
        .filter((review) => review.state !== 'COMMENTED' || review.body)
        .map(mapReviewEntry),
      {
        endCursor: pullRequest.reviews?.pageInfo?.endCursor ?? null,
        hasNextPage: pullRequest.reviews?.pageInfo?.hasNextPage ?? false,
        total: pullRequest.reviews?.totalCount ?? null,
      },
    );
    const filesTotal = pullRequest.changedFiles ?? files.length;
    const filesHasMore = files.length === FILES_PAGE_SIZE && files.length < filesTotal;

    const headSha = pullRequest.headRefOid ?? null;
    const snapshotId = computeReviewSnapshotId({
      changedFiles: pullRequest.changedFiles ?? files.length,
      headSha,
      pullRequestId: pullRequest.id,
      reviewIds: (pullRequest.reviews?.nodes ?? []).map((review) => review.id ?? ''),
      threadIds: (pullRequest.reviewThreads?.nodes ?? []).map((thread) => thread.id),
    });

    return {
      additions: pullRequest.additions ?? 0,
      author: pullRequest.author?.login ?? null,
      authorAvatar: pullRequest.author?.avatarUrl ?? null,
      baseRef: pullRequest.baseRefName ?? null,
      body: pullRequest.body ?? '',
      changedFiles: pullRequest.changedFiles ?? files.length,
      checks: {
        ...checksCollection,
        summary: checksSummary,
      },
      deletions: pullRequest.deletions ?? 0,
      files: {
        completeness: filesHasMore ? ('partial' as const) : ('complete' as const),
        // REST surfaces page numbers, not cursors — the next page is cursor '2'.
        endCursor: filesHasMore ? '2' : null,
        hasMore: filesHasMore,
        items: files.map((file) => ({
          additions: file.additions ?? 0,
          deletions: file.deletions ?? 0,
          filename: file.filename,
          patch: withPatchHeaders(file.filename, file.previousFilename ?? null, file.patch),
          previousFilename: file.previousFilename ?? null,
          status: file.status ?? 'modified',
        })),
        loaded: files.length,
        total: filesTotal,
      },
      headRef: pullRequest.headRefName ?? null,
      headSha,
      id: pullRequest.id,
      isDraft: pullRequest.isDraft ?? false,
      mergeable: pullRequest.mergeable ?? null,
      number: pullRequest.number,
      rateLimit: toRateLimit(parsed.rateLimit),
      repositoryPermission: parsed.repository?.viewerPermission ?? null,
      reviewDecision: pullRequest.reviewDecision ?? null,
      reviews,
      reviewSession: {
        pendingReviewCreatedAt: pendingNode?.createdAt ?? null,
        pendingReviewId: pendingNode?.id ?? null,
      },
      snapshotId,
      state: pullRequest.state ?? null,
      threads,
      title: pullRequest.title,
      url: pullRequest.url,
      viewerLogin,
    };
  };

  /**
   * On-demand page of one detail collection. The current head is always
   * re-read with the page: when it moved since the detail snapshot was taken,
   * `stale` comes back true and the caller must reload instead of appending.
   */
  page = async (params: {
    collection: ReviewPageCollection;
    cursor?: string | null;
    expectedHeadSha?: string | null;
    id: string;
    threadId?: string;
  }) => {
    const id = parsePullRequestReviewId(params.id);
    const { market, transport } = await this.clients();

    let headSha: string | null;
    let collection: PullRequestCollection<unknown>;
    let rateLimit: ReviewRateLimit | null = null;

    if (params.collection === 'files') {
      const pageNumber = Math.max(2, Number.parseInt(params.cursor ?? '2', 10) || 2);
      const [files, head] = await Promise.all([
        this.rest(
          market,
          {
            endpoint: `/repos/${encodeURIComponent(id.owner)}/${encodeURIComponent(id.repo)}/pulls/${id.number}/files`,
            method: 'GET',
            parameters: [
              { in: 'query', name: 'per_page', value: FILES_PAGE_SIZE },
              { in: 'query', name: 'page', value: pageNumber },
            ],
            provider: 'github',
          },
          z.array(fileSchema),
          'GitHub files request',
        ),
        this.rest(
          market,
          {
            endpoint: `/repos/${encodeURIComponent(id.owner)}/${encodeURIComponent(id.repo)}/pulls/${id.number}`,
            method: 'GET',
            provider: 'github',
          },
          pullHeadSchema,
          'GitHub pull request request',
        ),
      ]);
      headSha = head.head?.sha ?? null;
      const items: ReviewFile[] = files.map((file) => ({
        additions: file.additions ?? 0,
        deletions: file.deletions ?? 0,
        filename: file.filename,
        patch: withPatchHeaders(file.filename, file.previousFilename ?? null, file.patch),
        previousFilename: file.previousFilename ?? null,
        status: file.status ?? 'modified',
      }));
      collection = toCollection(items, {
        endCursor: files.length === FILES_PAGE_SIZE ? String(pageNumber + 1) : null,
        hasNextPage: files.length === FILES_PAGE_SIZE,
        total: null,
      });
    } else if (params.collection === 'comments') {
      if (!params.threadId) {
        throw new PullRequestReviewError('INVALID_REVIEW_ID', 'comments pages need a threadId');
      }
      const parsed = requireParsed(
        threadCommentsResponseSchema.safeParse(
          await transport.request<{ after: string | null; first: number; threadId: string }>({
            operation: 'PullRequestThreadComments',
            query: THREAD_COMMENTS_QUERY,
            variables: {
              after: params.cursor ?? null,
              first: THREAD_COMMENTS_PAGE_SIZE,
              threadId: params.threadId,
            },
          }),
        ),
        'GitHub thread response invalid',
      );
      const node = parsed.node;
      if (!node || node.id !== params.threadId) {
        throw new PullRequestReviewError('NOT_FOUND', 'Review thread not found');
      }
      // Thread↔PR binding: the node must belong to the routed pull request.
      this.assertThreadBinding(node, id);
      headSha = node.pullRequest?.headRefOid ?? null;
      const comments = node.comments;
      collection = toCollection(
        (comments?.nodes ?? []).map((comment) =>
          mapThreadComment(comment, node.diffSide ?? null, node.path ?? null),
        ),
        {
          endCursor: comments?.pageInfo?.endCursor ?? null,
          hasNextPage: comments?.pageInfo?.hasNextPage ?? false,
          total: comments?.totalCount ?? null,
        },
      );
      rateLimit = toRateLimit(parsed.rateLimit);
    } else {
      const query =
        params.collection === 'threads'
          ? THREADS_PAGE_QUERY
          : params.collection === 'reviews'
            ? REVIEWS_PAGE_QUERY
            : CHECKS_PAGE_QUERY;
      const operation =
        params.collection === 'threads'
          ? 'PullRequestThreadsPage'
          : params.collection === 'reviews'
            ? 'PullRequestReviewsPage'
            : 'PullRequestChecksPage';
      const variables = {
        after: params.cursor ?? null,
        first:
          params.collection === 'threads'
            ? THREADS_PAGE_SIZE
            : params.collection === 'reviews'
              ? REVIEWS_PAGE_SIZE
              : CHECKS_PAGE_SIZE,
        number: id.number,
        owner: id.owner,
        repo: id.repo,
      };
      const response = await transport.request<typeof variables>({
        operation,
        query,
        variables,
      });

      if (params.collection === 'threads') {
        const parsed = requireParsed(
          threadsPageResponseSchema.safeParse(response),
          'GitHub threads page invalid',
        );
        const pullRequest = parsed.repository?.pullRequest;
        if (!pullRequest) throw new PullRequestReviewError('NOT_FOUND', 'Pull request not found');
        headSha = pullRequest.headRefOid ?? null;
        const threads = pullRequest.reviewThreads;
        collection = toCollection((threads?.nodes ?? []).map(mapThread), {
          endCursor: threads?.pageInfo?.endCursor ?? null,
          hasNextPage: threads?.pageInfo?.hasNextPage ?? false,
          total: threads?.totalCount ?? null,
        });
        rateLimit = toRateLimit(parsed.rateLimit);
      } else if (params.collection === 'reviews') {
        const parsed = requireParsed(
          reviewsPageResponseSchema.safeParse(response),
          'GitHub reviews page invalid',
        );
        const pullRequest = parsed.repository?.pullRequest;
        if (!pullRequest) throw new PullRequestReviewError('NOT_FOUND', 'Pull request not found');
        headSha = pullRequest.headRefOid ?? null;
        const reviews = pullRequest.reviews;
        collection = toCollection((reviews?.nodes ?? []).map(mapReviewEntry), {
          endCursor: reviews?.pageInfo?.endCursor ?? null,
          hasNextPage: reviews?.pageInfo?.hasNextPage ?? false,
          total: reviews?.totalCount ?? null,
        });
        rateLimit = toRateLimit(parsed.rateLimit);
      } else {
        const parsed = requireParsed(
          checksPageResponseSchema.safeParse(response),
          'GitHub checks page invalid',
        );
        const pullRequest = parsed.repository?.pullRequest;
        if (!pullRequest) throw new PullRequestReviewError('NOT_FOUND', 'Pull request not found');
        headSha = pullRequest.headRefOid ?? null;
        const contexts = pullRequest.commits?.nodes?.[0]?.commit.statusCheckRollup?.contexts;
        collection = toCollection(
          (contexts?.nodes ?? []).map((context) => normalizeCheck(context)),
          {
            endCursor: contexts?.pageInfo?.endCursor ?? null,
            hasNextPage: contexts?.pageInfo?.hasNextPage ?? false,
            total: contexts?.totalCount ?? null,
          },
        );
        rateLimit = toRateLimit(parsed.rateLimit);
      }
    }

    return {
      ...collection,
      collection: params.collection,
      headSha,
      rateLimit,
      stale: params.expectedHeadSha
        ? headSha !== null && headSha !== params.expectedHeadSha
        : false,
    };
  };

  // -------------------------------------------------------------------------
  // Write verification
  // -------------------------------------------------------------------------

  private assertThreadBinding = (
    node: {
      pullRequest?: { id: string; number: number } | null | undefined;
      repository?: { nameWithOwner: string } | null | undefined;
    },
    id: PullRequestReviewId,
  ) => {
    const matches =
      node.pullRequest?.number === id.number &&
      node.repository?.nameWithOwner === `${id.owner}/${id.repo}`;
    if (!matches) {
      throw new PullRequestReviewError(
        'THREAD_MISMATCH',
        'The review thread does not belong to this pull request',
      );
    }
  };

  /**
   * Re-resolve everything a write depends on: the viewer identity, repository
   * permission, the current head, the pending review, and the snapshot the
   * caller claims to have seen. Any drift is a hard error before the mutation.
   */
  private loadWriteContext = async (params: {
    id: PullRequestReviewId;
    observedHeadSha?: string | null;
    snapshotId?: string | null;
  }): Promise<WriteContext & { transport: GraphQLTransport }> => {
    const { transport } = await this.clients();
    const response = await transport.request<{ number: number; owner: string; repo: string }>({
      operation: 'PullRequestReviewContext',
      query: REVIEW_CONTEXT_QUERY,
      variables: { number: params.id.number, owner: params.id.owner, repo: params.id.repo },
    });
    const parsed = requireParsed(
      contextResponseSchema.safeParse(response),
      'GitHub context response invalid',
    );
    const pullRequest = parsed.repository?.pullRequest;
    if (!pullRequest) {
      throw new PullRequestReviewError('NOT_FOUND', 'Pull request not found or not readable');
    }

    const permission = parsed.repository?.viewerPermission ?? null;
    if (permission !== null && !REVIEWABLE_PERMISSIONS.has(permission)) {
      throw new PullRequestReviewError(
        'PERMISSION_DENIED',
        'Your GitHub permission level does not allow reviewing this pull request',
      );
    }

    const headSha = pullRequest.headRefOid ?? null;
    if (params.observedHeadSha && headSha !== params.observedHeadSha) {
      throw new PullRequestReviewError(
        'HEAD_DRIFTED',
        `Pull request head moved (saw ${params.observedHeadSha.slice(0, 7)}, now ${(headSha ?? '').slice(0, 7)}) — re-review before submitting`,
      );
    }

    const viewerLogin = parsed.viewer?.login ?? null;
    const pendingNode = (pullRequest.pendingReviews?.nodes ?? []).find(
      (review) => review.author?.login === viewerLogin,
    );
    const threadNodes = pullRequest.reviewThreads?.nodes ?? [];
    const reviewNodes = pullRequest.reviews?.nodes ?? [];
    const snapshotId = computeReviewSnapshotId({
      changedFiles: pullRequest.changedFiles ?? null,
      headSha,
      pullRequestId: pullRequest.id,
      reviewIds: reviewNodes.map((review) => review.id ?? ''),
      threadIds: threadNodes.map((thread) => thread.id),
    });
    if (params.snapshotId && snapshotId !== params.snapshotId) {
      throw new PullRequestReviewError(
        'STALE_SNAPSHOT',
        'The pull request conversation changed since you loaded it — reload before writing',
      );
    }

    return {
      headSha: headSha ?? '',
      pendingReview: pendingNode
        ? {
            createdAt: pendingNode.createdAt ?? null,
            id: pendingNode.id,
            login: pendingNode.author?.login ?? null,
          }
        : null,
      pullRequestId: pullRequest.id,
      rateLimit: toRateLimit(parsed.rateLimit),
      reviews: reviewNodes.map((review) => ({
        author: review.author?.login ?? null,
        body: review.body ?? '',
        commitSha: review.commit?.oid ?? null,
        id: review.id ?? null,
        state: review.state ?? null,
        submittedAt: review.submittedAt ?? null,
      })),
      snapshotId,
      transport,
      viewerLogin,
    };
  };

  private checkOperation = (operationId: string | undefined, digest: string) => {
    if (!operationId) return;
    const prior = operationLedger.get(operationId);
    if (!prior) return;
    if (prior.digest !== digest) {
      throw new PullRequestReviewError(
        'OPERATION_CONFLICT',
        'operationId was already used for a different payload',
      );
    }
  };

  private replayOperation = <TData>(
    operationId: string | undefined,
    digest: string,
  ): ReviewWriteReceipt<TData> | null => {
    if (!operationId) return null;
    const prior = operationLedger.get(operationId);
    if (prior && prior.digest === digest) {
      return prior.receipt as ReviewWriteReceipt<TData>;
    }
    return null;
  };

  /**
   * After a timeout or an empty mutation payload, look for the review we may
   * already have landed: a submitted review by the viewer, in the requested
   * state, on the observed head, with the same body. A match means the first
   * attempt actually applied — returning its receipt instead of resubmitting.
   */
  private reconcileSubmittedReview = async (params: {
    event: ReviewSubmitEvent;
    body: string;
    id: PullRequestReviewId;
    observedHeadSha: string;
    transport: GraphQLTransport;
    viewerLogin: string | null;
  }) => {
    if (!params.viewerLogin) return null;
    const response = await params.transport.request<{
      number: number;
      owner: string;
      repo: string;
      viewer: string;
    }>({
      operation: 'PullRequestReviewReconcile',
      query: REVIEW_RECONCILE_QUERY,
      variables: {
        number: params.id.number,
        owner: params.id.owner,
        repo: params.id.repo,
        viewer: params.viewerLogin,
      },
    });
    const parsed = reconcileResponseSchema.safeParse(response);
    if (!parsed.success) return null;
    const reviews = parsed.data.repository?.pullRequest?.reviews?.nodes ?? [];
    const expectedState = REVIEW_EVENT_STATES[params.event];
    const landed = reviews.find(
      (review) =>
        review.state === expectedState &&
        review.body === params.body &&
        review.author?.login === params.viewerLogin &&
        (review.commit?.oid ?? params.observedHeadSha) === params.observedHeadSha,
    );
    if (!landed) return null;
    return {
      appliedHeadSha: landed.commit?.oid ?? params.observedHeadSha,
      data: {
        databaseId: landed.databaseId ?? null,
        id: landed.id ?? null,
        state: landed.state ?? null,
        url: null,
      },
      reconciled: true,
    };
  };

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  submitReview = async (params: {
    body?: string;
    event: ReviewSubmitEvent;
    id: string;
    observedHeadSha: string;
    operationId?: string;
    reviewSessionId?: string;
    snapshotId?: string;
  }): Promise<
    ReviewWriteReceipt<{
      databaseId: number | null;
      id: string | null;
      state: string | null;
      url: string | null;
    }>
  > => {
    const id = parsePullRequestReviewId(params.id);
    const body = params.body ?? '';
    const digest = computeReviewOperationDigest({
      body,
      event: params.event,
      id: params.id,
      op: 'submitReview',
      observedHeadSha: params.observedHeadSha,
    });
    this.checkOperation(params.operationId, digest);
    const replay = this.replayOperation<{
      databaseId: number | null;
      id: string | null;
      state: string | null;
      url: string | null;
    }>(params.operationId, digest);
    if (replay) return replay;

    const context = await this.loadWriteContext({
      id,
      observedHeadSha: params.observedHeadSha,
      snapshotId: params.snapshotId,
    });
    const { transport } = context;

    let reviewId: string | null;
    if (context.pendingReview) {
      // A pending review already exists on GitHub. It is only submitted when the
      // caller adopted it explicitly via reviewSessionId — otherwise the draft
      // was authored outside this flow and submitting it would be a silent take.
      if (!params.reviewSessionId) {
        throw new PullRequestReviewError(
          'PENDING_REVIEW_CONFLICT',
          'A pending review draft already exists on GitHub — adopt it explicitly before submitting',
        );
      }
      if (context.pendingReview.id !== params.reviewSessionId) {
        // The session's review is gone — it may already have been submitted on
        // another device. Reconcile before declaring the session dead.
        const landed = await this.reconcileSubmittedReview({
          body,
          event: params.event,
          id,
          observedHeadSha: params.observedHeadSha,
          transport,
          viewerLogin: context.viewerLogin,
        });
        if (landed) {
          const receipt = { ...landed, digest };
          if (params.operationId) {
            rememberOperation(params.operationId, { digest, receipt });
          }
          return receipt;
        }
        throw new PullRequestReviewError(
          'PENDING_REVIEW_CONFLICT',
          'The pending review for this session no longer exists on GitHub',
        );
      }
      reviewId = context.pendingReview.id;
    } else {
      if (params.reviewSessionId) {
        // The review the session recorded no longer exists.
        const landed = await this.reconcileSubmittedReview({
          body,
          event: params.event,
          id,
          observedHeadSha: params.observedHeadSha,
          transport,
          viewerLogin: context.viewerLogin,
        });
        if (landed) {
          const receipt = { ...landed, digest };
          if (params.operationId) {
            rememberOperation(params.operationId, { digest, receipt });
          }
          return receipt;
        }
        throw new PullRequestReviewError(
          'PENDING_REVIEW_CONFLICT',
          'The pending review for this session no longer exists on GitHub',
        );
      }
      // No pending review anywhere — create an Orvilo-owned one pinned to the
      // head the reviewer saw, then submit exactly that review.
      const created = await transport.request<{ input: Record<string, unknown> }>({
        operation: 'CreatePullRequestReview',
        query: CREATE_PENDING_REVIEW_MUTATION,
        variables: {
          input: {
            commitOID: params.observedHeadSha,
            pullRequestId: context.pullRequestId,
          },
        },
      });
      const createdParsed = requireParsed(
        createReviewResponseSchema.safeParse(created),
        'GitHub create review response invalid',
      );
      reviewId = createdParsed.addPullRequestReview?.pullRequestReview?.id ?? null;
      if (!reviewId) {
        throw new PullRequestReviewError(
          'REMOTE_EMPTY',
          'GitHub returned no pending review for the create operation',
        );
      }
    }

    let receipt: ReviewWriteReceipt<{
      databaseId: number | null;
      id: string | null;
      state: string | null;
      url: string | null;
    }>;
    try {
      const response = await transport.request<{ input: Record<string, unknown> }>({
        operation: 'SubmitPullRequestReview',
        query: SUBMIT_REVIEW_MUTATION,
        variables: {
          input: {
            body,
            event: params.event,
            pullRequestReviewId: reviewId,
          },
        },
      });
      const parsed = requireParsed(
        submitReviewResponseSchema.safeParse(response),
        'GitHub submit review response invalid',
      );
      const review = parsed.submitPullRequestReview?.pullRequestReview ?? null;
      if (!review) {
        // A null payload is not a success — reconcile the original operation.
        const landed = await this.reconcileSubmittedReview({
          body,
          event: params.event,
          id,
          observedHeadSha: params.observedHeadSha,
          transport,
          viewerLogin: context.viewerLogin,
        });
        if (landed) {
          receipt = { ...landed, digest };
        } else {
          throw new PullRequestReviewError(
            'REMOTE_EMPTY',
            'GitHub returned an empty submit-review payload',
          );
        }
      } else {
        receipt = {
          appliedHeadSha: review.commit?.oid ?? context.headSha,
          data: {
            databaseId: review.databaseId ?? null,
            id: review.id ?? null,
            state: review.state ?? null,
            url: review.url ?? null,
          },
          digest,
          reconciled: false,
        };
      }
    } catch (error) {
      if (error instanceof PullRequestReviewError) throw error;
      // Submission failed with an unknown remote state — reconcile before
      // reporting failure so a retried client can never double-submit.
      const landed = await this.reconcileSubmittedReview({
        body,
        event: params.event,
        id,
        observedHeadSha: params.observedHeadSha,
        transport,
        viewerLogin: context.viewerLogin,
      });
      if (landed) {
        receipt = { ...landed, digest };
      } else {
        throw error;
      }
    }

    if (params.operationId) {
      rememberOperation(params.operationId, { digest, receipt });
    }
    return receipt;
  };

  replyToThread = async (params: {
    body: string;
    id: string;
    observedHeadSha: string;
    operationId?: string;
    snapshotId?: string;
    threadId: string;
  }): Promise<
    ReviewWriteReceipt<{ comment: { databaseId: number | null; id: string | null } }>
  > => {
    const id = parsePullRequestReviewId(params.id);
    const digest = computeReviewOperationDigest({
      body: params.body,
      id: params.id,
      op: 'replyToThread',
      observedHeadSha: params.observedHeadSha,
      threadId: params.threadId,
    });
    this.checkOperation(params.operationId, digest);
    const replay = this.replayOperation<{
      comment: { databaseId: number | null; id: string | null };
    }>(params.operationId, digest);
    if (replay) return replay;

    const context = await this.loadWriteContext({
      id,
      observedHeadSha: params.observedHeadSha,
      snapshotId: params.snapshotId,
    });
    const { transport } = context;

    // Thread↔PR binding: resolve the thread node to its owning pull request
    // and repository — a thread lifted from another PR can never be answered
    // under the routed one.
    const binding = requireParsed(
      threadCommentsResponseSchema.safeParse(
        await transport.request<{ after: null; first: number; threadId: string }>({
          operation: 'PullRequestThreadComments',
          query: THREAD_COMMENTS_QUERY,
          variables: { after: null, first: 1, threadId: params.threadId },
        }),
      ),
      'GitHub thread response invalid',
    );
    const node = binding.node;
    if (!node || node.id !== params.threadId) {
      throw new PullRequestReviewError('NOT_FOUND', 'Review thread not found');
    }
    this.assertThreadBinding(node, id);
    if (node.pullRequest && node.pullRequest.id !== context.pullRequestId) {
      throw new PullRequestReviewError(
        'THREAD_MISMATCH',
        'The review thread does not belong to this pull request',
      );
    }
    if (node.viewerCanReply === false) {
      throw new PullRequestReviewError(
        'PERMISSION_DENIED',
        'You cannot reply to this review thread',
      );
    }

    const response = await transport.request<{ input: Record<string, unknown> }>({
      operation: 'AddPullRequestReviewThreadReply',
      query: REPLY_THREAD_MUTATION,
      variables: {
        input: {
          body: params.body,
          pullRequestReviewThreadId: params.threadId,
        },
      },
    });
    const parsed = requireParsed(
      replyThreadResponseSchema.safeParse(response),
      'GitHub reply response invalid',
    );
    const comment = parsed.addPullRequestReviewThreadReply?.comment ?? null;
    if (!comment || (comment.databaseId == null && !comment.id)) {
      throw new PullRequestReviewError('REMOTE_EMPTY', 'GitHub returned an empty reply payload');
    }
    const receipt: ReviewWriteReceipt<{
      comment: { databaseId: number | null; id: string | null };
    }> = {
      appliedHeadSha: context.headSha,
      data: { comment: { databaseId: comment.databaseId ?? null, id: comment.id ?? null } },
      digest,
      reconciled: false,
    };
    if (params.operationId) {
      rememberOperation(params.operationId, { digest, receipt });
    }
    return receipt;
  };

  /** Line-anchored comment on the observed head diff. `line` is the side's line number. */
  addFileComment = async (params: {
    body: string;
    id: string;
    line: number;
    observedHeadSha: string;
    operationId?: string;
    path: string;
    side?: 'LEFT' | 'RIGHT';
    snapshotId?: string;
  }): Promise<ReviewWriteReceipt<{ thread: { id: string } }>> => {
    const id = parsePullRequestReviewId(params.id);
    const digest = computeReviewOperationDigest({
      body: params.body,
      id: params.id,
      line: params.line,
      op: 'addFileComment',
      observedHeadSha: params.observedHeadSha,
      path: params.path,
      side: params.side ?? 'RIGHT',
    });
    this.checkOperation(params.operationId, digest);
    const replay = this.replayOperation<{ thread: { id: string } }>(params.operationId, digest);
    if (replay) return replay;

    const context = await this.loadWriteContext({
      id,
      observedHeadSha: params.observedHeadSha,
      snapshotId: params.snapshotId,
    });
    const { transport } = context;

    const response = await transport.request<{ input: Record<string, unknown> }>({
      operation: 'AddPullRequestReviewThread',
      query: ADD_THREAD_MUTATION,
      variables: {
        input: {
          body: params.body,
          line: params.line,
          path: params.path,
          pullRequestId: context.pullRequestId,
          side: params.side ?? 'RIGHT',
        },
      },
    });
    const parsed = requireParsed(
      addThreadResponseSchema.safeParse(response),
      'GitHub add thread response invalid',
    );
    const thread = parsed.addPullRequestReviewThread?.thread ?? null;
    if (!thread?.id) {
      throw new PullRequestReviewError(
        'REMOTE_EMPTY',
        'GitHub returned an empty review thread payload',
      );
    }
    const receipt: ReviewWriteReceipt<{ thread: { id: string } }> = {
      appliedHeadSha: context.headSha,
      data: { thread: { id: thread.id } },
      digest,
      reconciled: false,
    };
    if (params.operationId) {
      rememberOperation(params.operationId, { digest, receipt });
    }
    return receipt;
  };
}

export {
  aggregateChecks,
  type AggregateCheckState,
  type CheckSummary,
  normalizeCheck,
  type NormalizedCheck,
  type NormalizedCheckStatus,
  type RawCheckContext,
} from './checks';
export {
  computeReviewOperationDigest,
  computeReviewSnapshotId,
  REVIEW_EVENT_STATES,
} from './snapshot';
