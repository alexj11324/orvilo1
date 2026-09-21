// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/database/core/db-adaptor', () => ({
  getServerDB: vi.fn(function () {
    return {};
  }),
}));

const mockAddFileComment = vi.fn(async () => ({}));
const mockReplyToThread = vi.fn(async () => ({}));
const mockSubmitReview = vi.fn(async () => ({}));

vi.mock('@/server/services/pullRequestReview', async (importOriginal) => ({
  ...(await importOriginal),
  PullRequestReviewService: vi.fn(function () {
    return {
      addFileComment: mockAddFileComment,
      replyToThread: mockReplyToThread,
      submitReview: mockSubmitReview,
    };
  }),
}));

vi.mock('@/database/models/workspace', async (importOriginal) => ({
  ...(await importOriginal),
  getActiveWorkspaceMembershipRole: vi.fn().mockResolvedValue('member'),
}));

const { pullRequestRouter } = await import('../pullRequest');

const createCaller = () =>
  pullRequestRouter.createCaller({ serverDB: {}, userId: 'user-1', workspaceId: 'ws-1' } as any);

const REVIEW_ID = 'gh:github.com:acme/widgets:12';

describe('pullRequestRouter write gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ORVILO_PR_REVIEW_WRITE;
  });
  afterEach(() => {
    delete process.env.ORVILO_PR_REVIEW_WRITE;
  });

  it.each(['addFileComment', 'replyThread', 'submitReview'] as const)(
    'rejects %s with FORBIDDEN when the write gate is off',
    async (procedure) => {
      const input =
        procedure === 'addFileComment'
          ? { body: 'x', id: REVIEW_ID, line: 1, observedHeadSha: 'a1b2c3d', path: 'a.ts' }
          : procedure === 'replyThread'
            ? { body: 'x', id: REVIEW_ID, observedHeadSha: 'a1b2c3d', threadId: 't-1' }
            : { event: 'COMMENT', id: REVIEW_ID, observedHeadSha: 'a1b2c3d' };

      await expect(
        (createCaller()[procedure] as (i: unknown) => Promise<unknown>)(input),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    },
  );

  it('does not reach the service while gated off', async () => {
    await expect(
      createCaller().submitReview({ event: 'COMMENT', id: REVIEW_ID, observedHeadSha: 'a1b2c3d' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mockSubmitReview).not.toHaveBeenCalled();
  });

  it('reaches the service when ORVILO_PR_REVIEW_WRITE=1', async () => {
    process.env.ORVILO_PR_REVIEW_WRITE = '1';
    const result = await createCaller().submitReview({
      event: 'COMMENT',
      id: REVIEW_ID,
      observedHeadSha: 'a1b2c3d',
    });
    expect(result).toMatchObject({ success: true });
    expect(mockSubmitReview).toHaveBeenCalledWith({
      body: undefined,
      event: 'COMMENT',
      id: REVIEW_ID,
      observedHeadSha: 'a1b2c3d',
      operationId: undefined,
      reviewSessionId: undefined,
      snapshotId: undefined,
    });
  });
});
