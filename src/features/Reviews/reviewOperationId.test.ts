import { describe, expect, it } from 'vitest';

import { reviewOperationId, type ReviewWriteIntent } from './reviewOperationId';

const intent = (over: Partial<ReviewWriteIntent> = {}): ReviewWriteIntent => ({
  action: 'submitReview',
  body: 'looks good',
  event: 'APPROVE',
  headSha: 'head-1',
  pullRequestId: 'gh:github.com:acme:app:42',
  reviewSessionId: null,
  snapshotId: 'snap-1',
  viewerLogin: 'octocat',
  workspaceId: 'ws-1',
  ...over,
});

describe('reviewOperationId', () => {
  it('is stable — the same intent produces the same operationId across calls', () => {
    expect(reviewOperationId(intent())).toBe(reviewOperationId(intent()));
  });

  it('is stable across a refresh when the snapshot is unchanged', () => {
    // A refresh keeps snapshotId/headSha — the retried write must replay the
    // exact same operation instead of minting a new id.
    const before = reviewOperationId(intent());
    const afterRefresh = reviewOperationId(intent({ snapshotId: 'snap-1' }));
    expect(afterRefresh).toBe(before);
  });

  it('produces a new operation for a new intent, not a payload conflict', () => {
    const base = intent();
    expect(reviewOperationId(intent({ body: 'edited body' }))).not.toBe(reviewOperationId(base));
    expect(reviewOperationId(intent({ event: 'REQUEST_CHANGES' }))).not.toBe(
      reviewOperationId(base),
    );
    expect(reviewOperationId(intent({ headSha: 'head-2' }))).not.toBe(reviewOperationId(base));
    expect(reviewOperationId(intent({ snapshotId: 'snap-2' }))).not.toBe(reviewOperationId(base));
    expect(reviewOperationId(intent({ workspaceId: 'ws-2' }))).not.toBe(reviewOperationId(base));
    expect(reviewOperationId(intent({ pullRequestId: 'other-pr' }))).not.toBe(
      reviewOperationId(base),
    );
    expect(reviewOperationId(intent({ reviewSessionId: 'PENDING_1' }))).not.toBe(
      reviewOperationId(base),
    );
    expect(reviewOperationId(intent({ viewerLogin: 'hubot' }))).not.toBe(reviewOperationId(base));
  });

  it('binds replies and file comments to their anchors', () => {
    const reply = intent({ action: 'replyToThread', event: undefined, threadId: 'T1' });
    expect(reviewOperationId(reply)).not.toBe(reviewOperationId(intent()));
    expect(reviewOperationId(intent({ ...reply, threadId: 'T2' }))).not.toBe(
      reviewOperationId(reply),
    );

    const comment = intent({
      action: 'addFileComment',
      event: undefined,
      line: 10,
      path: 'src/a.ts',
      side: 'RIGHT',
    });
    expect(reviewOperationId(intent({ ...comment, line: 11 }))).not.toBe(
      reviewOperationId(comment),
    );
    expect(reviewOperationId(intent({ ...comment, path: 'src/b.ts' }))).not.toBe(
      reviewOperationId(comment),
    );
    expect(reviewOperationId(intent({ ...comment, side: 'LEFT' }))).not.toBe(
      reviewOperationId(comment),
    );
  });

  it('does not let field-boundary content collide', () => {
    // A body containing the framing characters must not alias another intent.
    const a = intent({ body: 'x", "event", "', event: 'COMMENT' });
    const b = intent({ body: 'x', event: 'COMMENT' });
    expect(reviewOperationId(a)).not.toBe(reviewOperationId(b));
  });

  it('fits the server contract: ri_-prefixed, 8–128 chars', () => {
    const id = reviewOperationId(intent());
    expect(id.startsWith('ri_')).toBe(true);
    expect(id.length).toBeGreaterThanOrEqual(8);
    expect(id.length).toBeLessThanOrEqual(128);
  });
});
