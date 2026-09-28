import assert from 'node:assert/strict';

import type { readPullRequestReviewSnapshot } from '../reviewSnapshot';
import {
  BASE,
  check,
  comment,
  COORDINATE,
  DATE,
  EXPECTED,
  fixture,
  HEAD,
  MERGE,
  NEW_HEAD,
  openPr,
  response,
  review,
  ROOT,
} from './reviewSnapshot.fixtures';

type Reader = typeof readPullRequestReviewSnapshot;
export interface SnapshotCase {
  name: string;
  /** Run the same assertion against the verified original source as a negative control. */
  regression?: boolean;
  run: (read: Reader) => Promise<void>;
}

const cases: SnapshotCase[] = [];
const add = (name: string, run: SnapshotCase['run'], regression = false) => {
  cases.push({ name, regression, run });
};

add('reads a complete healthy revision without mutating GitHub', async (read) => {
  const f = fixture();
  const result = await read(f.transport, COORDINATE, 9, 'fixture-token', EXPECTED);
  assert.ok(result);
  assert.equal(result.headSha, HEAD);
  assert.equal(result.baseSha, BASE);
  assert.deepEqual(result.checks, {
    failed: [],
    pending: [],
    skipped: [],
    successful: ['Typecheck'],
  });
  assert.equal(result.nodeId, 'PR_9');
  assert.equal(result.repositoryId, 10);
  assert.equal(result.headBranch, 'task/T-1');
  assert.equal(f.calls.filter((call) => call.path === `${ROOT}/pulls/9`).length, 2);
  assert.ok(f.calls.every((call) => call.token === 'fixture-token'));
  assert.ok(
    f.calls.every(
      (call) => !call.init?.method || call.init.method === 'GET' || call.path === '/graphql',
    ),
  );
});

add(
  'does not miss a failed check on REST page two',
  async (read) => {
    const checks = Array.from({ length: 100 }, (_, i) => check(i + 1, `ok-${i}`));
    checks.push(check(101, 'Database migration', 'failure'));
    const f = fixture({ checks });
    const result = await read(f.transport, COORDINATE, 9);
    assert.ok(result?.checks.failed.includes('Database migration'));
  },
  true,
);

add(
  'reads ordinary comments after the first 100',
  async (read) => {
    const ordinary = Array.from({ length: 101 }, (_, i) => comment(i + 1));
    const result = await read(fixture({ ordinary }).transport, COORDINATE, 9);
    assert.equal(result?.humanCommentIds.length, 101);
    assert.ok(result.humanCommentIds.includes('issue-comment:101'));
  },
  true,
);

add(
  'reads inline comments after the first 100',
  async (read) => {
    const inline = Array.from({ length: 101 }, (_, i) => comment(i + 1));
    const result = await read(fixture({ inline }).transport, COORDINATE, 9);
    assert.ok(result?.humanCommentIds.includes('review-comment:101'));
  },
  true,
);

add(
  'reads a formal change request on REST page two',
  async (read) => {
    const reviews = Array.from({ length: 100 }, (_, i) => review(i + 1, 'COMMENTED', i + 1));
    reviews.push(review(101, 'CHANGES_REQUESTED', 101));
    const result = await read(fixture({ reviews }).transport, COORDINATE, 9);
    assert.deepEqual(result?.requestedChangeReviewIds, ['review:101']);
  },
  true,
);

add(
  'reads unresolved review threads on GraphQL page two',
  async (read) => {
    const threads = Array.from({ length: 101 }, (_, i) => ({
      id: `thread-${i}`,
      isResolved: i < 100,
    }));
    const result = await read(fixture({ threads }).transport, COORDINATE, 9);
    assert.deepEqual(result?.unresolvedThreadIds, ['thread-100']);
  },
  true,
);

add(
  'a GraphQL-null repository is unknown, not zero blockers',
  async (read) => {
    const f = fixture({
      hook: (path) => (path === '/graphql' ? response({ data: { repository: null } }) : undefined),
    });
    assert.equal(await read(f.transport, COORDINATE, 9), undefined);
  },
  true,
);

add(
  'missing GraphQL pageInfo is unknown',
  async (read) => {
    const f = fixture({
      hook: (path) =>
        path === '/graphql'
          ? response({
              data: {
                repository: {
                  pullRequest: {
                    id: 'PR_9',
                    baseRefOid: BASE,
                    headRefOid: HEAD,
                    reviewDecision: null,
                    reviewThreads: { nodes: [] },
                  },
                },
              },
            })
          : undefined,
    });
    assert.equal(await read(f.transport, COORDINATE, 9), undefined);
  },
  true,
);

