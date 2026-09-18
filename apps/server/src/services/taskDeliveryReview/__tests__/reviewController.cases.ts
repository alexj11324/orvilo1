import assert from 'node:assert/strict';
import { vi } from 'vitest';

import {
  BASE,
  DATE,
  HEAD,
  MERGE,
  NEW_HEAD,
} from '../../githubRepo/__tests__/reviewSnapshot.fixtures';
import { isRemotePrMergeReady } from '../../githubRepo/reviewGate';
import type {
  ExpectedPullRequestIdentity,
  RemotePrReviewSnapshot,
} from '../../githubRepo/reviewSnapshot';

type Row = {
  executionGeneration?: number;
  integration: {
    attempts: number;
    baseBranch: string;
    branch: string;
    expectedHeadSha?: string;
    integratedSha?: string;
    prNumber?: number;
    repo: string;
    role: string;
    state: string;
  };
  seq: number;
  status: string;
  topicId: string;
};

type Result = {
  checked: number;
  corrected: string[];
  merged: string[];
  paused: string[];
  waiting: string[];
};
export type SweepLoader = (
  mocks: Record<string, Record<string, unknown>>,
) => Promise<(db: unknown) => Promise<Result>>;

function snapshot(patch: Partial<RemotePrReviewSnapshot> = {}): RemotePrReviewSnapshot {
  return {
    baseBranch: 'main',
    baseSha: BASE,
    checks: { failed: [], pending: [], skipped: [], successful: ['Typecheck'] },
    draft: false,
    headBranch: 'task/T-1',
    headRepositoryId: 10,
    headSha: HEAD,
    humanCommentIds: [],
    humanFeedbackIds: [],
    mergeable: true,
    mergeableState: 'clean',
    merged: false,
    nodeId: 'PR_9',
    number: 9,
    open: true,
    repositoryId: 10,
    requestedChangeReviewIds: [],
    requestedReviewers: [],
    reviewDecision: null,
    unresolvedThreadIds: [],
    url: 'https://github.com/acme/widgets/pull/9',
    ...patch,
  };
}

