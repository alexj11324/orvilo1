import { describe, expect, it, vi } from 'vitest';

import type { PullRequestReviewReceiptScope } from '@/database/models/pullRequestReviewReceipt';
import type {
  NewPullRequestReviewReceipt,
  PullRequestReviewReceiptItem,
} from '@/database/schemas/pullRequestReview';

import {
  formatPullRequestReviewId,
  parsePullRequestReviewId,
  PullRequestReviewError,
  type PullRequestReviewReceiptStore,
  PullRequestReviewService,
} from './index';
import { computeReviewSnapshotId } from './snapshot';

const githubStatus = vi.hoisted(() => ({
  getStatus: vi.fn<(id: string) => Promise<{ connected: boolean; success: boolean }>>(),
}));

// `clients()` only constructs MarketService when deps are not injected — most
// tests inject both, so this mock only engages for the connection-probe tests.
vi.mock('@/server/services/market', () => ({
  MarketService: class {
    market = { skills: { getStatus: githubStatus.getStatus } };
  },
}));

const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const HEAD_2 = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const REVIEW_ID = 'gh:github.com:octo-org:octo-repo:42';
const PR_NODE_ID = 'PR_kwDOtest';
const THREAD_ID = 'THREAD_node_1';
const VIEWER = 'devin-reviewer';
const VIEWER_DB_ID = 7;

const rateLimit = { cost: 1, remaining: 4999, resetAt: '2030-01-01T00:00:00Z' };

type Handler = (variables: Record<string, unknown>) => unknown;

interface RequestCall {
  operation: string;
  variables: Record<string, unknown>;
}

const createTransport = (handlers: Record<string, Handler>) => {
  const calls: RequestCall[] = [];
  const request = vi.fn(
    async (input: { operation: string; variables: RequestCall['variables'] }) => {
      calls.push({ operation: input.operation, variables: input.variables });
      const handler = handlers[input.operation];
      if (!handler) {
        throw new Error(`unexpected GraphQL operation ${input.operation}`);
      }
      return handler(input.variables);
    },
  );
  return {
    calls,
    getAuthenticatedUser: vi.fn(async () => ({ id: 7, login: VIEWER })),
    request,
  };
};

type FakeTransport = ReturnType<typeof createTransport>;

const createMarket = (files: unknown[] = [], headSha: string = HEAD) => ({
  proxyOAuthRequest: vi.fn(async (input: { endpoint: string; parameters?: { name: string }[] }) => {
    if (input.endpoint.endsWith('/files')) return { data: files, status: 200 };
    if (input.endpoint.includes('/pulls/'))
      return { data: { head: { sha: headSha } }, status: 200 };
    if (input.endpoint === '/user') return { data: { id: 7, login: VIEWER }, status: 200 };
    return { data: null, status: 404 };
  }),
});

/**
 * In-memory receipt store — mirrors `PullRequestReviewReceiptModel`: scope
 * lookup ignores the connection binding, `record` is insert-on-conflict on the
 * full identity and returns the existing row on conflict. Sharing one store
 * across two service instances simulates a process restart.
 */
const createReceiptStore = () => {
  const rows: PullRequestReviewReceiptItem[] = [];
  const sameIdentity = (row: PullRequestReviewReceiptItem, input: NewPullRequestReviewReceipt) =>
    row.userId === input.userId &&
    row.workspaceId === input.workspaceId &&
    row.connectionId === input.connectionId &&
    row.repoId === input.repoId &&
    row.pullRequestId === input.pullRequestId &&
    row.operation === input.operation &&
    row.operationId === input.operationId;
  const inScope = (row: PullRequestReviewReceiptItem, scope: PullRequestReviewReceiptScope) =>
    row.userId === scope.userId &&
    row.workspaceId === scope.workspaceId &&
    row.repoId === scope.repoId &&
    row.pullRequestId === scope.pullRequestId &&
    row.operation === scope.operation &&
    row.operationId === scope.operationId;
  const store: PullRequestReviewReceiptStore = {
    findByOperationScope: async (scope) => rows.filter((row) => inScope(row, scope)),
    record: async (input) => {
      const existing = rows.find((row) => sameIdentity(row, input));
      if (existing) return existing;
      const row: PullRequestReviewReceiptItem = {
        appliedHeadSha: input.appliedHeadSha ?? null,
        connectionId: input.connectionId,
        createdAt: new Date(),
        data: input.data ?? null,
        digest: input.digest,
        id: `receipt-${rows.length + 1}`,
        operation: input.operation,
        operationId: input.operationId,
        pullRequestId: input.pullRequestId,
        reconciled: input.reconciled ?? false,
        repoId: input.repoId,
        status: input.status,
        updatedAt: new Date(),
        userId: input.userId,
        workspaceId: input.workspaceId,
      };
      rows.push(row);
      return row;
    },
  };
  return { rows, store };
};