add('partial GraphQL data with errors is unknown', async (read) => {
  const f = fixture({
    hook: (path) =>
      path === '/graphql'
        ? response({ data: { repository: null }, errors: [{ message: 'forbidden' }] })
        : undefined,
  });
  assert.equal(await read(f.transport, COORDINATE, 9), undefined);
});

add(
  'an empty object in place of a review list is unknown',
  async (read) => {
    const f = fixture({ hook: (path) => (path.includes('/reviews?') ? response({}) : undefined) });
    assert.equal(await read(f.transport, COORDINATE, 9), undefined);
  },
  true,
);

add(
  'an array in place of the check-runs envelope is unknown',
  async (read) => {
    const f = fixture({
      hook: (path) => (path.includes('/check-runs?') ? response([]) : undefined),
    });
    assert.equal(await read(f.transport, COORDINATE, 9), undefined);
  },
  true,
);

add(
  'a truncated check list contradicting total_count is unknown',
  async (read) => {
    const f = fixture({
      hook: (path) =>
        path.includes('/check-runs?')
          ? response({ check_runs: [check(1, 'Typecheck')], total_count: 101 })
          : undefined,
    });
    assert.equal(await read(f.transport, COORDINATE, 9), undefined);
  },
  true,
);

add(
  'a failure on page two discards the first page',
  async (read) => {
    const ordinary = Array.from({ length: 100 }, (_, i) => comment(i + 1));
    const f = fixture({
      ordinary,
      hook: (path) =>
        path.includes('/issues/9/comments?') && path.includes('page=2')
          ? response({ message: 'rate limited' }, 429)
          : undefined,
    });
    assert.equal(await read(f.transport, COORDINATE, 9), undefined);
  },
  true,
);

add('an exactly-full final REST page is followed by an empty page', async (read) => {
  const ordinary = Array.from({ length: 100 }, (_, i) => comment(i + 1));
  const f = fixture({ ordinary });
  const result = await read(f.transport, COORDINATE, 9);
  assert.equal(result?.humanCommentIds.length, 100);
  assert.ok(
    f.calls.some(
      (call) => call.path.includes('/issues/9/comments?') && call.path.includes('page=2'),
    ),
  );
});

add('duplicate IDs from changing pagination are unknown', async (read) => {
  const ordinary = Array.from({ length: 100 }, (_, i) => comment(i + 1));
  const f = fixture({
    ordinary,
    hook: (path) =>
      path.includes('/issues/9/comments?') && path.includes('page=2')
        ? response([comment(1)])
        : undefined,
  });
  assert.equal(await read(f.transport, COORDINATE, 9), undefined);
});

add('an exhausted REST page budget never returns partial success', async (read) => {
  const ordinary = Array.from({ length: 2000 }, (_, i) => comment(i + 1));
  const f = fixture({ ordinary });
  assert.equal(await read(f.transport, COORDINATE, 9), undefined);
  assert.equal(f.calls.filter((call) => call.path.includes('/issues/9/comments?')).length, 20);
});

add('a repeated GraphQL cursor cannot loop forever', async (read) => {
  let graphPage = 0;
  const f = fixture({
    hook: (path) =>
      path === '/graphql'
        ? response({
            data: {
              repository: {
                pullRequest: {
                  id: 'PR_9',
                  baseRefOid: BASE,
                  headRefOid: HEAD,
                  reviewDecision: null,
                  reviewThreads: {
                    nodes: [{ id: `thread-${graphPage++}`, isResolved: true }],
                    pageInfo: { endCursor: 'same', hasNextPage: true },
                  },
                },
              },
            },
          })
        : undefined,
  });
  assert.equal(await read(f.transport, COORDINATE, 9), undefined);
  assert.equal(graphPage, 2);
});

add(
  'head changes during collection invalidate the whole snapshot',
  async (read) => {
    const finalPr = openPr({ head: { ref: 'task/T-1', repo: { id: 10 }, sha: NEW_HEAD } });
    assert.equal(await read(fixture({ finalPr }).transport, COORDINATE, 9), undefined);
  },
  true,
);

add(
  'base changes during collection invalidate the whole snapshot',
  async (read) => {
    const finalPr = openPr({
      base: { ref: 'main', repo: { full_name: 'acme/widgets', id: 10 }, sha: NEW_HEAD },
    });
    assert.equal(await read(fixture({ finalPr }).transport, COORDINATE, 9), undefined);
  },
  true,
);

