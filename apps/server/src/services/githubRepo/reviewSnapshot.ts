import { createHash } from 'node:crypto';

/** A complete, revision-fenced GitHub snapshot. No database or mutation side effects. */
export interface GithubSnapshotResponse {
  json?: unknown;
  ok: boolean;
  status: number;
}

export type GithubSnapshotTransport = (
  path: string,
  token?: string,
  init?: { body?: unknown; method?: 'GET' | 'POST' | 'PUT' },
) => Promise<GithubSnapshotResponse>;

export interface ExpectedPullRequestIdentity {
  baseBranch: string;
  headBranch: string;
  headSha?: string;
  nodeId?: string;
  repositoryId?: number;
  /** Managed delivery branches must belong to the base repository, not a namesake fork. */
  sameRepository?: boolean;
}

export interface RemotePrReviewSnapshot {
  baseBranch: string;
  baseSha: string;
  checks: {
    failed: string[];
    pending: string[];
    skipped: string[];
    successful: string[];
  };
  draft: boolean;
  headBranch: string;
  headRepositoryId: number;
  headSha: string;
  /** Stable source IDs retained for existing callers and historical audit records. */
  humanCommentIds: string[];
  /** Unlike an ID alone, this cursor notices edits to an already processed comment. */
  humanFeedbackIds: string[];
  mergeable: boolean | null;
  mergeableState?: string;
  mergeCommitSha?: string;
  merged: boolean;
  mergedAt?: string;
  nodeId: string;
  number: number;
  open: boolean;
  repositoryId: number;
  requestedChangeReviewIds: string[];
  requestedReviewers: string[];
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
  testMergeSha?: string;
  unresolvedThreadIds: string[];
  url: string;
}

type JsonObject = Record<string, unknown>;
type PrIdentity = Omit<
  RemotePrReviewSnapshot,
  | 'checks'
  | 'humanCommentIds'
  | 'humanFeedbackIds'
  | 'requestedChangeReviewIds'
  | 'reviewDecision'
  | 'testMergeSha'
  | 'unresolvedThreadIds'
> & { updatedAt: string };

const PAGE_SIZE = 100;
// A cap bounds work, not correctness: reaching it returns unknown, never a partial success.
const MAX_PAGES = 20;
const NON_DELIVERY_CHECK_NAMES = new Set(['Check Duplicate Run']);
const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const isSha = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f\d]{40}$/i.test(value);
const isDate = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T/.test(value) &&
  Number.isFinite(Date.parse(value));