const service = (
  deps: { market: ReturnType<typeof createMarket>; transport: FakeTransport },
  receipts: PullRequestReviewReceiptStore = createReceiptStore().store,
) => new PullRequestReviewService('user-1', 'ws-1', { ...deps, receipts });

const threadNode = (over: Record<string, unknown> = {}) => ({
  comments: {
    nodes: [
      {
        author: { avatarUrl: null, login: 'teammate' },
        body: 'please handle the null case',
        createdAt: '2030-01-01T00:00:00Z',
        databaseId: 11,
        id: 'C1',
        line: 3,
        outdated: false,
        path: 'src/app.ts',
      },
    ],
    pageInfo: { endCursor: 'c1', hasNextPage: false },
    totalCount: 1,
  },
  diffSide: 'RIGHT',
  id: THREAD_ID,
  isOutdated: false,
  isResolved: false,
  line: 3,
  path: 'src/app.ts',
  startDiffSide: 'RIGHT',
  startLine: 3,
  viewerCanReply: true,
  ...over,
});

const detailResponse = (over: { pullRequest?: Record<string, unknown> | null } = {}) => ({
  rateLimit,
  repository: {
    pullRequest:
      over.pullRequest === null
        ? null
        : {
            additions: 5,
            author: { avatarUrl: null, login: 'author' },
            baseRefName: 'main',
            body: 'body',
            changedFiles: 1,
            commits: {
              nodes: [
                {
                  commit: {
                    oid: HEAD,
                    statusCheckRollup: {
                      contexts: {
                        nodes: [
                          {
                            __typename: 'CheckRun',
                            conclusion: null,
                            name: 'ci',
                            status: 'QUEUED',
                          },
                        ],
                        pageInfo: { endCursor: null, hasNextPage: false },
                        totalCount: 1,
                      },
                      state: 'PENDING',
                    },
                  },
                },
              ],
            },
            deletions: 2,
            headRefName: 'feature',
            headRefOid: HEAD,
            id: PR_NODE_ID,
            isDraft: false,
            mergeable: 'MERGEABLE',
            number: 42,
            pendingReviews: { nodes: [] },
            reviewDecision: 'REVIEW_REQUIRED',
            reviewThreads: {
              nodes: [threadNode()],
              pageInfo: { endCursor: null, hasNextPage: false },
              totalCount: 1,
            },
            reviews: {
              nodes: [],
              pageInfo: { endCursor: null, hasNextPage: false },
              totalCount: 0,
            },
            state: 'OPEN',
            title: 'Fix the thing',
            url: 'https://github.com/octo-org/octo-repo/pull/42',
            ...over.pullRequest,
          },
    viewerPermission: 'WRITE',
  },
  viewer: { login: VIEWER },
});

const contextResponse = (
  over: {
    headSha?: string;
    pendingReviewId?: string | null;
    permission?: string | null;
    reviews?: Record<string, unknown>[];
    threadIds?: string[];
    viewerDatabaseId?: number | null;
  } = {},
) => ({
  rateLimit,
  repository: {
    pullRequest: {
      changedFiles: 1,
      headRefOid: over.headSha ?? HEAD,
      id: PR_NODE_ID,
      number: 42,
      pendingReviews: {
        nodes:
          over.pendingReviewId === undefined || over.pendingReviewId === null
            ? []
            : [
                {
                  author: { login: VIEWER },
                  createdAt: '2030-01-01T00:00:00Z',
                  id: over.pendingReviewId,
                  state: 'PENDING',
                },
              ],
      },
      reviewThreads: {
        nodes: (over.threadIds ?? [THREAD_ID]).map((id) => ({ id })),
        totalCount: (over.threadIds ?? [THREAD_ID]).length,
      },
      reviews: { nodes: over.reviews ?? [] },
    },
    viewerPermission: over.permission === undefined ? 'WRITE' : over.permission,
  },
  viewer: {
    databaseId: over.viewerDatabaseId === undefined ? VIEWER_DB_ID : over.viewerDatabaseId,
    login: VIEWER,
  },
});

const reconcileEmpty = () => ({
  repository: { pullRequest: { headRefOid: HEAD, id: PR_NODE_ID, reviews: { nodes: [] } } },
});