add(
  'retargeting while reading invalidates the whole snapshot',
  async (read) => {
    const finalPr = openPr({
      base: { ref: 'release', repo: { full_name: 'acme/widgets', id: 10 }, sha: BASE },
    });
    assert.equal(await read(fixture({ finalPr }).transport, COORDINATE, 9), undefined);
  },
  true,
);

add(
  'the GraphQL revision must match the REST revision',
  async (read) => {
    const f = fixture({
      hook: (path) =>
        path === '/graphql'
          ? response({
              data: {
                repository: {
                  pullRequest: {
                    id: 'PR_9',
                    baseRefOid: BASE,
                    headRefOid: NEW_HEAD,
                    reviewDecision: null,
                    reviewThreads: { nodes: [], pageInfo: { endCursor: null, hasNextPage: false } },
                  },
                },
              },
            })
          : undefined,
    });
    assert.equal(await read(f.transport, COORDINATE, 9), undefined);
  },
  true,
);

add(
  'traditional commit status failure blocks a green check-run',
  async (read) => {
    const statuses = [{ context: 'Preview', id: 1, state: 'failure' }];
    const result = await read(fixture({ statuses }).transport, COORDINATE, 9);
    assert.ok(result?.checks.failed.includes('Preview'));
  },
  true,
);

add('traditional status history uses its latest decision', async (read) => {
  const statuses = [
    { context: 'Preview', id: 10, state: 'success' },
    { context: 'Preview', id: 1, state: 'failure' },
  ];
  const result = await read(fixture({ statuses }).transport, COORDINATE, 9);
  assert.deepEqual(result?.checks.failed, []);
  assert.ok(result?.checks.successful.includes('Preview'));
});

add(
  'a check run for the wrong SHA is never valid evidence',
  async (read) => {
    const f = fixture({ checks: [check(1, 'Typecheck', 'success', { head_sha: NEW_HEAD })] });
    assert.equal(await read(f.transport, COORDINATE, 9), undefined);
  },
  true,
);

add('rerun history uses the newest check id for each app and name', async (read) => {
  const checks = [check(2, 'Typecheck'), check(1, 'Typecheck', 'failure')];
  const result = await read(fixture({ checks }).transport, COORDINATE, 9);
  assert.deepEqual(result?.checks.failed, []);
});

add('same check name from a different app cannot erase a failure', async (read) => {
  const checks = [
    check(1, 'Security', 'failure'),
    check(2, 'Security', 'success', { app: { id: 999 } }),
  ];
  const result = await read(fixture({ checks }).transport, COORDINATE, 9);
  assert.ok(result?.checks.failed.includes('Security'));
});

add('all-skipped checks and bookkeeping alone are not passing tests', async (read) => {
  const checks = [
    check(1, 'Check Duplicate Run'),
    check(2, 'Typecheck', 'skipped'),
    check(3, 'E2E', 'neutral'),
  ];
  const result = await read(fixture({ checks }).transport, COORDINATE, 9);
  assert.equal(result?.checks.successful.length, 0);
  assert.ok(result?.checks.pending.length);
});

add(
  'a failed bookkeeping check is not silently ignored',
  async (read) => {
    const checks = [check(1, 'Check Duplicate Run', 'failure'), check(2, 'Typecheck')];
    const result = await read(fixture({ checks }).transport, COORDINATE, 9);
    assert.ok(result?.checks.failed.includes('Check Duplicate Run'));
  },
  true,
);

add('unknown check conclusion is pending, not success', async (read) => {
  const result = await read(
    fixture({ checks: [check(1, 'Typecheck', 'new_conclusion')] }).transport,
    COORDINATE,
    9,
  );
  assert.deepEqual(result?.checks.pending, ['Typecheck']);
});

add(
  'required approval can block even without outstanding reviewer requests',
  async (read) => {
    const result = await read(
      fixture({ reviewDecision: 'REVIEW_REQUIRED' }).transport,
      COORDINATE,
      9,
    );
    assert.ok(result?.checks.pending.includes('GitHub review decision: REVIEW_REQUIRED'));
  },
  true,
);

add(
  'a bot formal change request remains blocking',
  async (read) => {
    const reviews = [
      review(1, 'CHANGES_REQUESTED', 42, { user: { id: 42, login: 'review[bot]', type: 'Bot' } }),
    ];
    const result = await read(fixture({ reviews }).transport, COORDINATE, 9);
    assert.deepEqual(result?.requestedChangeReviewIds, ['review:1']);
  },
  true,
);

