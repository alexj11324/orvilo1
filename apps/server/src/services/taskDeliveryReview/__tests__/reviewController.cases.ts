import assert from 'node:assert/strict';

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
  integration: {
    attempts: number;
    baseBranch: string;
    branch: string;
    expectedHeadSha?: string;
    integratedSha?: string;
    prNumber: number;
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
    noMatchingRowsAtConfirmation?: boolean;
    otherRepositoryRow?: boolean;
    superseded?: boolean;
    unavailable?: boolean;
  } = {},
) {
  const row: Row = {
    integration: {
      attempts: 0,
      baseBranch: 'main',
      branch: 'task/T-1',
      expectedHeadSha: HEAD,
      prNumber: 9,
      repo: 'acme/widgets',
      role: 'task',
      state: 'verification_pending',
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
    id: 'task-1',
    identifier: 'T-1',
    instruction: 'Fix the code',
    status: 'paused',
    workspaceId: 'w1',
  };
  const state = {
    completed: [] as string[],
    errors: [] as (string | null)[],
    expected: [] as (ExpectedPullRequestIdentity | undefined)[],
    merges: [] as { expectedHeadSha: string }[],
    rows,
    runs: [] as Record<string, unknown>[],
  };
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => [structuredClone(task)],
          }),
        }),
      }),
    }),
  };
  const mocks: Record<string, Record<string, unknown>> = {
    '@orvilo/types': { cloudSandboxRepoPath: () => '/workspace/widgets' },
    'debug': { __esModule: true, default: () => () => {} },
    'drizzle-orm': Object.fromEntries(
      ['and', 'asc', 'eq', 'isNull', 'or'].map((key) => [key, (...args: unknown[]) => args]),
    ),
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
        throw new Error('Unexpected new PR');
      },
      getRemoteBranchSha: async () => HEAD,
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
        const result =
          state.expected.length === 1
            ? snapshot(options.first)
            : snapshot({
                merged: true,
                mergedAt: DATE,
                mergeCommitSha: MERGE,
                open: false,
                ...options.confirmation,
              });
        if (state.expected.length > 1 && options.noMatchingRowsAtConfirmation) state.rows = [];
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

add('a newer delivery supersedes an older pending row', async (load) => {
  const f = setup({ superseded: true });
  const result = await (await load(f.mocks))(f.db);
  assert.equal(result.checked, 0);
  assert.equal(f.state.expected.length, 0);
  assert.equal(f.state.merges.length, 0);
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