function setup(
  options: {
    confirmation?: Partial<RemotePrReviewSnapshot>;
    failPersistence?: boolean;
    first?: Partial<RemotePrReviewSnapshot>;
    handled?: string[];
    liveTopic?: boolean;
    missingPr?: boolean;
    missingRemote?: boolean;
    runningTask?: boolean;
    noMatchingRowsAtConfirmation?: boolean;
    otherRepositoryRow?: boolean;
    premerge?: Partial<RemotePrReviewSnapshot>;
    freshTask?: Record<string, unknown>;
    rowState?: string;
    staleGeneration?: boolean;
    superseded?: boolean;
    taskCount?: number;
    unavailable?: boolean;
  } = {},
) {
  const row: Row = {
    executionGeneration: options.staleGeneration ? 2 : 3,
    integration: {
      attempts: 0,
      baseBranch: 'main',
      branch: 'task/T-1',
      expectedHeadSha: HEAD,
      ...(options.missingPr ? {} : { prNumber: 9 }),
      repo: 'acme/widgets',
      role: 'task',
      state: options.rowState ?? 'verification_pending',
    },
    seq: 1,
    status: options.liveTopic ? 'running' : 'completed',
    topicId: 'topic-1',
  };
  const rows = [row];
  if (options.otherRepositoryRow) {
    rows.push({
      ...structuredClone(row),
      seq: 0,
      topicId: 'other-topic',
      integration: { ...row.integration, repo: 'other/widgets' },
    });
  }
  if (options.superseded) {
    rows.push({
      ...structuredClone(row),
      seq: 2,
      topicId: 'newer-topic',
      integration: { ...row.integration, state: 'integrated' },
    });
  }
  const task = {
    assigneeAgentId: null,
    context: { deliveryReview: { handledFeedbackIds: options.handled ?? [] } },
    createdByUserId: 'u1',
    executionGeneration: 3,
    id: 'task-1',
    identifier: 'T-1',
    instruction: 'Fix the code',
    status: options.runningTask ? 'running' : 'paused',
    workspaceId: 'w1',
  };
  const state = {
    completed: [] as string[],
    errors: [] as (string | null)[],
    expected: [] as (ExpectedPullRequestIdentity | undefined)[],
    events: [] as string[],
    merges: [] as { expectedHeadSha: string }[],
    rows,
    runs: [] as Record<string, unknown>[],
  };
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () =>
              Array.from({ length: options.taskCount ?? 1 }, () => structuredClone(task)),
          }),
        }),
      }),
    }),
  };
  const mocks: Record<string, Record<string, unknown>> = {
    '@orvilo/types': { cloudSandboxRepoPath: () => '/workspace/widgets' },
    'debug': { __esModule: true, default: () => () => {} },
    'drizzle-orm': {
      ...Object.fromEntries(
        ['and', 'asc', 'eq', 'isNull', 'or'].map((key) => [key, (...args: unknown[]) => args]),
      ),
      sql: (strings: TemplateStringsArray, ...params: unknown[]) => ({ params, strings }),
    },
    '@/database/schemas/task': { tasks: {} },
    '@/database/models/agent': {
      AgentModel: class {
        async getAgentConfig() {
          return null;
        }
      },
    },
    '@/database/models/task': {
      TaskModel: class {
        async findById() {
          return structuredClone({ ...task, ...options.freshTask });
        }
        async update(_id: string, patch: { error?: string | null }) {
          state.errors.push(patch.error ?? null);
        }
        async updateContext(_id: string, _patch: unknown) {
          return true;
        }
      },
    },
    '@/database/models/taskTopic': {
      TaskTopicModel: class {
        async findByTaskId() {
          return structuredClone(state.rows);
        }
        async updateIntegration(_task: string, topic: string, patch: Partial<Row['integration']>) {
          state.events.push('persist-pr');
          if (options.failPersistence) return false;
          const found = state.rows.find((item) => item.topicId === topic);
          if (!found) return false;
          Object.assign(found.integration, patch);
          return true;
        }
      },
    },
    '@/server/services/task': {
      TaskService: class {
        async updateStatus(args: { status: string }) {
          if (args.status === 'paused') state.events.push('enter-review');
          if (args.status === 'completed') state.completed.push(args.status);
        }
      },
    },
    '@/server/services/taskRunner': {
      TaskRunnerService: class {
        async runTask(args: Record<string, unknown>) {
          state.runs.push(args);
        }
      },
    },
    '@/server/services/githubRepo': {
      createPullRequestForBranch: async () => {
        state.events.push('create-pr');
        return { number: 9, url: 'https://github.com/acme/widgets/pull/9' };
      },
      findBranchPr: async () => undefined,
      getRemoteBranchSha: async () => (options.missingRemote ? undefined : HEAD),
      isRemotePrMergeReady,
      mergePullRequest: async (args: { expectedHeadSha: string }) => {
        state.merges.push(args);
        // The confirmation, not this response body, is the authority for the merge SHA.
        return { merged: true, sha: 'wrong-response-sha' };
      },
      resolveGithubAccessToken: async () => 'fixture-token',
      getPullRequestReviewSnapshot: async (
        _repo: string,
        _number: number,
        _token: string,
        expected?: ExpectedPullRequestIdentity,
      ) => {
        state.expected.push(expected);
        if (options.unavailable) return undefined;
        // Call 1 is the sweep read, call 2 the merge-boundary revalidation,
        // calls >= 3 the post-merge confirmation.
        const result =
          state.expected.length === 1
            ? snapshot(options.first)
            : state.expected.length === 2
              ? snapshot(options.premerge)
              : snapshot({
                  merged: true,
                  mergedAt: DATE,
                  mergeCommitSha: MERGE,
                  open: false,
                  ...options.confirmation,
                });
        if (state.expected.length >= 3 && options.noMatchingRowsAtConfirmation) state.rows = [];
        if (
          expected &&
          (result.baseBranch !== expected.baseBranch ||
            result.headBranch !== expected.headBranch ||
            (expected.headSha !== undefined && expected.headSha !== result.headSha) ||
            (expected.nodeId !== undefined && expected.nodeId !== result.nodeId) ||
            (expected.repositoryId !== undefined && expected.repositoryId !== result.repositoryId))
        )
          return undefined;
        return result;
      },
    },
  };
  return { db, mocks, state };
}

export interface ControllerCase {
  name: string;
  regression?: boolean;
  run: (load: SweepLoader) => Promise<void>;
}
const cases: ControllerCase[] = [];
const add = (name: string, run: ControllerCase['run'], regression = true) =>
  cases.push({ name, regression, run });