function parsePr(
  value: unknown,
  repo: string,
  number: number,
  expected?: ExpectedPullRequestIdentity,
): PrIdentity | undefined {
  if (!isObject(value) || !isObject(value.base) || !isObject(value.head)) return;
  const { base, head } = value;
  if (!isObject(base.repo) || !isObject(head.repo)) return;
  if (
    value.number !== number ||
    !isString(value.node_id) ||
    !isString(base.repo.full_name) ||
    base.repo.full_name.toLowerCase() !== repo.toLowerCase() ||
    !isId(base.repo.id) ||
    !isId(head.repo.id) ||
    !isString(base.ref) ||
    !isString(head.ref) ||
    !isSha(base.sha) ||
    !isSha(head.sha) ||
    typeof value.draft !== 'boolean' ||
    typeof value.merged !== 'boolean' ||
    (value.state !== 'open' && value.state !== 'closed') ||
    (typeof value.mergeable !== 'boolean' && value.mergeable !== null) ||
    !isDate(value.updated_at) ||
    !Array.isArray(value.requested_reviewers) ||
    !Array.isArray(value.requested_teams) ||
    !isString(value.html_url)
  )
    return;

  const canonicalUrl = `https://github.com/${repo}/pull/${number}`;
  if (value.html_url.toLowerCase() !== canonicalUrl.toLowerCase()) return;
  if (
    expected &&
    (base.ref !== expected.baseBranch ||
      head.ref !== expected.headBranch ||
      (expected.headSha !== undefined && head.sha !== expected.headSha) ||
      (expected.nodeId !== undefined && value.node_id !== expected.nodeId) ||
      (expected.repositoryId !== undefined && base.repo.id !== expected.repositoryId) ||
      (expected.sameRepository && base.repo.id !== head.repo.id))
  )
    return;

  // merge_commit_sha alone can refer to an *unmerged test merge*, not delivery proof.
  if (
    value.merged &&
    (value.state !== 'closed' || !isDate(value.merged_at) || !isSha(value.merge_commit_sha))
  )
    return;
  if (!value.merged && value.merged_at !== null) return;
  if (value.merge_commit_sha !== null && !isSha(value.merge_commit_sha)) return;

  const requestedReviewers: string[] = [];
  for (const reviewer of value.requested_reviewers) {
    if (!isObject(reviewer) || !isString(reviewer.login)) return;
    requestedReviewers.push(reviewer.login);
  }
  for (const team of value.requested_teams) {
    if (!isObject(team) || !isString(team.slug)) return;
    requestedReviewers.push(`team:${team.slug}`);
  }
  return {
    baseBranch: base.ref,
    baseSha: base.sha,
    draft: value.draft,
    headBranch: head.ref,
    headRepositoryId: head.repo.id,
    headSha: head.sha,
    mergeable: value.mergeable,
    mergeableState: isString(value.mergeable_state) ? value.mergeable_state : undefined,
    merged: value.merged,
    mergedAt: value.merged && isDate(value.merged_at) ? value.merged_at : undefined,
    mergeCommitSha: isSha(value.merge_commit_sha) ? value.merge_commit_sha : undefined,
    nodeId: value.node_id,
    number,
    open: value.state === 'open',
    repositoryId: base.repo.id,
    requestedReviewers: requestedReviewers.sort(),
    updatedAt: value.updated_at,
    url: canonicalUrl,
  };
}

async function readPages(
  request: GithubSnapshotTransport,
  path: string,
  token: string | undefined,
  field?: 'check_runs',
): Promise<JsonObject[] | undefined> {
  const rows: JsonObject[] = [];
  const seenIds = new Set<number>();
  let total: number | undefined;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const separator = path.includes('?') ? '&' : '?';
    const response = await request(`${path}${separator}per_page=${PAGE_SIZE}&page=${page}`, token);
    if (!response.ok) return;
    const data = field
      ? isObject(response.json)
        ? response.json[field]
        : undefined
      : response.json;
    if (!Array.isArray(data) || data.length > PAGE_SIZE) return;
    if (field) {
      const count = isObject(response.json) ? response.json.total_count : undefined;
      if (
        typeof count !== 'number' ||
        !Number.isSafeInteger(count) ||
        count < 0 ||
        (total !== undefined && total !== count)
      )
        return;
      total = count;
    }
    for (const row of data) {
      // Duplicate IDs across pages indicate an unstable listing (or a broken cursor).
      if (!isObject(row) || !isId(row.id) || seenIds.has(row.id)) return;
      seenIds.add(row.id);
      rows.push(row);
    }
    if (data.length < PAGE_SIZE)
      return total === undefined || total === rows.length ? rows : undefined;
  }
  return undefined;
}

async function readThreads(
  request: GithubSnapshotTransport,
  coordinate: { name: string; owner: string },
  pr: PrIdentity,
  token?: string,
): Promise<
  | {
      reviewDecision: RemotePrReviewSnapshot['reviewDecision'];
      unresolvedThreadIds: string[];
    }
  | undefined
