import { describe, expect, it, vi } from 'vitest';

import {
  formatPullRequestReviewId,
  parsePullRequestReviewId,
  PullRequestReviewError,
  PullRequestReviewService,
} from './index';

const githubStatus = vi.hoisted(() => ({
  getStatus: vi.fn<(id: string) => Promise<{ connected: boolean; success: boolean }>>(),
}));

vi.mock('@/server/services/market', () => ({
  MarketService: class {
    market = { skills: { getStatus: githubStatus.getStatus } };
  },
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
