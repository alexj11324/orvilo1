import { describe, expect, it } from 'vitest';

import {
  formatPullRequestReviewId,
  parsePullRequestReviewId,
  PullRequestReviewError,
} from './index';

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