> {
  const unresolvedThreadIds: string[] = [];
  const threadIds = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | null = null;
  let decision: RemotePrReviewSnapshot['reviewDecision'] | undefined;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await request('/graphql', token, {
      body: {
        query: `query($owner:String!,$name:String!,$number:Int!,$after:String){repository(owner:$owner,name:$name){pullRequest(number:$number){id headRefOid baseRefOid reviewDecision reviewThreads(first:100,after:$after){nodes{id isResolved} pageInfo{hasNextPage endCursor}}}}}`,
        variables: { ...coordinate, after: cursor, number: pr.number },
      },
      method: 'POST',
    });
    const json = response.json;
    if (
      !response.ok ||
      !isObject(json) ||
      (json.errors !== undefined && (!Array.isArray(json.errors) || json.errors.length > 0))
    )
      return;
    if (!isObject(json.data) || !isObject(json.data.repository)) return;
    const pull = json.data.repository.pullRequest;
    if (
      !isObject(pull) ||
      pull.id !== pr.nodeId ||
      pull.headRefOid !== pr.headSha ||
      pull.baseRefOid !== pr.baseSha ||
      !isObject(pull.reviewThreads)
    )
      return;
    const { reviewDecision, reviewThreads } = pull;
    if (
      reviewDecision !== null &&
      reviewDecision !== 'APPROVED' &&
      reviewDecision !== 'CHANGES_REQUESTED' &&
      reviewDecision !== 'REVIEW_REQUIRED'
    )
      return;
    if (decision !== undefined && reviewDecision !== decision) return;
    decision = reviewDecision;
    const info = reviewThreads.pageInfo;
    if (
      !Array.isArray(reviewThreads.nodes) ||
      reviewThreads.nodes.length > PAGE_SIZE ||
      !isObject(info) ||
      typeof info.hasNextPage !== 'boolean'
    )
      return;
    for (const thread of reviewThreads.nodes) {
      if (
        !isObject(thread) ||
        !isString(thread.id) ||
        typeof thread.isResolved !== 'boolean' ||
        threadIds.has(thread.id)
      )
        return;
      threadIds.add(thread.id);
      // `isOutdated` only moves the code anchor. It never resolves the finding.
      if (!thread.isResolved) unresolvedThreadIds.push(thread.id);
    }
    if (!info.hasNextPage) return { reviewDecision, unresolvedThreadIds };
    if (
      !isString(info.endCursor) ||
      cursors.has(info.endCursor) ||
      reviewThreads.nodes.length === 0
    )
      return;
    cursor = info.endCursor;
    cursors.add(cursor);
  }
  return undefined;
}

function classifyChecks(
  checkRuns: JsonObject[],
  statuses: JsonObject[],
  sha: string,
): RemotePrReviewSnapshot['checks'] | undefined {
  const checks: RemotePrReviewSnapshot['checks'] = {
    failed: [],
    pending: [],
    skipped: [],
    successful: [],
  };
  const latestRuns = new Map<string, JsonObject>();
  for (const run of checkRuns) {
    if (
      !isString(run.name) ||
      run.head_sha !== sha ||
      !isId(run.id) ||
      !isObject(run.app) ||
      !isId(run.app.id) ||
      !isString(run.status)
    )
      return;
    const key = `${run.app.id}\0${run.name}`;
    const previous = latestRuns.get(key);
    if (!previous || Number(previous.id) < run.id) latestRuns.set(key, run);
  }
  const failedConclusions = new Set([
    'action_required',
    'cancelled',
    'failure',
    'stale',
    'startup_failure',
    'timed_out',
  ]);
  for (const run of latestRuns.values()) {
    const name = String(run.name);
    // Ignore only the successful bookkeeping guard; its failure must still block.
    if (run.status !== 'completed') checks.pending.push(name);
    else if (failedConclusions.has(String(run.conclusion))) checks.failed.push(name);
    else if (
      run.conclusion === 'neutral' ||
      run.conclusion === 'skipped' ||
      (run.conclusion === 'success' && NON_DELIVERY_CHECK_NAMES.has(name))
    )
      checks.skipped.push(name);
    else if (run.conclusion === 'success') checks.successful.push(name);
    else checks.pending.push(name);
  }
  const latestStatuses = new Map<string, JsonObject>();
  for (const status of statuses) {
    if (!isString(status.context) || !isId(status.id) || !isString(status.state)) return;
    const previous = latestStatuses.get(status.context);
    if (!previous || Number(previous.id) < status.id) latestStatuses.set(status.context, status);
  }
  for (const status of latestStatuses.values()) {
    const name = String(status.context);
    if (status.state === 'failure' || status.state === 'error') checks.failed.push(name);
    else if (status.state === 'success') {
      (NON_DELIVERY_CHECK_NAMES.has(name) ? checks.skipped : checks.successful).push(name);
    } else checks.pending.push(name);
  }
  return checks;
}