const threadBindingNode = (over: Record<string, unknown> = {}) => ({
  comments: {
    nodes: [],
    pageInfo: { endCursor: null, hasNextPage: false },
    totalCount: 0,
  },
  diffSide: 'RIGHT',
  id: THREAD_ID,
  path: 'src/app.ts',
  pullRequest: { headRefOid: HEAD, id: PR_NODE_ID, number: 42 },
  repository: { nameWithOwner: 'octo-org/octo-repo' },
  viewerCanReply: true,
  ...over,
});

const errorOf = async (promise: Promise<unknown>): Promise<PullRequestReviewError> => {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(PullRequestReviewError);
    return error as PullRequestReviewError;
  }
  throw new Error('expected the call to fail');
};

const snapshotFor = (over: { headSha?: string; threadIds?: string[]; reviewIds?: string[] } = {}) =>
  computeReviewSnapshotId({
    changedFiles: 1,
    headSha: over.headSha ?? HEAD,
    pullRequestId: PR_NODE_ID,
    reviewIds: over.reviewIds ?? [],
    threadIds: over.threadIds ?? [THREAD_ID],
  });

describe('pull request review id', () => {
  it('round-trips a canonical provider identity', () => {
    const id = formatPullRequestReviewId({
      host: 'github.com',
      number: 95,
      owner: 'alexj11324',
      repo: 'orvilo1',
    });
    expect(id).toBe('gh:github.com:alexj11324:orvilo1:95');
    expect(parsePullRequestReviewId(id)).toEqual({
      host: 'github.com',
      number: 95,
      owner: 'alexj11324',
      repo: 'orvilo1',
    });
  });

  it('rejects malformed ids instead of guessing', () => {
    for (const bad of ['', 'gh:github.com:owner:repo', 'gh:x:y:z:0', 'xx:a:b:c:1', 'gh::::']) {
      expect(() => parsePullRequestReviewId(bad)).toThrow(PullRequestReviewError);
      try {
        parsePullRequestReviewId(bad);
      } catch (error) {
        expect((error as PullRequestReviewError).code).toBe('INVALID_REVIEW_ID');
      }
    }
  });

  it('rejects hosts the transport cannot serve (RV04)', () => {
    for (const host of ['gitlab.com', 'ghe.example.com', 'bitbucket.org']) {
      expect(() => parsePullRequestReviewId(`gh:${host}:owner:repo:1`)).toThrowError(
        PullRequestReviewError,
      );
    }
  });
});

describe('pullRequest detail (RV01/RV05/RV06)', () => {
  it('parses a thread-bearing PR and maps thread diffSide onto comments', async () => {
    const transport = createTransport({ PullRequestDetail: () => detailResponse() });
    const market = createMarket([
      {
        additions: 5,
        deletions: 2,
        filename: 'src/app.ts',
        patch: '@@ -1,2 +1,3 @@',
        status: 'modified',
      },
    ]);
    const detail = await service({ market, transport }).pullRequest(REVIEW_ID);

    expect(detail.number).toBe(42);
    expect(detail.headSha).toBe(HEAD);
    expect(detail.snapshotId).toBeTruthy();
    expect(detail.threads.items[0]?.diffSide).toBe('RIGHT');
    expect(detail.threads.items[0]?.comments.items[0]?.side).toBe('RIGHT');
    // GitHub's patch is hunk-only; the service synthesizes the file headers
    // diff renderers require (--- a/… +++ b/…).
    expect(detail.files.items[0]?.patch).toBe(
      '--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1,2 +1,3 @@',
    );
    // Queued checks summarize as pending — never "passing".
    expect(detail.checks.summary.state).toBe('pending');
    expect(detail.checks.items[0]?.status).toBe('pending');
    expect(detail.files.completeness).toBe('complete');
    expect(detail.reviewSession.pendingReviewId).toBeNull();
  });

  it('keeps existing patch headers and honors renames', async () => {
    const transport = createTransport({ PullRequestDetail: () => detailResponse() });
    const market = createMarket([
      {
        additions: 1,
        deletions: 1,
        filename: 'src/new.ts',
        patch: '--- a/src/old.ts\n+++ b/src/new.ts\n@@ -1 +1 @@',
        previousFilename: 'src/old.ts',
        status: 'renamed',
      },
      {
        additions: 1,
        deletions: 0,
        filename: 'src/added.ts',
        patch: '@@ -0,0 +1 @@',
        status: 'added',
      },
    ]);
    const detail = await service({ market, transport }).pullRequest(REVIEW_ID);

    expect(detail.files.items[0]?.patch).toBe('--- a/src/old.ts\n+++ b/src/new.ts\n@@ -1 +1 @@');
    expect(detail.files.items[1]?.patch).toBe(
      '--- a/src/added.ts\n+++ b/src/added.ts\n@@ -0,0 +1 @@',
    );
  });

  it('fails instead of returning an empty detail when the PR is not found', async () => {
    const transport = createTransport({
      PullRequestDetail: () => detailResponse({ pullRequest: null }),
    });
    const market = createMarket();
    const error = await errorOf(service({ market, transport }).pullRequest(REVIEW_ID));
    expect(error.code).toBe('NOT_FOUND');
  });

  it('marks collections partial when the vendor reports further pages', async () => {
    const transport = createTransport({
      PullRequestDetail: () =>
        detailResponse({
          pullRequest: {
            reviewThreads: {
              nodes: [threadNode()],
              pageInfo: { endCursor: 't-cursor', hasNextPage: true },
              totalCount: 5,
            },
          },
        }),
    });
    const market = createMarket();
    const detail = await service({ market, transport }).pullRequest(REVIEW_ID);
    expect(detail.threads.hasMore).toBe(true);
    expect(detail.threads.completeness).toBe('partial');
    expect(detail.threads.endCursor).toBe('t-cursor');
    expect(detail.threads.total).toBe(5);
  });
});

