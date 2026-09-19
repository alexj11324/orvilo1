import { createGitHubMarketTransport } from '@orvilo/connector-data/github';
import { z } from 'zod';

import { MarketService } from '@/server/services/market';

/**
 * Real PR review surface backed by the user's GitHub OAuth connection (Market
 * proxy). A pull request's canonical id is `gh:<host>:<owner>/<repo>#<number>`
 * — it never depends on a local Task row, so a PR with no task link still lists
 * and completes review (F02).
 */

const GITHUB_HOST = 'github.com';
const QUEUE_PAGE_SIZE = 30;
const FILES_PAGE_SIZE = 100;

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
  return { host, number, owner, repo };
};

export class PullRequestReviewError extends Error {
  constructor(
    public readonly code:
      'GITHUB_NOT_CONNECTED' | 'INVALID_REVIEW_ID' | 'NOT_FOUND' | 'PROVIDER_ERROR',
    message: string,
  ) {
    super(message);
    this.name = 'PullRequestReviewError';
  }
}

const authorSchema = z
  .object({ avatarUrl: z.string().optional(), login: z.string().optional() })
  .nullable()
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

const searchResponseSchema = z.object({
  search: z.object({
    issueCount: z.number(),
    nodes: z.array(queueItemSchema),
  }),
});

const checkContextSchema = z.object({
  completedAt: z.string().nullable().optional(),
  conclusion: z.string().nullable().optional(),
  context: z.string().optional(),
  detailsUrl: z.string().nullable().optional(),
  name: z.string().optional(),
  startedAt: z.string().nullable().optional(),
  state: z.string().optional(),
  status: z.string().optional(),
  targetUrl: z.string().nullable().optional(),
  typename: z.string().optional(),
});

const threadCommentSchema = z.object({
  author: authorSchema,
  body: z.string(),
  createdAt: z.string().optional(),
  databaseId: z.number().nullable().optional(),
  line: z.number().nullable().optional(),
  outdated: z.boolean().optional(),
  path: z.string().nullable().optional(),
  side: z.string().nullable().optional(),
});