add(
  'a deleted reviewer does not silently erase a blocking decision',
  async (read) => {
    const reviews = [review(1, 'CHANGES_REQUESTED', 42, { user: null })];
    const result = await read(fixture({ reviews }).transport, COORDINATE, 9);
    assert.deepEqual(result?.requestedChangeReviewIds, ['review:1']);
  },
  true,
);

add('a COMMENTED review does not clear an earlier change request', async (read) => {
  const reviews = [review(1, 'CHANGES_REQUESTED'), review(2, 'COMMENTED')];
  const result = await read(fixture({ reviews }).transport, COORDINATE, 9);
  assert.deepEqual(result?.requestedChangeReviewIds, ['review:1']);
});

add('a later decisive approval or dismissal clears that actor only', async (read) => {
  const reviews = [
    review(1, 'CHANGES_REQUESTED'),
    review(2, 'APPROVED'),
    review(3, 'CHANGES_REQUESTED', 42),
    review(4, 'DISMISSED', 42),
  ];
  const result = await read(fixture({ reviews }).transport, COORDINATE, 9);
  assert.deepEqual(result?.requestedChangeReviewIds, []);
});

add('outdated does not mean resolved', async (read) => {
  const threads = [{ id: 'old-thread', isOutdated: true, isResolved: false }];
  const result = await read(fixture({ threads }).transport, COORDINATE, 9);
  assert.deepEqual(result?.unresolvedThreadIds, ['old-thread']);
});

add(
  'comment edits change the feedback cursor without changing the source ID',
  async (read) => {
    const before = await read(fixture({ ordinary: [comment(1)] }).transport, COORDINATE, 9);
    const after = await read(
      fixture({ ordinary: [comment(1, { updated_at: '2026-09-16T11:00:00Z' })] }).transport,
      COORDINATE,
      9,
    );
    assert.ok(before && after);
    assert.deepEqual(before.humanCommentIds, after.humanCommentIds);
    assert.notDeepEqual(before.humanFeedbackIds, after.humanFeedbackIds);
  },
  true,
);

add(
  'comment edits within one timestamp tick also change the feedback cursor',
  async (read) => {
    const before = await read(fixture({ ordinary: [comment(1)] }).transport, COORDINATE, 9);
    const after = await read(
      fixture({ ordinary: [comment(1, { body: 'A different blocking defect' })] }).transport,
      COORDINATE,
      9,
    );
    assert.ok(before && after);
    assert.deepEqual(before.humanCommentIds, after.humanCommentIds);
    assert.notDeepEqual(before.humanFeedbackIds, after.humanFeedbackIds);
  },
  true,
);

add('untrusted bot chatter does not become an automatic human feedback command', async (read) => {
  const ordinary = [comment(1, { user: { id: 2, login: 'bot', type: 'Bot' } })];
  const result = await read(fixture({ ordinary }).transport, COORDINATE, 9);
  assert.deepEqual(result?.humanCommentIds, []);
});

add(
  'replies posted under the delivery credential are not new human feedback',
  async (read) => {
    const ordinary = [
      comment(1, { user: { id: 7, login: 'Delivery-Actor', type: 'User' } }),
      comment(2, { user: { id: 41, login: 'reviewer', type: 'User' } }),
    ];
    const result = await read(fixture({ ordinary }).transport, COORDINATE, 9);
    assert.deepEqual(result?.humanCommentIds, ['issue-comment:2']);
  },
  true,
);

add(
  'a credential without readable /user scope keeps all human comments visible',
  async (read) => {
    const ordinary = [comment(1, { user: { id: 7, login: 'delivery-actor', type: 'User' } })];
    const result = await read(
      fixture({ ordinary, viewer: null }).transport,
      COORDINATE,
      9,
    );
    assert.deepEqual(result?.humanCommentIds, ['issue-comment:1']);
  },
  true,
);

add(
  'wrong repository identity is rejected',
  async (read) => {
    const pr = openPr({
      base: { ref: 'main', sha: BASE, repo: { id: 11, full_name: 'other/widgets' } },
    });
    assert.equal(await read(fixture({ pr }).transport, COORDINATE, 9), undefined);
  },
  true,
);

add(
  'wrong PR number is rejected',
  async (read) => {
    assert.equal(
      await read(fixture({ pr: openPr({ number: 10 }) }).transport, COORDINATE, 9),
      undefined,
    );
  },
  true,
);