describe('reviewQueue (RV05)', () => {
  it('maps a market status-probe failure to GITHUB_NOT_CONNECTED', async () => {
    githubStatus.getStatus.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const probe = new PullRequestReviewService('user-1', 'ws-1');
    await expect(probe.reviewQueue({ tab: 'for-me' })).rejects.toMatchObject({
      code: 'GITHUB_NOT_CONNECTED',
      name: 'PullRequestReviewError',
    });
  });

  it('maps a disconnected status to GITHUB_NOT_CONNECTED', async () => {
    githubStatus.getStatus.mockResolvedValue({ connected: false, success: true });
    const probe = new PullRequestReviewService('user-1', 'ws-1');
    await expect(probe.reviewQueue({ tab: 'for-me' })).rejects.toMatchObject({
      code: 'GITHUB_NOT_CONNECTED',
    });
  });

  it('returns the cursor and totals so a truncated list is never silent', async () => {
    const transport = createTransport({
      PullRequestReviewQueue: () => ({
        rateLimit,
        search: {
          issueCount: 40,
          nodes: [
            {
              additions: 1,
              author: { avatarUrl: null, login: 'a' },
              changedFiles: 1,
              deletions: 0,
              isDraft: false,
              number: 7,
              repository: { databaseId: 9, nameWithOwner: 'octo-org/octo-repo' },
              reviewDecision: 'REVIEW_REQUIRED',
              title: 'one',
              updatedAt: '2030-01-01T00:00:00Z',
              url: 'https://github.com/octo-org/octo-repo/pull/7',
            },
          ],
          pageInfo: { endCursor: 'q1', hasNextPage: true },
        },
      }),
    });
    const market = createMarket();
    const page = await service({ market, transport }).reviewQueue({ tab: 'for-me' });
    expect(page.hasMore).toBe(true);
    expect(page.endCursor).toBe('q1');
    expect(page.completeness).toBe('partial');
    expect(page.total).toBe(40);
    expect(page.viewer).toBe(VIEWER);
  });
});

