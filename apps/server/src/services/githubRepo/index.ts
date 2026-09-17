import debug from 'debug';

import { UserModel } from '@/database/models/user';
import type { LobeChatDatabase } from '@/database/type';
import { MarketService } from '@/server/services/market';

const log = debug('github-repo');

const GITHUB_API = 'https://api.github.com';

export interface GithubRepoCoordinate {
  name: string;
  owner: string;
}

/**
 * Parse a workspace `repo` coordinate — `owner/repo`, `owner/repo.git`, or a
 * `https://github.com/owner/repo[.git]` URL — into `{ owner, name }`.
 */
export const parseGithubRepo = (repo: string): GithubRepoCoordinate | undefined => {
  const trimmed = repo
    .trim()
    .replace(/\.git$/, '')
    .replace(/\/+$/, '');
  const match = /^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+)$/.exec(trimmed);
  if (!match) return undefined;
  return { name: match[2], owner: match[1] };
};

/**
 * Resolve the caller's GitHub OAuth access token from Market credentials —
 * the same `github` cred the cloud sandbox injects as `GITHUB_TOKEN`. Inside a
 * workspace the credential lives on the shared organization, not the
 * operator's personal list. Returns `undefined` when no credential exists;
 * callers must tolerate anonymous API access (public repos only).
 *
 * Pass `marketService` when the caller already holds one (e.g. the aiAgent
 * pipeline's `deps.getMarketService()`); otherwise it is built from the
 * user's stored market access token.
 */
export const resolveGithubAccessToken = async (params: {
  credKey?: string;
  db: LobeChatDatabase;
  marketService?: MarketService;
  userId: string;
  workspaceId?: string;
}): Promise<string | undefined> => {
  const { credKey = 'github', db, userId, workspaceId } = params;
  try {
    let marketService = params.marketService;
    if (!marketService) {
      let accessToken: string | undefined;
      try {
        const settings = await new UserModel(db, userId).getUserSettings();
        accessToken = (settings?.market as { accessToken?: string } | undefined)?.accessToken;
      } catch {
        // non-fatal — MarketService falls back to the trusted client token
      }
      marketService = new MarketService({ accessToken, userInfo: { userId } });
    }

    const credsAccessor = workspaceId
      ? marketService.market.organizations.creds({ workspaceId })
      : marketService.market.creds;
    const list = await credsAccessor.list();
    const cred = list.data?.find((c: { key: string }) => c.key === credKey);
    if (!cred) return undefined;

    const full = await credsAccessor.get(cred.id, { decrypt: true });
    const values = (full as any).plaintext ?? (full as any).values ?? {};
    return values.access_token ?? values.token;
  } catch (error) {
    log('resolveGithubAccessToken: %O', error);
    return undefined;
  }
};