add('does not merge an otherwise green PR when GitHub says blocked', async (load) => {
  const f = setup({ first: { mergeableState: 'blocked' } });
  const result = await (await load(f.mocks))(f.db);
  assert.equal(f.state.merges.length, 0);
  assert.equal(f.state.completed.length, 0);
  assert.deepEqual(result.waiting, ['T-1']);
});

add('confirmation must match the head passed to the merge request', async (load) => {
  const f = setup({ confirmation: { headSha: NEW_HEAD } });
  await (
    await load(f.mocks)
  )(f.db);
  assert.equal(f.state.merges.length, 1);
  assert.equal(f.state.completed.length, 0);
  assert.equal(f.state.expected[1]?.headSha, HEAD);
});

add('confirmation cannot silently change target branch or repository identity', async (load) => {
  for (const confirmation of [
    { baseBranch: 'release' },
    { repositoryId: 99 },
    { nodeId: 'PR_OTHER' },
  ]) {
    const f = setup({ confirmation });
    await (
      await load(f.mocks)
    )(f.db);
    assert.equal(f.state.completed.length, 0);
  }
});

add('failed proof persistence does not call completed', async (load) => {
  const f = setup({ failPersistence: true });
  await (
    await load(f.mocks)
  )(f.db);
  assert.equal(f.state.completed.length, 0);
  assert.ok(f.state.errors.some((error) => error?.includes('proof')));
});

add('a disappeared delivery row cannot be completed', async (load) => {
  const f = setup({ noMatchingRowsAtConfirmation: true });
  await (
    await load(f.mocks)
  )(f.db);
  assert.equal(f.state.completed.length, 0);
});

add('a same-name branch from another repository is not stamped integrated', async (load) => {
  const f = setup({
    otherRepositoryRow: true,
    first: { merged: true, mergedAt: DATE, mergeCommitSha: MERGE, open: false },
  });
  await (
    await load(f.mocks)
  )(f.db);
  assert.equal(
    f.state.rows.find((row) => row.topicId === 'other-topic')?.integration.state,
    'verification_pending',
  );
});

add(
  'a newer integrated delivery retries completion instead of resurrecting the pending row',
  async (load) => {
    const f = setup({ superseded: true });
    const result = await (await load(f.mocks))(f.db);
    // The integrated successor owns the outcome: completion is retried (the
    // DB gate re-verifies proof) without dispatching or re-reading GitHub.
    assert.equal(f.state.completed.length, 1);
    assert.equal(f.state.expected.length, 0);
    assert.equal(f.state.merges.length, 0);
    assert.deepEqual(result.merged, ['T-1']);
  },
);

add('a delivery row from a superseded generation is ignored', async (load) => {
  const f = setup({ staleGeneration: true });
  const result = await (await load(f.mocks))(f.db);
  assert.equal(result.checked, 0);
  assert.equal(f.state.expected.length, 0);
  assert.equal(f.state.merges.length, 0);
  assert.equal(f.state.completed.length, 0);
});

add('a mid-sweep restart fences the merge against the new generation', async (load) => {
  const f = setup({ freshTask: { executionGeneration: 4, status: 'running' } });
  const result = await (await load(f.mocks))(f.db);
  assert.equal(f.state.merges.length, 0);
  assert.equal(f.state.completed.length, 0);
  assert.deepEqual(result.waiting, ['T-1']);
});

add('a deleted task cannot merge its stale review snapshot', async (load) => {
  const f = setup({ freshTask: { isDeleted: true } });
  const result = await (await load(f.mocks))(f.db);
  assert.equal(f.state.merges.length, 0);
  assert.equal(f.state.completed.length, 0);
  assert.deepEqual(result.waiting, ['T-1']);
});

add('a late pending check re-read at the merge boundary blocks the merge', async (load) => {
  const f = setup({
    premerge: { checks: { failed: [], pending: ['Typecheck'], skipped: [], successful: [] } },
  });
  const result = await (await load(f.mocks))(f.db);
  assert.equal(f.state.expected.length, 2);
  assert.equal(f.state.merges.length, 0);
  assert.equal(f.state.completed.length, 0);
  assert.deepEqual(result.waiting, ['T-1']);
});

add(
  'an externally merged PR detected at the merge boundary completes through proof',
  async (load) => {
    const f = setup({
      premerge: { merged: true, mergedAt: DATE, mergeCommitSha: MERGE, open: false },
    });
    const result = await (await load(f.mocks))(f.db);
    assert.equal(f.state.merges.length, 0);
    assert.equal(f.state.completed.length, 1);
    assert.deepEqual(result.merged, ['T-1']);
  },
);