describe('submitReview (RV02/RV03)', () => {
  it('creates an Orvilo-owned pending review pinned to the observed head, then submits it', async () => {
    const submitted: Record<string, unknown>[] = [];
    const transport = createTransport({
      CreatePullRequestReview: () => ({
        addPullRequestReview: {
          pullRequestReview: { databaseId: 501, id: 'PR_orvilo', state: 'PENDING' },
        },
      }),
      PullRequestReviewContext: () => contextResponse(),
      SubmitPullRequestReview: (variables) => {
        submitted.push(variables);
        return {
          submitPullRequestReview: {
            pullRequestReview: {
              commit: { oid: HEAD },
              databaseId: 501,
              id: 'PR_orvilo',
              state: 'APPROVED',
              url: 'https://github.com/octo-org/octo-repo/pull/42#pullrequestreview-501',
            },
          },
        };
      },
    });
    const market = createMarket();
    const receipt = await service({ market, transport }).submitReview({
      body: 'looks good',
      event: 'APPROVE',
      id: REVIEW_ID,
      observedHeadSha: HEAD,
    });

    const createCall = transport.calls.find((c) => c.operation === 'CreatePullRequestReview');
    expect(createCall?.variables).toMatchObject({
      input: { commitOID: HEAD, pullRequestId: PR_NODE_ID },
    });
    expect(submitted[0]).toMatchObject({
      input: { event: 'APPROVE', pullRequestReviewId: 'PR_orvilo' },
    });
    expect(receipt.reconciled).toBe(false);
    expect(receipt.appliedHeadSha).toBe(HEAD);
    expect(receipt.data.id).toBe('PR_orvilo');
  });

  it('submits an adopted Orvilo-owned pending review by id', async () => {
    const transport = createTransport({
      PullRequestReviewContext: () => contextResponse({ pendingReviewId: 'PENDING_1' }),
      SubmitPullRequestReview: () => ({
        submitPullRequestReview: {
          pullRequestReview: {
            commit: { oid: HEAD },
            id: 'PENDING_1',
            state: 'COMMENTED',
          },
        },
      }),
    });
    const market = createMarket();
    const receipt = await service({ market, transport }).submitReview({
      event: 'COMMENT',
      id: REVIEW_ID,
      observedHeadSha: HEAD,
      reviewSessionId: 'PENDING_1',
    });
    const submitted = transport.calls.find((c) => c.operation === 'SubmitPullRequestReview');
    expect(submitted?.variables).toMatchObject({
      input: { pullRequestReviewId: 'PENDING_1' },
    });
    expect(transport.calls.find((c) => c.operation === 'CreatePullRequestReview')).toBeUndefined();
    expect(receipt.data.id).toBe('PENDING_1');
  });

  it('refuses to submit an unadopted pending draft (foreign pending review)', async () => {
    const transport = createTransport({
      PullRequestReviewContext: () => contextResponse({ pendingReviewId: 'PENDING_9' }),
    });
    const market = createMarket();
    const error = await errorOf(
      service({ market, transport }).submitReview({
        event: 'APPROVE',
        id: REVIEW_ID,
        observedHeadSha: HEAD,
      }),
    );
    expect(error.code).toBe('PENDING_REVIEW_CONFLICT');
    expect(transport.calls.find((c) => c.operation === 'SubmitPullRequestReview')).toBeUndefined();
  });

  it('reconciles an already-submitted session review instead of double-submitting', async () => {
    const transport = createTransport({
      PullRequestReviewContext: () => contextResponse(),
      PullRequestReviewReconcile: () => ({
        repository: {
          pullRequest: {
            headRefOid: HEAD,
            id: PR_NODE_ID,
            reviews: {
              nodes: [
                {
                  author: { login: VIEWER },
                  body: 'ship it',
                  commit: { oid: HEAD },
                  databaseId: 77,
                  id: 'PR_landed',
                  state: 'APPROVED',
                },
              ],
            },
          },
        },
      }),
    });
    const market = createMarket();
    const receipt = await service({ market, transport }).submitReview({
      body: 'ship it',
      event: 'APPROVE',
      id: REVIEW_ID,
      observedHeadSha: HEAD,
      reviewSessionId: 'PENDING_GONE',
    });
    expect(receipt.reconciled).toBe(true);
    expect(receipt.data.id).toBe('PR_landed');
    expect(transport.calls.find((c) => c.operation === 'SubmitPullRequestReview')).toBeUndefined();
  });

  it('fails with HEAD_DRIFTED when the head moved past what the reviewer saw', async () => {
    const transport = createTransport({
      PullRequestReviewContext: () => contextResponse({ headSha: HEAD_2 }),
    });
    const market = createMarket();
    const error = await errorOf(
      service({ market, transport }).submitReview({
        event: 'APPROVE',
        id: REVIEW_ID,
        observedHeadSha: HEAD,
      }),
    );
    expect(error.code).toBe('HEAD_DRIFTED');
  });

  it('fails with STALE_SNAPSHOT when the conversation changed since load', async () => {
    const transport = createTransport({
      PullRequestReviewContext: () => contextResponse({ threadIds: [THREAD_ID, 'THREAD_extra'] }),
    });
    const market = createMarket();
    const error = await errorOf(
      service({ market, transport }).submitReview({
        event: 'COMMENT',
        id: REVIEW_ID,
        observedHeadSha: HEAD,
        snapshotId: snapshotFor(),
      }),
    );
    expect(error.code).toBe('STALE_SNAPSHOT');
  });

  it('fails with OUTCOME_UNKNOWN on a null submit payload when nothing landed', async () => {
    const transport = createTransport({
      PullRequestReviewContext: () => contextResponse(),
      PullRequestReviewReconcile: () => reconcileEmpty(),
      SubmitPullRequestReview: () => ({ submitPullRequestReview: { pullRequestReview: null } }),
      CreatePullRequestReview: () => ({
        addPullRequestReview: { pullRequestReview: { id: 'PR_new', state: 'PENDING' } },
      }),
    });
    const market = createMarket();
    const error = await errorOf(
      service({ market, transport }).submitReview({
        event: 'APPROVE',
        id: REVIEW_ID,
        observedHeadSha: HEAD,
      }),
    );
    expect(error.code).toBe('OUTCOME_UNKNOWN');
  });

  it('persists the receipt so a fresh service instance replays it without resubmitting', async () => {
    const transport = createTransport({
      CreatePullRequestReview: () => ({
        addPullRequestReview: { pullRequestReview: { id: 'PR_op', state: 'PENDING' } },
      }),
      PullRequestReviewContext: () => contextResponse(),
      SubmitPullRequestReview: () => ({
        submitPullRequestReview: {
          pullRequestReview: { commit: { oid: HEAD }, id: 'PR_op', state: 'APPROVED' },
        },
      }),
    });
    const market = createMarket();
    const receipts = createReceiptStore();
    const operationId = `op-${Math.random()}`;
    const first = await service({ market, transport }, receipts.store).submitReview({
      event: 'APPROVE',
      id: REVIEW_ID,
      observedHeadSha: HEAD,
      operationId,
    });
    expect(receipts.rows).toHaveLength(1);
    expect(receipts.rows[0]).toMatchObject({
      appliedHeadSha: HEAD,
      connectionId: String(VIEWER_DB_ID),
      status: 'applied',
    });

    // A new service instance over the same store = the post-restart process.
    const second = await service({ market, transport }, receipts.store).submitReview({
      event: 'APPROVE',
      id: REVIEW_ID,
      observedHeadSha: HEAD,
      operationId,
    });
    expect(second.digest).toBe(first.digest);
    expect(transport.calls.filter((c) => c.operation === 'SubmitPullRequestReview')).toHaveLength(
      1,
    );
  });

  it('re-authorizes a replay: a revoked permission never sees the stored receipt', async () => {
    let permission: string | null = 'WRITE';
    const transport = createTransport({
      CreatePullRequestReview: () => ({
        addPullRequestReview: { pullRequestReview: { id: 'PR_op', state: 'PENDING' } },
      }),
      PullRequestReviewContext: () => contextResponse({ permission }),
      SubmitPullRequestReview: () => ({
        submitPullRequestReview: {
          pullRequestReview: { commit: { oid: HEAD }, id: 'PR_op', state: 'APPROVED' },
        },
      }),
    });
    const market = createMarket();
    const receipts = createReceiptStore();
    const operationId = `op-${Math.random()}`;
    await service({ market, transport }, receipts.store).submitReview({
      event: 'APPROVE',
      id: REVIEW_ID,
      observedHeadSha: HEAD,
      operationId,
    });

    permission = 'NONE';
    const error = await errorOf(
      service({ market, transport }, receipts.store).submitReview({
        event: 'APPROVE',
        id: REVIEW_ID,
        observedHeadSha: HEAD,
        operationId,
      }),
    );
    expect(error.code).toBe('PERMISSION_DENIED');
  });

  it('rejects a replay when the GitHub connection binding changed', async () => {
    let viewerDatabaseId = VIEWER_DB_ID;
    const transport = createTransport({
      CreatePullRequestReview: () => ({
        addPullRequestReview: { pullRequestReview: { id: 'PR_op', state: 'PENDING' } },
      }),
      PullRequestReviewContext: () => contextResponse({ viewerDatabaseId }),
      SubmitPullRequestReview: () => ({
        submitPullRequestReview: {
          pullRequestReview: { commit: { oid: HEAD }, id: 'PR_op', state: 'APPROVED' },
        },
      }),
    });
    const market = createMarket();
    const receipts = createReceiptStore();
    const operationId = `op-${Math.random()}`;
    await service({ market, transport }, receipts.store).submitReview({
      event: 'APPROVE',
      id: REVIEW_ID,
      observedHeadSha: HEAD,
      operationId,
    });

    viewerDatabaseId = 9999;
    const error = await errorOf(
      service({ market, transport }, receipts.store).submitReview({
        event: 'APPROVE',
        id: REVIEW_ID,
        observedHeadSha: HEAD,
        operationId,
      }),
    );
    expect(error.code).toBe('OPERATION_CONFLICT');
    expect(transport.calls.filter((c) => c.operation === 'SubmitPullRequestReview')).toHaveLength(
      1,
    );
  });

  it('never fabricates a landed head — a reconciled review with no commit stays outcome_unknown', async () => {
    const transport = createTransport({
      CreatePullRequestReview: () => ({
        addPullRequestReview: { pullRequestReview: { id: 'PR_op', state: 'PENDING' } },
      }),
      PullRequestReviewContext: () => contextResponse(),
      PullRequestReviewReconcile: () => ({
        repository: {
          pullRequest: {
            headRefOid: HEAD,
            id: PR_NODE_ID,
            reviews: {
              nodes: [
                {
                  author: { login: VIEWER },
                  body: '',
                  commit: null,
                  databaseId: 77,
                  id: 'PR_maybe',
                  state: 'APPROVED',
                },
              ],
            },
          },
        },
      }),
      SubmitPullRequestReview: () => {
        throw new Error('socket hangup after mutation');
      },
    });
    const market = createMarket();
    const receipts = createReceiptStore();
    const operationId = `op-${Math.random()}`;
    const error = await errorOf(
      service({ market, transport }, receipts.store).submitReview({
        event: 'APPROVE',
        id: REVIEW_ID,
        observedHeadSha: HEAD,
        operationId,
      }),
    );
    expect(error.code).toBe('OUTCOME_UNKNOWN');
    expect(receipts.rows).toHaveLength(1);
    expect(receipts.rows[0]).toMatchObject({
      appliedHeadSha: null,
      data: null,
      status: 'outcome_unknown',
    });

    // Replaying the same operationId surfaces the persisted unknown outcome —
    // it must not silently resubmit.
    const replay = await errorOf(
      service({ market, transport }, receipts.store).submitReview({
        event: 'APPROVE',
        id: REVIEW_ID,
        observedHeadSha: HEAD,
        operationId,
      }),
    );
    expect(replay.code).toBe('OUTCOME_UNKNOWN');
    expect(transport.calls.filter((c) => c.operation === 'SubmitPullRequestReview')).toHaveLength(
      1,
    );
  });

  it('replays a repeated operationId without resubmitting', async () => {
    const transport = createTransport({
      CreatePullRequestReview: () => ({
        addPullRequestReview: { pullRequestReview: { id: 'PR_op', state: 'PENDING' } },
      }),
      PullRequestReviewContext: () => contextResponse(),
      SubmitPullRequestReview: () => ({
        submitPullRequestReview: {
          pullRequestReview: { commit: { oid: HEAD }, id: 'PR_op', state: 'APPROVED' },
        },
      }),
    });
    const market = createMarket();
    const svc = service({ market, transport });
    const operationId = `op-${Math.random()}`;
    const first = await svc.submitReview({
      event: 'APPROVE',
      id: REVIEW_ID,
      observedHeadSha: HEAD,
      operationId,
    });
    const submitsAfterFirst = transport.calls.filter(
      (c) => c.operation === 'SubmitPullRequestReview',
    ).length;
    const second = await svc.submitReview({
      event: 'APPROVE',
      id: REVIEW_ID,
      observedHeadSha: HEAD,
      operationId,
    });
    expect(second.digest).toBe(first.digest);
    expect(transport.calls.filter((c) => c.operation === 'SubmitPullRequestReview')).toHaveLength(
      submitsAfterFirst,
    );
  });

  it('rejects an operationId replayed with a different payload', async () => {
    const transport = createTransport({
      CreatePullRequestReview: () => ({
        addPullRequestReview: { pullRequestReview: { id: 'PR_op2', state: 'PENDING' } },
      }),
      PullRequestReviewContext: () => contextResponse(),
      SubmitPullRequestReview: () => ({
        submitPullRequestReview: {
          pullRequestReview: { commit: { oid: HEAD }, id: 'PR_op2', state: 'COMMENTED' },
        },
      }),
    });
    const market = createMarket();
    const svc = service({ market, transport });
    const operationId = `op-${Math.random()}`;
    await svc.submitReview({
      body: 'first',
      event: 'COMMENT',
      id: REVIEW_ID,
      observedHeadSha: HEAD,
      operationId,
    });
    const error = await errorOf(
      svc.submitReview({
        body: 'different body',
        event: 'COMMENT',
        id: REVIEW_ID,
        observedHeadSha: HEAD,
        operationId,
      }),
    );
    expect(error.code).toBe('OPERATION_CONFLICT');
  });

  it('denies writes when the viewer permission is below reviewable', async () => {
    const transport = createTransport({
      PullRequestReviewContext: () => contextResponse({ permission: 'NONE' }),
    });
    const market = createMarket();
    const error = await errorOf(
      service({ market, transport }).submitReview({
        event: 'APPROVE',
        id: REVIEW_ID,
        observedHeadSha: HEAD,
      }),
    );
    expect(error.code).toBe('PERMISSION_DENIED');
  });
});