const githubFetch = async (
  path: string,
  token?: string,
  init?: { body?: unknown; method?: 'GET' | 'POST' | 'PUT' },
): Promise<{ ok: boolean; status: number; json?: any }> => {
  try {
    const res = await fetch(`${GITHUB_API}${path}`, {
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      headers: {
        Accept: 'application/vnd.github+json',
        ...(init?.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'X-GitHub-Api-Version': '2022-11-28',
      },
      method: init?.method ?? 'GET',
    });
    const json = res.status === 204 ? undefined : await res.json().catch(() => undefined);
    return { json, ok: res.ok, status: res.status };
  } catch (error) {
    log('githubFetch %s failed: %O', path, error);
    return { ok: false, status: 0 };
  }
};

/** The repo's remote default branch; `undefined` when the API can't tell. */
export const getRepoDefaultBranch = async (
  repo: string,
  token?: string,
): Promise<string | undefined> => {
  const coordinate = parseGithubRepo(repo);
  if (!coordinate) return undefined;
  const res = await githubFetch(`/repos/${coordinate.owner}/${coordinate.name}`, token);
  const branch = res.json?.default_branch;
  return typeof branch === 'string' && branch ? branch : undefined;
};

export interface RemotePrInfo {
  /** Target branch recorded on the pull request. */
  baseBranch: string;
  /** Source commit recorded on the pull request. */
  headSha: string;
  merged: boolean;
  number: number;
  /** The merge commit SHA when the PR was merged. */
  sha?: string;
  url: string;
}

/**
 * Most recent pull request whose head is `headBranch` on this repo, if any.
 * Matches on the remote side — a squash-merged PR does not make the task
 * branch an ancestor of the base, so PR state is checked alongside the
 * ancestry compare in {@link isBranchMergedInto}.
 */
export const findBranchPr = async (
  repo: string,
  headBranch: string,
  baseBranch: string,
  token?: string,
): Promise<RemotePrInfo | undefined> => {
  const coordinate = parseGithubRepo(repo);
  if (!coordinate) return undefined;
  const res = await githubFetch(
    `/repos/${coordinate.owner}/${coordinate.name}/pulls?state=all&head=${encodeURIComponent(`${coordinate.owner}:${headBranch}`)}&base=${encodeURIComponent(baseBranch)}&per_page=1`,
    token,
  );
  const pr = Array.isArray(res.json) ? res.json[0] : undefined;
  if (
    !pr?.html_url ||
    typeof pr.number !== 'number' ||
    typeof pr.head?.sha !== 'string' ||
    typeof pr.base?.ref !== 'string'
  )
    return undefined;
  return {
    baseBranch: pr.base.ref,
    headSha: pr.head.sha,
    merged: Boolean(pr.merged_at),
    number: pr.number,
    sha: typeof pr.merge_commit_sha === 'string' ? pr.merge_commit_sha : undefined,
    url: pr.html_url,
  };
};

/** Resolve the current commit of one remote branch. */
export const getRemoteBranchSha = async (
  repo: string,
  branch: string,
  token?: string,
): Promise<string | undefined> => {
  const coordinate = parseGithubRepo(repo);
  if (!coordinate) return undefined;
  const res = await githubFetch(
    `/repos/${coordinate.owner}/${coordinate.name}/branches/${encodeURIComponent(branch)}`,
    token,
  );
  return res.ok && typeof res.json?.commit?.sha === 'string' ? res.json.commit.sha : undefined;
};

export type RemoteMergeState = 'merged' | 'unmerged' | 'unknown';

export interface RemoteBranchHead {
  sha?: string;
  state: 'found' | 'missing' | 'unknown';
}

/** Resolve the current remote branch tip while preserving 404 vs API failure. */
export const getBranchHead = async (
  repo: string,
  branch: string,
  token?: string,
): Promise<RemoteBranchHead> => {
  const coordinate = parseGithubRepo(repo);
  if (!coordinate) return { state: 'unknown' };
  const res = await githubFetch(
    `/repos/${coordinate.owner}/${coordinate.name}/branches/${encodeURIComponent(branch)}`,
    token,
  );
  if (res.status === 404) return { state: 'missing' };
  if (!res.ok) return { state: 'unknown' };
  const sha = res.json?.commit?.sha;
  return typeof sha === 'string' && sha ? { sha, state: 'found' } : { state: 'unknown' };
};

/**
 * Whether `head` (a task branch) is fully contained in `base` on the remote —
 * i.e. `base` is equal to or ahead of `head`. 'unknown' covers API failures
 * (private repo without a token, rate limits, network). An ordinary unmerged
 * branch deliberately reports `unknown`: PR-bound task delivery must enter the
 * review controller rather than silently dispatching the legacy direct-merge
 * corrective path. The review controller observes the PR itself and is the
 * only component allowed to request its merge.
 */
export const isBranchMergedInto = async (params: {
  base: string;
  head: string;
  repo: string;
  token?: string;
}): Promise<RemoteMergeState> => {
  const coordinate = parseGithubRepo(params.repo);
  if (!coordinate) return 'unknown';
  const res = await githubFetch(
    `/repos/${coordinate.owner}/${coordinate.name}/compare/${encodeURIComponent(params.head)}...${encodeURIComponent(params.base)}`,
    params.token,
  );
  if (!res.ok) return 'unknown';
  const status = res.json?.status;
  if (status === 'ahead' || status === 'identical') return 'merged';
  if (status === 'behind' || status === 'diverged') return 'unknown';
  return 'unknown';
};

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
  headSha: string;
  humanCommentIds: string[];
  mergeable: boolean | null;
  mergeableState?: string;
  merged: boolean;
  mergeCommitSha?: string;
  number: number;
  open: boolean;
  requestedChangeReviewIds: string[];
  requestedReviewers: string[];
  unresolvedThreadIds: string[];
  url: string;
}

const humanActor = (user: any): boolean => user?.type !== 'Bot' && typeof user?.login === 'string';

/**
 * Read the complete delivery gate for one PR revision. The snapshot is bound to
 * the PR head/base SHA so stale CI or review evidence cannot be reused after a
 * corrective push. Ordinary comments, inline comments, requested-changes
 * reviews and unresolved review threads are returned as stable ids for the
 * task review controller's dedupe ledger.
 */