add(
  'a delivered-but-unbound row is adopted into review by establishing its PR',
  async (load) => {
    const f = setup({ missingPr: true, rowState: 'pending', runningTask: true });
    const result = await (await load(f.mocks))(f.db);
    assert.ok(f.state.events.includes('create-pr'));
    assert.equal(f.state.merges.length, 1);
    assert.equal(f.state.completed.length, 1);
    assert.deepEqual(result.merged, ['T-1']);
  },
);

add('the sweep stops taking new candidates once its time budget is spent', async (load) => {
  const f = setup({ taskCount: 50 });
  let calls = 0;
  const spy = vi.spyOn(Date, 'now').mockImplementation(() => {
    calls += 1;
    // Call 1 sets the deadline and call 2 is the first loop check; every
    // later call reports the budget spent.
    return calls <= 2 ? 0 : 11 * 60 * 1000;
  });
  try {
    const result = await (await load(f.mocks))(f.db);
    assert.equal(result.checked, 1);
  } finally {
    spy.mockRestore();
  }
});

add('paused with a still-live topic does not dispatch or merge', async (load) => {
  const f = setup({ liveTopic: true });
  await (
    await load(f.mocks)
  )(f.db);
  assert.equal(f.state.expected.length, 0);
  assert.equal(f.state.runs.length, 0);
  assert.equal(f.state.merges.length, 0);
});

add(
  'edits to handled comments schedule a new correction on the same issue and PR',
  async (load) => {
    const f = setup({
      handled: ['issue-comment:1'],
      first: {
        humanCommentIds: ['issue-comment:1'],
        humanFeedbackIds: [`issue-comment:1@${DATE}`],
      },
    });
    const result = await (await load(f.mocks))(f.db);
    assert.deepEqual(result.corrected, ['T-1']);
    assert.equal(f.state.runs.length, 1);
    assert.equal(f.state.runs[0].taskId, 'task-1');
    assert.equal((f.state.runs[0].integrationSeed as { prNumber: number }).prNumber, 9);
    assert.equal(f.state.merges.length, 0);
  },
);

add('missing remote delivery does not enter review without a PR', async (load) => {
  const f = setup({ missingPr: true, missingRemote: true, runningTask: true });
  const result = await (await load(f.mocks))(f.db);
  assert.deepEqual(result.waiting, ['T-1']);
  assert.equal(f.state.events.includes('enter-review'), false);
  assert.equal(f.state.events.includes('create-pr'), false);
});

add('persists the canonical PR before entering review', async (load) => {
  const f = setup({ missingPr: true, runningTask: true, first: { draft: true } });
  await (
    await load(f.mocks)
  )(f.db);
  const persisted = f.state.events.indexOf('persist-pr');
  const entered = f.state.events.indexOf('enter-review');
  assert.ok(persisted >= 0);
  assert.ok(entered > persisted);
  assert.equal(f.state.events.filter((event) => event === 'create-pr').length, 1);
});

add('an external merge of a different accepted head is not completed', async (load) => {
  const f = setup({
    first: { merged: true, mergedAt: DATE, mergeCommitSha: MERGE, open: false, headSha: NEW_HEAD },
  });
  await (
    await load(f.mocks)
  )(f.db);
  assert.equal(f.state.completed.length, 0);
  assert.ok(f.state.errors.some((error) => error?.includes('accepted delivery')));
});

add('the confirmed merge proof wins over the merge API response SHA', async (load) => {
  const f = setup();
  const result = await (await load(f.mocks))(f.db);
  assert.deepEqual(result.merged, ['T-1']);
  assert.equal(f.state.completed.length, 1);
  assert.equal(f.state.rows[0].integration.integratedSha, MERGE);
  assert.equal(f.state.expected[0]?.headBranch, 'task/T-1');
});

add(
  'an unavailable snapshot leaves the task waiting without a write',
  async (load) => {
    const f = setup({ unavailable: true });
    const result = await (await load(f.mocks))(f.db);
    assert.deepEqual(result.waiting, ['T-1']);
    assert.equal(f.state.merges.length, 0);
    assert.equal(f.state.completed.length, 0);
  },
  false,
);

export { cases as reviewControllerCases };
