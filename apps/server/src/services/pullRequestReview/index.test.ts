import { describe, expect, it, vi } from 'vitest';

import {
  formatPullRequestReviewId,
  parsePullRequestReviewId,
  PullRequestReviewError,
  PullRequestReviewService,
} from './index';

const githubStatus = vi.hoisted(() => ({
  getStatus: vi.fn<(id: string) => Promise<{ connected: boolean; success: boolean }>>(),
  proxyOAuthRequest:
    vi.fn<(args: { endpoint: string }) => Promise<{ data: unknown; status: number }>>(),
}));

const githubTransport = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn<() => Promise<{ login: string }>>(),
  request: vi.fn<(args: { operation: string; query: string }) => Promise<unknown>>(),
}));

vi.mock('@/server/services/market', () => ({
  MarketService: class {
    market = { skills: { getStatus: githubStatus.getStatus } };
    proxyOAuthRequest = githubStatus.proxyOAuthRequest;
  },
}));

vi.mock('@orvilo/connector-data/github', () => ({
  createGitHubMarketTransport: () => githubTransport,
}));

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
});

describe('connection probe', () => {
  it('maps a market status-probe failure to GITHUB_NOT_CONNECTED', async () => {
    githubStatus.getStatus.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const service = new PullRequestReviewService('user-1', 'ws-1');
    await expect(service.reviewQueue('for-me')).rejects.toMatchObject({
      code: 'GITHUB_NOT_CONNECTED',
      name: 'PullRequestReviewError',
    });
  });

  it('maps a disconnected status to GITHUB_NOT_CONNECTED', async () => {
    githubStatus.getStatus.mockResolvedValue({ connected: false, success: true });
    const service = new PullRequestReviewService('user-1', 'ws-1');
    await expect(service.reviewQueue('for-me')).rejects.toMatchObject({
      code: 'GITHUB_NOT_CONNECTED',
    });
  });
});

describe('pull request detail query', () => {
  const reviewId = formatPullRequestReviewId({
    host: 'github.com',
    number: 95,
    owner: 'alexj11324',
    repo: 'orvilo1',
  });

  const detailResponse = {
    repository: {
      pullRequest: {
        id: 'PR_1',
        number: 95,
        reviewThreads: {
          nodes: [
            {
              comments: {
                nodes: [
                  {
                    author: { login: 'reviewer' },
                    body: 'comment',
                    databaseId: 7,
                    outdated: false,
                  },
                ],
              },
              diffSide: 'RIGHT',
              id: 'thread-1',
              isResolved: false,
              line: 12,
              path: 'src/a.ts',
              startDiffSide: 'RIGHT',
            },
          ],
        },
        title: 'pr',
        url: 'https://github.com/alexj11324/orvilo1/pull/95',
      },
    },
  };

  it('reads diff side from the thread, not the comment nodes', async () => {
    githubStatus.getStatus.mockResolvedValue({ connected: true, success: true });
    githubStatus.proxyOAuthRequest.mockResolvedValue({ data: [], status: 200 });
    githubTransport.request.mockResolvedValue(detailResponse);

    const service = new PullRequestReviewService('user-1', 'ws-1');
    const detail = await service.pullRequest(reviewId);

    const query = githubTransport.request.mock.calls[0]?.[0]?.query ?? '';
    const commentBlock = query.match(/comments\(first: 20\) \{[\s\S]*?\}\s*\}/)?.[0] ?? '';
    // PullRequestReviewComment has no `side` field; the diff side lives on the
    // thread (diffSide / startDiffSide). Requesting it makes the query illegal.
    expect(commentBlock).not.toMatch(/\bside\b/);
    expect(query).toContain('diffSide');
    expect(query).toContain('startDiffSide');
    expect(detail.threads[0]?.comments[0]?.side).toBe('RIGHT');
  });
});