describe('replyToThread (RV03/RV04)', () => {
  const replyParams = (over: Record<string, unknown> = {}) => ({
    body: 'reply body',
    id: REVIEW_ID,
    observedHeadSha: HEAD,
    threadId: THREAD_ID,
    ...over,
  });

  it('replies on a thread that provably belongs to the routed PR', async () => {
    const transport = createTransport({
      AddPullRequestReviewThreadReply: () => ({
        addPullRequestReviewThreadReply: { comment: { databaseId: 5, id: 'C_new' } },
      }),
      PullRequestReviewContext: () => contextResponse(),
      PullRequestThreadComments: () => ({ node: threadBindingNode(), rateLimit }),
    });
    const market = createMarket();
    const receipt = await service({ market, transport }).replyToThread(replyParams());
    expect(receipt.data.comment.id).toBe('C_new');
    expect(
      transport.calls.find((c) => c.operation === 'AddPullRequestReviewThreadReply'),
    ).toBeTruthy();
  });

  it('rejects a thread bound to a different pull request (cross-PR reply)', async () => {
    const transport = createTransport({
      PullRequestReviewContext: () => contextResponse(),
      PullRequestThreadComments: () => ({
        node: threadBindingNode({
          pullRequest: { headRefOid: HEAD, id: 'OTHER_PR', number: 99 },
        }),
        rateLimit,
      }),
    });
    const market = createMarket();
    const error = await errorOf(service({ market, transport }).replyToThread(replyParams()));
    expect(error.code).toBe('THREAD_MISMATCH');
    expect(
      transport.calls.find((c) => c.operation === 'AddPullRequestReviewThreadReply'),
    ).toBeUndefined();
  });

  it('rejects a thread bound to a different repository', async () => {
    const transport = createTransport({
      PullRequestReviewContext: () => contextResponse(),
      PullRequestThreadComments: () => ({
        node: threadBindingNode({
          repository: { nameWithOwner: 'octo-org/other-repo' },
        }),
        rateLimit,
      }),
    });
    const market = createMarket();
    const error = await errorOf(service({ market, transport }).replyToThread(replyParams()));
    expect(error.code).toBe('THREAD_MISMATCH');
  });

  it('denies the reply when GitHub says the viewer cannot reply', async () => {
    const transport = createTransport({
      PullRequestReviewContext: () => contextResponse(),
      PullRequestThreadComments: () => ({
        node: threadBindingNode({ viewerCanReply: false }),
        rateLimit,
      }),
    });
    const market = createMarket();
    const error = await errorOf(service({ market, transport }).replyToThread(replyParams()));
    expect(error.code).toBe('PERMISSION_DENIED');
  });

  it('fails with OUTCOME_UNKNOWN when GitHub returns no comment', async () => {
    const transport = createTransport({
      AddPullRequestReviewThreadReply: () => ({
        addPullRequestReviewThreadReply: { comment: null },
      }),
      PullRequestReviewContext: () => contextResponse(),
      PullRequestThreadComments: () => ({ node: threadBindingNode(), rateLimit }),
    });
    const market = createMarket();
    const receipts = createReceiptStore();
    const operationId = `op-${Math.random()}`;
    const error = await errorOf(
      service({ market, transport }, receipts.store).replyToThread({
        ...replyParams(),
        operationId,
      }),
    );
    expect(error.code).toBe('OUTCOME_UNKNOWN');
    expect(receipts.rows).toHaveLength(1);
    expect(receipts.rows[0].status).toBe('outcome_unknown');
  });
});