const detailResponseSchema = z.object({
  repository: z
    .object({
      pullRequest: z
        .object({
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
                          contexts: z
                            .object({ nodes: z.array(checkContextSchema) })
                            .nullable()
                            .optional(),
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
          reviewDecision: z
            .enum(['APPROVED', 'CHANGES_REQUESTED', 'REVIEW_REQUIRED'])
            .nullable()
            .optional(),
          reviewThreads: z
            .object({
              nodes: z.array(
                z.object({
                  comments: z
                    .object({ nodes: z.array(threadCommentSchema) })
                    .nullable()
                    .optional(),
                  id: z.string(),
                  isResolved: z.boolean().optional(),
                  line: z.number().nullable().optional(),
                  path: z.string().nullable().optional(),
                }),
              ),
            })
            .optional(),
          reviews: z
            .object({
              nodes: z.array(
                z.object({
                  author: authorSchema,
                  body: z.string().optional(),
                  databaseId: z.number().nullable().optional(),
                  state: z.string().optional(),
                  submittedAt: z.string().optional(),
                }),
              ),
            })
            .optional(),
          state: z.string().optional(),
          title: z.string(),
          url: z.string(),
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

const submitReviewResponseSchema = z.object({
  submitPullRequestReview: z
    .object({
      pullRequestReview: z
        .object({
          databaseId: z.number().nullable().optional(),
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
      comment: z.object({ databaseId: z.number().nullable().optional() }).nullable().optional(),
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

const SEARCH_QUERY = `
query PullRequestReviewQueue($query: String!, $first: Int!) {
  search(query: $query, type: ISSUE, first: $first) {
    issueCount
    nodes {
      ... on PullRequest {
        number
        title
        url
        isDraft
        additions
        deletions
        changedFiles
        reviewDecision
        updatedAt
        author { login avatarUrl }
        repository { nameWithOwner databaseId }
      }
    }
  }
}`;

const DETAIL_QUERY = `
query PullRequestDetail($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      id
      number
      title
      body
      url
      state
      isDraft
      additions
      deletions
      changedFiles
      mergeable
      reviewDecision
      baseRefName
      headRefName
      headRefOid
      author { login avatarUrl }
      commits(last: 1) {
        nodes {
          commit {
            oid
            statusCheckRollup {
              state
              contexts(first: 30) {
                nodes {
                  __typename
                  ... on CheckRun { name status conclusion startedAt completedAt detailsUrl }
                  ... on StatusContext { context state targetUrl }
                }
              }
            }
          }
        }
      }
      reviewThreads(first: 50) {
        nodes {
          id
          isResolved
          path
          line
          comments(first: 20) {
            nodes {
              databaseId
              body
              createdAt
              path
              line
              side
              outdated
              author { login avatarUrl }
            }
          }
        }
      }
      reviews(first: 30) {
        nodes {
          databaseId
          body
          state
          submittedAt
          author { login avatarUrl }
        }
      }
    }
  }
}`;

export class PullRequestReviewService {
  constructor(
    private readonly userId: string,
    private readonly workspaceId?: string,
  ) {}

  private async transport() {
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
  }

  /** For-me = open PRs with a pending review request; created = my own open PRs. */
  reviewQueue = async (tab: 'created' | 'for-me') => {
    const { transport } = await this.transport();
    const viewer = await transport.getAuthenticatedUser();
    const search =
      tab === 'for-me'
        ? `is:pr is:open -is:draft review-requested:${viewer.login}`
        : `is:pr is:open author:${viewer.login}`;
    const response = await transport.request<{ first: number; query: string }>({
      operation: 'PullRequestReviewQueue',
      query: SEARCH_QUERY,
      variables: { first: QUEUE_PAGE_SIZE, query: search },
    });
    const parsed = searchResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new PullRequestReviewError('PROVIDER_ERROR', parsed.error.message);
    }
    return {
      connected: true,
      items: parsed.data.search.nodes.map((node) => ({
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
      })),
      total: parsed.data.search.issueCount,
      viewer: viewer.login,
    };
  };

  pullRequest = async (reviewId: string) => {
    const id = parsePullRequestReviewId(reviewId);
    const { market, transport } = await this.transport();
    const response = await transport.request<{
      number: number;
      owner: string;
      repo: string;
    }>({
      operation: 'PullRequestDetail',
      query: DETAIL_QUERY,
      variables: { number: id.number, owner: id.owner, repo: id.repo },
    });
    const parsed = detailResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new PullRequestReviewError('PROVIDER_ERROR', parsed.error.message);
    }
    const pullRequest = parsed.data.repository?.pullRequest;
    if (!pullRequest) {
      throw new PullRequestReviewError('NOT_FOUND', 'Pull request not found or not readable');
    }

    // Unified patches only exist on the REST surface — GraphQL never returns them.
    const filesResponse = await market.proxyOAuthRequest({
      endpoint: `/repos/${encodeURIComponent(id.owner)}/${encodeURIComponent(id.repo)}/pulls/${id.number}/files`,
      method: 'GET',
      parameters: [{ in: 'query', name: 'per_page', value: FILES_PAGE_SIZE }],
      provider: 'github',
    });
    if (filesResponse.status < 200 || filesResponse.status >= 300) {
      throw new PullRequestReviewError(
        'PROVIDER_ERROR',
        `GitHub files request returned ${filesResponse.status}`,
      );
    }
    const files = z.array(fileSchema).parse(filesResponse.data ?? []);

    const rollup = pullRequest.commits?.nodes?.[0]?.commit.statusCheckRollup;
    return {
      additions: pullRequest.additions ?? 0,
      author: pullRequest.author?.login ?? null,
      authorAvatar: pullRequest.author?.avatarUrl ?? null,
      baseRef: pullRequest.baseRefName ?? null,
      body: pullRequest.body ?? '',
      changedFiles: pullRequest.changedFiles ?? files.length,
      checks: (rollup?.contexts?.nodes ?? []).map((context) => ({
        conclusion: context.conclusion ?? null,
        detailsUrl: context.detailsUrl ?? context.targetUrl ?? null,
        name: context.name ?? context.context ?? 'check',
        status: context.status ?? context.state ?? null,
      })),
      checksState: rollup?.state ?? null,
      deletions: pullRequest.deletions ?? 0,
      files: files.map((file) => ({
        additions: file.additions ?? 0,
        deletions: file.deletions ?? 0,
        filename: file.filename,
        patch: file.patch ?? null,
        previousFilename: file.previousFilename ?? null,
        status: file.status ?? 'modified',
      })),
      headRef: pullRequest.headRefName ?? null,
      headSha: pullRequest.headRefOid ?? null,
      id: pullRequest.id,
      isDraft: pullRequest.isDraft ?? false,
      mergeable: pullRequest.mergeable ?? null,
      number: pullRequest.number,
      reviewDecision: pullRequest.reviewDecision ?? null,
      reviews: (pullRequest.reviews?.nodes ?? [])
        .filter((review) => review.state !== 'COMMENTED' || review.body)
        .map((review) => ({
          author: review.author?.login ?? null,
          authorAvatar: review.author?.avatarUrl ?? null,
          body: review.body ?? '',
          state: review.state ?? null,
          submittedAt: review.submittedAt ?? null,
        })),
      state: pullRequest.state ?? null,
      threads: (pullRequest.reviewThreads?.nodes ?? []).map((thread) => ({
        comments: (thread.comments?.nodes ?? []).map((comment) => ({
          author: comment.author?.login ?? null,
          authorAvatar: comment.author?.avatarUrl ?? null,
          body: comment.body,
          createdAt: comment.createdAt ?? null,
          line: comment.line ?? null,
          outdated: comment.outdated ?? false,
          path: comment.path ?? thread.path ?? null,
          side: comment.side ?? null,
        })),
        id: thread.id,
        isResolved: thread.isResolved ?? false,
        line: thread.line ?? null,
        path: thread.path ?? null,
      })),
      title: pullRequest.title,
      url: pullRequest.url,
    };
  };

  submitReview = async (params: {
    body?: string;
    event: 'APPROVE' | 'COMMENT' | 'REQUEST_CHANGES';
    reviewId: string;
  }) => {
    const detail = await this.pullRequest(params.reviewId);
    const { transport } = await this.transport();
    const response = await transport.request<{
      input: Record<string, unknown>;
    }>({
      operation: 'SubmitPullRequestReview',
      query: `mutation SubmitPullRequestReview($input: SubmitPullRequestReviewInput!) {
        submitPullRequestReview(input: $input) {
          pullRequestReview { databaseId state url }
        }
      }`,
      variables: {
        input: {
          body: params.body ?? '',
          event: params.event,
          pullRequestId: detail.id,
        },
      },
    });
    const parsed = submitReviewResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new PullRequestReviewError('PROVIDER_ERROR', parsed.error.message);
    }
    return {
      review: parsed.data.submitPullRequestReview?.pullRequestReview ?? null,
    };
  };

  replyToThread = async (params: { body: string; reviewId: string; threadId: string }) => {
    await this.pullRequest(params.reviewId); // readable check
    const { transport } = await this.transport();
    const response = await transport.request<{ input: Record<string, unknown> }>({
      operation: 'AddPullRequestReviewThreadReply',
      query: `mutation AddPullRequestReviewThreadReply($input: AddPullRequestReviewThreadReplyInput!) {
        addPullRequestReviewThreadReply(input: $input) {
          comment { databaseId }
        }
      }`,
      variables: {
        input: {
          body: params.body,
          pullRequestReviewThreadId: params.threadId,
        },
      },
    });
    const parsed = replyThreadResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new PullRequestReviewError('PROVIDER_ERROR', parsed.error.message);
    }
    return { commentId: parsed.data.addPullRequestReviewThreadReply?.comment?.databaseId ?? null };
  };

  /** Line-anchored comment on the latest head diff. `line` is the RIGHT-side line number. */
  addFileComment = async (params: {
    body: string;
    line: number;
    path: string;
    reviewId: string;
    side?: 'LEFT' | 'RIGHT';
  }) => {
    const detail = await this.pullRequest(params.reviewId);
    const { transport } = await this.transport();
    const response = await transport.request<{ input: Record<string, unknown> }>({
      operation: 'AddPullRequestReviewThread',
      query: `mutation AddPullRequestReviewThread($input: AddPullRequestReviewThreadInput!) {
        addPullRequestReviewThread(input: $input) {
          thread { id }
        }
      }`,
      variables: {
        input: {
          body: params.body,
          line: params.line,
          path: params.path,
          pullRequestId: detail.id,
          side: params.side ?? 'RIGHT',
        },
      },
    });
    const parsed = addThreadResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new PullRequestReviewError('PROVIDER_ERROR', parsed.error.message);
    }
    return { threadId: parsed.data.addPullRequestReviewThread?.thread?.id ?? null };
  };
}