add(
  'a lookalike URL cannot serve as PR identity',
  async (read) => {
    const pr = openPr({ html_url: 'https://github.com.evil.test/acme/widgets/pull/9' });
    assert.equal(await read(fixture({ pr }).transport, COORDINATE, 9), undefined);
  },
  true,
);

add(
  'a wrong delivery head branch is rejected even when the base matches',
  async (read) => {
    const pr = openPr({ head: { ref: 'task/T-99', repo: { id: 10 }, sha: HEAD } });
    assert.equal(
      await read(fixture({ pr }).transport, COORDINATE, 9, undefined, EXPECTED),
      undefined,
    );
  },
  true,
);

add(
  'a namesake branch in a fork cannot stand in for the managed branch',
  async (read) => {
    const pr = openPr({ head: { ref: 'task/T-1', repo: { id: 99 }, sha: HEAD } });
    assert.equal(
      await read(fixture({ pr }).transport, COORDINATE, 9, undefined, EXPECTED),
      undefined,
    );
  },
  true,
);

add(
  'expected head, PR node and repository ID are fenced',
  async (read) => {
    for (const extra of [{ headSha: NEW_HEAD }, { nodeId: 'PR_OTHER' }, { repositoryId: 99 }]) {
      assert.equal(
        await read(fixture().transport, COORDINATE, 9, undefined, { ...EXPECTED, ...extra }),
        undefined,
      );
    }
  },
  true,
);

add(
  'merged=true without merged_at is not completion proof',
  async (read) => {
    const pr = openPr({ merge_commit_sha: MERGE, merged: true, state: 'closed' });
    assert.equal(await read(fixture({ pr }).transport, COORDINATE, 9), undefined);
  },
  true,
);

add('closed without merging is not a merged delivery', async (read) => {
  const result = await read(fixture({ pr: openPr({ state: 'closed' }) }).transport, COORDINATE, 9);
  assert.ok(result);
  assert.equal(result.merged, false);
  assert.equal(result.open, false);
});

add('squash merge proof does not require the original head to be a merge parent', async (read) => {
  const pr = openPr({ merge_commit_sha: MERGE, merged: true, merged_at: DATE, state: 'closed' });
  const f = fixture({ pr });
  const result = await read(f.transport, COORDINATE, 9, undefined, { ...EXPECTED, headSha: HEAD });
  assert.equal(result?.merged, true);
  assert.equal(result.mergedAt, DATE);
  assert.equal(result.mergeCommitSha, MERGE);
  assert.ok(f.calls.every((call) => !call.path.includes('/git/commits/')));
});

add('a verified test merge commit can carry the current candidate CI', async (read) => {
  const pr = openPr({ merge_commit_sha: MERGE });
  const mergeChecks = [check(2, 'E2E', 'success', { head_sha: MERGE })];
  const result = await read(fixture({ checks: [], mergeChecks, pr }).transport, COORDINATE, 9);
  assert.equal(result?.testMergeSha, MERGE);
  assert.deepEqual(result.checks.successful, ['E2E']);
  assert.equal(result.checks.pending.length, 0);
  assert.equal(result.merged, false);
});

add(
  'a stale test merge for another base cannot certify this candidate',
  async (read) => {
    const pr = openPr({ merge_commit_sha: MERGE });
    assert.equal(
      await read(fixture({ mergeParents: [NEW_HEAD, HEAD], pr }).transport, COORDINATE, 9),
      undefined,
    );
  },
  true,
);

add('a passed synthetic check cannot mask a failed source-head check', async (read) => {
  const pr = openPr({ merge_commit_sha: MERGE });
  const checks = [check(1, 'Security', 'failure')];
  const mergeChecks = [check(2, 'Security', 'success', { head_sha: MERGE })];
  const result = await read(fixture({ checks, mergeChecks, pr }).transport, COORDINATE, 9);
  assert.ok(result?.checks.failed.includes('Security'));
});

add('transport exceptions do not leak a partial snapshot', async (read) => {
  const f = fixture({
    hook: (path) => {
      if (path.includes('/statuses?')) throw new Error('network unavailable');
      return undefined;
    },
  });
  assert.equal(await read(f.transport, COORDINATE, 9), undefined);
});

add('invalid coordinates and PR numbers do not make network requests', async (read) => {
  const f = fixture();
  assert.equal(await read(f.transport, { name: '..', owner: 'acme' }, 9), undefined);
  assert.equal(await read(f.transport, { name: 'widgets', owner: '../acme' }, 9), undefined);
  assert.equal(await read(f.transport, COORDINATE, -1), undefined);
  assert.equal(f.calls.length, 0);
});

export { cases as reviewSnapshotCases };