describe('page (RV05)', () => {
  it('marks a page stale when the head moved mid-pagination', async () => {
    const transport = createTransport({
      PullRequestThreadsPage: () => ({
        rateLimit,
        repository: {
          pullRequest: {
            headRefOid: HEAD_2,
            id: PR_NODE_ID,
            reviewThreads: {
              nodes: [threadNode({ id: 'T2' })],
              pageInfo: { endCursor: null, hasNextPage: false },
              totalCount: 2,
            },
          },
        },
      }),
    });
    const market = createMarket();
    const page = await service({ market, transport }).page({
      collection: 'threads',
      expectedHeadSha: HEAD,
      id: REVIEW_ID,
    });
    expect(page.stale).toBe(true);
    expect(page.headSha).toBe(HEAD_2);
  });

  it('fails comments pagination on a thread from another PR', async () => {
    const transport = createTransport({
      PullRequestThreadComments: () => ({
        node: threadBindingNode({
          pullRequest: { headRefOid: HEAD, id: 'OTHER', number: 7 },
        }),
        rateLimit,
      }),
    });
    const market = createMarket();
    const error = await errorOf(
      service({ market, transport }).page({
        collection: 'comments',
        id: REVIEW_ID,
        threadId: THREAD_ID,
      }),
    );
    expect(error.code).toBe('THREAD_MISMATCH');
  });
});
