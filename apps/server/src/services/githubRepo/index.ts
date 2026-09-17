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
): Promise<{ ok: boolean; status: number; json?: any }> => {
  try {
    const res = await fetch(`${GITHUB_API}${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
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

export interface VerifiedGithubRepository {
  coordinate: { cloneUrl?: string; name: string; owner: string; url: string };
  defaultBranch?: string;
  isFork: boolean;
  parent?: { name: string; owner: string; url: string };
  /** Stable provider-side repository id — the identity, never the slug. */
  remoteRepositoryId: string;
}

/**
 * Verify a GitHub repository through the provider API and return its stable
 * remote identity. `undefined` when the repo is unreachable (private repo
 * without a credential, wrong slug, or API failure) — callers must treat the
 * registration as unverifiable rather than minting a synthetic remote id.
 */
export const verifyGithubRepository = async (
  repo: string,
  token?: string,
): Promise<VerifiedGithubRepository | undefined> => {
  const coordinate = parseGithubRepo(repo);
  if (!coordinate) return undefined;
  const res = await githubFetch(`/repos/${coordinate.owner}/${coordinate.name}`, token);
  if (!res.ok || typeof res.json?.id !== 'number') return undefined;

  const parent =
    res.json.parent && typeof res.json.parent.full_name === 'string'
      ? {
          name: res.json.parent.name as string,
          owner: res.json.parent.owner?.login as string,
          url: res.json.parent.html_url as string,
        }
      : undefined;

  return {
    coordinate: {
      cloneUrl: res.json.clone_url,
      name: res.json.name,
      owner: res.json.owner?.login ?? coordinate.owner,
      url: res.json.html_url,
    },
    defaultBranch: res.json.default_branch,
    isFork: res.json.fork === true,
    parent,
    remoteRepositoryId: String(res.json.id),
  };
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
 * (private repo without a token, rate limits, network) so callers can decide
 * between retrying and trusting the run's own report.
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
  if (status === 'behind' || status === 'diverged') return 'unmerged';
  return 'unknown';
};