function parseReviews(rows: JsonObject[]): string[] | undefined {
  const decisive = new Map<string, JsonObject>();
  const ordered = [...rows].sort((a, b) => Number(a.id) - Number(b.id));
  for (const review of ordered) {
    if (!isId(review.id) || !isString(review.state)) return;
    if (
      !['PENDING', 'COMMENTED', 'APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state)
    )
      return;
    if (review.state === 'PENDING' || review.state === 'COMMENTED') continue;
    if (review.user !== null && (!isObject(review.user) || !isId(review.user.id))) return;
    // Include bots' formal decisions; a null/deleted author cannot erase a blocking review.
    const actor = isObject(review.user) ? `actor:${review.user.id}` : `deleted:${review.id}`;
    decisive.set(actor, review);
  }
  return [...decisive.values()]
    .filter((review) => review.state === 'CHANGES_REQUESTED')
    .map((review) => `review:${review.id}`);
}

function parseComments(
  rows: JsonObject[],
  prefix: string,
  selfLogin?: string,
):
  | {
      ids: string[];
      versions: string[];
    }
  | undefined {
  const ids: string[] = [];
  const versions: string[] = [];
  for (const comment of rows) {
    if (
      !isId(comment.id) ||
      !isDate(comment.updated_at) ||
      (typeof comment.body !== 'string' && comment.body !== null)
    )
      return;
    if (
      comment.user !== null &&
      (!isObject(comment.user) || !isString(comment.user.type) || !isString(comment.user.login))
    )
      return;
    // This patch preserves the existing human-comment scheduling policy. Bot thread/review
    // blockers remain enforced; arbitrary bot chatter is not promoted into agent commands.
    if (!isObject(comment.user) || comment.user.type === 'Bot') continue;
    // Replies the corrective run posts through the delivery credential are the
    // controller's own output, not new human feedback — treating them as such
    // would dispatch a corrective run in response to its own comments. The
    // credential's owner is the actor; a reviewer who wants to block the
    // delivery uses a different account or a formal review.
    if (selfLogin && isString(comment.user.login) && comment.user.login.toLowerCase() === selfLogin)
      continue;
    const id = `${prefix}:${comment.id}`;
    ids.push(id);
    const digest = createHash('sha256').update(JSON.stringify(comment.body)).digest('hex');
    versions.push(`${id}@${comment.updated_at}:${digest}`);
  }
  return { ids, versions };
}

async function resolveTestMerge(
  request: GithubSnapshotTransport,
  root: string,
  pr: PrIdentity,
  token?: string,
): Promise<{ sha?: string } | undefined> {
  if (pr.merged || !pr.mergeCommitSha) return {};
  const result = await request(`${root}/git/commits/${pr.mergeCommitSha}`, token);
  if (
    !result.ok ||
    !isObject(result.json) ||
    result.json.sha !== pr.mergeCommitSha ||
    !Array.isArray(result.json.parents) ||
    result.json.parents.length !== 2
  )
    return;
  const [base, head] = result.json.parents;
  if (!isObject(base) || !isObject(head) || base.sha !== pr.baseSha || head.sha !== pr.headSha)
    return;
  return { sha: pr.mergeCommitSha };
}

/**
 * A missing, malformed, truncated, unauthorized or concurrently changed response is unknown.
 * It must not become an empty set of blockers. This snapshot does not replace repository
 * protection, product acceptance, writer fencing or a transactionally owned delivery epoch.
 */
export async function readPullRequestReviewSnapshot(
  request: GithubSnapshotTransport,
  coordinate: { name: string; owner: string },
  number: number,
  token?: string,
  expected?: ExpectedPullRequestIdentity,
): Promise<RemotePrReviewSnapshot | undefined> {
  if (
    !isId(number) ||
    !/^[\w.-]+$/.test(coordinate.name) ||
    !/^[\w-]+$/.test(coordinate.owner) ||
    coordinate.name === '.' ||
    coordinate.name === '..'
  )
    return;
  const repo = `${coordinate.owner}/${coordinate.name}`;
  const root = `/repos/${repo}`;
  try {
    const first = await request(`${root}/pulls/${number}`, token);
    if (!first.ok) return;
    const pr = parsePr(first.json, repo, number, expected);
    if (!pr) return;
    const [checkRuns, statuses, reviews, inline, ordinary, threads, testMerge, viewer] =
      await Promise.all([
        readPages(
          request,
          `${root}/commits/${pr.headSha}/check-runs?filter=latest`,
          token,
          'check_runs',
        ),
        readPages(request, `${root}/commits/${pr.headSha}/statuses`, token),
        readPages(request, `${root}/pulls/${number}/reviews`, token),
        readPages(request, `${root}/pulls/${number}/comments`, token),
        readPages(request, `${root}/issues/${number}/comments`, token),
        readThreads(request, coordinate, pr, token),
        resolveTestMerge(request, root, pr, token),
        // The credential owner's login lets the feedback cursor tell the
        // controller's own replies from human review. A token without /user
        // scope (e.g. an installation token) simply yields no exclusion — those
        // actors post as Bots and are already filtered.
        request('/user', token),
      ]);
    if (!checkRuns || !statuses || !reviews || !inline || !ordinary || !threads || !testMerge)
      return;
    const selfLogin =
      viewer.ok && isObject(viewer.json) && isString(viewer.json.login)
        ? viewer.json.login.toLowerCase()
        : undefined;
    const checks = classifyChecks(checkRuns, statuses, pr.headSha);
    if (!checks) return;
    if (testMerge.sha) {
      const [mergeRuns, mergeStatuses] = await Promise.all([
        readPages(
          request,
          `${root}/commits/${testMerge.sha}/check-runs?filter=latest`,
          token,
          'check_runs',
        ),
        readPages(request, `${root}/commits/${testMerge.sha}/statuses`, token),
      ]);
      if (!mergeRuns || !mergeStatuses) return;
      const mergeChecks = classifyChecks(mergeRuns, mergeStatuses, testMerge.sha);
      if (!mergeChecks) return;
      // Conservative union: a passing synthetic check cannot hide a failing head check.
      for (const key of ['failed', 'pending', 'skipped', 'successful'] as const) {
        checks[key].push(...mergeChecks[key]);
      }
    }
    for (const key of ['failed', 'pending', 'skipped', 'successful'] as const) {
      checks[key] = [...new Set(checks[key])];
    }
    if (
      checks.successful.length === 0 &&
      checks.failed.length === 0 &&
      checks.pending.length === 0
    ) {
      checks.pending.push(
        checks.skipped.length === 0
          ? 'No CI checks reported for this revision yet'
          : 'No delivery CI check executed successfully for this revision',
      );
    }
    // Required approvals may be missing even when nobody remains in requested_reviewers.
    if (
      threads.reviewDecision === 'REVIEW_REQUIRED' ||
      threads.reviewDecision === 'CHANGES_REQUESTED'
    ) {
      checks.pending.push(`GitHub review decision: ${threads.reviewDecision}`);
    }
    const requestedChangeReviewIds = parseReviews(reviews);
    const inlineComments = parseComments(inline, 'review-comment', selfLogin);
    const ordinaryComments = parseComments(ordinary, 'issue-comment', selfLogin);
    if (!requestedChangeReviewIds || !inlineComments || !ordinaryComments) return;

    // Fence the whole read, including a base-branch change or retarget while pagination ran.
    const final = await request(`${root}/pulls/${number}`, token);
    const last = final.ok ? parsePr(final.json, repo, number, expected) : undefined;
    if (!last || JSON.stringify(pr) !== JSON.stringify(last)) return;
    const { updatedAt: _updatedAt, ...identity } = pr;
    return {
      ...identity,
      checks,
      humanCommentIds: [...inlineComments.ids, ...ordinaryComments.ids],
      humanFeedbackIds: [...inlineComments.versions, ...ordinaryComments.versions],
      requestedChangeReviewIds,
      reviewDecision: threads.reviewDecision,
      testMergeSha: testMerge.sha,
      unresolvedThreadIds: threads.unresolvedThreadIds,
    };
  } catch {
    // Transport failure is retried by the durable controller; no partial result escapes.
    return undefined;
  }
}