export const getPullRequestReviewSnapshot = async (
  repo: string,
  prNumber: number,
  token?: string,
): Promise<RemotePrReviewSnapshot | undefined> => {
  const coordinate = parseGithubRepo(repo);
  if (!coordinate) return undefined;
  const root = `/repos/${coordinate.owner}/${coordinate.name}`;
  const prRes = await githubFetch(`${root}/pulls/${prNumber}`, token);
  const pr = prRes.json;
  if (
    !prRes.ok ||
    typeof pr?.number !== 'number' ||
    typeof pr?.html_url !== 'string' ||
    typeof pr?.head?.sha !== 'string' ||
    typeof pr?.base?.sha !== 'string' ||
    typeof pr?.base?.ref !== 'string'
  ) {
    return undefined;
  }

  const [checksRes, reviewsRes, inlineRes, issueRes, threadRes] = await Promise.all([
    githubFetch(`${root}/commits/${encodeURIComponent(pr.head.sha)}/check-runs?per_page=100`, token),
    githubFetch(`${root}/pulls/${prNumber}/reviews?per_page=100`, token),
    githubFetch(`${root}/pulls/${prNumber}/comments?per_page=100`, token),
    githubFetch(`${root}/issues/${prNumber}/comments?per_page=100`, token),
    githubFetch('/graphql', token, {
      body: {
        query: `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100){nodes{id isResolved comments(first:1){nodes{databaseId author{login __typename}}}}}}}}`,
        variables: { name: coordinate.name, number: prNumber, owner: coordinate.owner },
      },
      method: 'POST',
    }),
  ]);

  if (!checksRes.ok || !reviewsRes.ok || !inlineRes.ok || !issueRes.ok || !threadRes.ok) {
    return undefined;
  }

  const failedConclusions = new Set([
    'action_required',
    'cancelled',
    'failure',
    'stale',
    'startup_failure',
    'timed_out',
  ]);
  const skippedConclusions = new Set(['neutral', 'skipped']);
  const checks = { failed: [] as string[], pending: [] as string[], skipped: [] as string[], successful: [] as string[] };
  const checkRuns = Array.isArray(checksRes.json?.check_runs) ? checksRes.json.check_runs : [];
  for (const check of checkRuns) {
    const name = typeof check?.name === 'string' ? check.name : 'unnamed check';
    if (check?.status !== 'completed') checks.pending.push(name);
    else if (failedConclusions.has(check?.conclusion)) checks.failed.push(name);
    else if (skippedConclusions.has(check?.conclusion)) checks.skipped.push(name);
    else if (check?.conclusion === 'success') checks.successful.push(name);
    else checks.pending.push(name);
  }
  if (checkRuns.length === 0) checks.pending.push('No CI checks reported for this revision yet');

  const reviews = Array.isArray(reviewsRes.json) ? reviewsRes.json : [];
  const requestedChangeReviewIds = reviews
    .filter((review: any) => review?.state === 'CHANGES_REQUESTED' && humanActor(review?.user))
    .map((review: any) => `review:${review.id}`);
  const inlineComments = Array.isArray(inlineRes.json) ? inlineRes.json : [];
  const issueComments = Array.isArray(issueRes.json) ? issueRes.json : [];
  const humanCommentIds = [
    ...inlineComments
      .filter((comment: any) => humanActor(comment?.user))
      .map((comment: any) => `review-comment:${comment.id}`),
    ...issueComments
      .filter((comment: any) => humanActor(comment?.user))
      .map((comment: any) => `issue-comment:${comment.id}`),
  ];

  const threadNodes = threadRes.json?.data?.repository?.pullRequest?.reviewThreads?.nodes;
  const unresolvedThreadIds = Array.isArray(threadNodes)
    ? threadNodes
        .filter((thread: any) => thread && thread.isResolved === false)
        .map((thread: any) => String(thread.id))
    : [];
  const requestedReviewers = [
    ...(Array.isArray(pr.requested_reviewers)
      ? pr.requested_reviewers.map((reviewer: any) => reviewer?.login).filter(Boolean)
      : []),
    ...(Array.isArray(pr.requested_teams)
      ? pr.requested_teams.map((team: any) => `team:${team?.slug}`).filter(Boolean)
      : []),
  ];

  return {
    baseBranch: pr.base.ref,
    baseSha: pr.base.sha,
    checks,
    draft: Boolean(pr.draft),
    headSha: pr.head.sha,
    humanCommentIds,
    mergeable: typeof pr.mergeable === 'boolean' ? pr.mergeable : null,
    mergeableState: typeof pr.mergeable_state === 'string' ? pr.mergeable_state : undefined,
    merged: Boolean(pr.merged),
    mergeCommitSha:
      typeof pr.merge_commit_sha === 'string' && pr.merge_commit_sha ? pr.merge_commit_sha : undefined,
    number: pr.number,
    open: pr.state === 'open',
    requestedChangeReviewIds,
    requestedReviewers,
    unresolvedThreadIds,
    url: pr.html_url,
  };
};

export interface MergePullRequestResult {
  merged: boolean;
  message?: string;
  sha?: string;
}

/** Merge only the exact PR revision the delivery controller reviewed. */
export const mergePullRequest = async (params: {
  expectedHeadSha: string;
  mergeMethod?: 'merge' | 'rebase' | 'squash';
  prNumber: number;
  repo: string;
  token?: string;
}): Promise<MergePullRequestResult> => {
  const coordinate = parseGithubRepo(params.repo);
  if (!coordinate) return { merged: false, message: 'Invalid GitHub repository coordinate' };
  const res = await githubFetch(
    `/repos/${coordinate.owner}/${coordinate.name}/pulls/${params.prNumber}/merge`,
    params.token,
    {
      body: { merge_method: params.mergeMethod ?? 'squash', sha: params.expectedHeadSha },
      method: 'PUT',
    },
  );
  return {
    merged: res.ok && res.json?.merged === true,
    message: typeof res.json?.message === 'string' ? res.json.message : undefined,
    sha: typeof res.json?.sha === 'string' ? res.json.sha : undefined,
  };
};