import debug from 'debug';

import { UserModel } from '@/database/models/user';
import type { OrviloDatabase } from '@/database/type';
import { MarketService } from '@/server/services/market';

import {
  type ExpectedPullRequestIdentity,
  readPullRequestReviewSnapshot,
  type RemotePrReviewSnapshot,
} from './reviewSnapshot';

export { isRemotePrMergeReady } from './reviewGate';
export type { ExpectedPullRequestIdentity, RemotePrReviewSnapshot } from './reviewSnapshot';

const log = debug('github-repo');
const GITHUB_API = 'https://api.github.com';

export interface GithubRepoCoordinate {
  name: string;
  owner: string;
}

export const parseGithubRepo = (repo: string): GithubRepoCoordinate | undefined => {
  const trimmed = repo
    .trim()
    .replace(/\.git$/, '')
    .replace(/\/+$/, '');
  const match = /^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+)$/.exec(trimmed);
  if (!match) return undefined;
  return { name: match[2], owner: match[1] };
};

export const resolveGithubAccessToken = async (params: {
  credKey?: string;
  db: OrviloDatabase;
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
        // MarketService can still use its trusted client token.
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
        'Accept': 'application/vnd.github+json',
        ...(init?.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'X-GitHub-Api-Version': '2022-11-28',
      },
      method: init?.method ?? 'GET',
      signal: AbortSignal.timeout(30_000),
    });
    const json = res.status === 204 ? undefined : await res.json().catch(() => undefined);
    return { json, ok: res.ok, status: res.status };
  } catch (error) {
    log('githubFetch %s failed: %O', path, error);
    return { ok: false, status: 0 };
  }
};

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
  baseBranch: string;
  headSha: string;
  merged: boolean;
  number: number;
  sha?: string;
  url: string;
}

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
 * PR-first delivery intentionally does not accept ancestry as merge proof.
 * TaskIntegrationService calls this only after checking for a merged PR; if the
 * PR is absent/open we return `unknown`, which advances the integration row to
 * `verification_pending` for TaskDeliveryReviewService. This prevents a direct
 * push/merge into the base branch from bypassing CI/review/PR identity gates.
 */
export const isBranchMergedInto = async (params: {
  base: string;
  head: string;
  repo: string;
  token?: string;
}): Promise<RemoteMergeState> => {
  const coordinate = parseGithubRepo(params.repo);
  if (!coordinate) return 'unknown';

  // Still probe the compare endpoint so an unavailable/private repository is
  // distinguishable in logs and exercises the same credential path, but a
  // successful ancestry relation is no longer authoritative for completion.
  await githubFetch(
    `/repos/${coordinate.owner}/${coordinate.name}/compare/${encodeURIComponent(params.head)}...${encodeURIComponent(params.base)}`,
    params.token,
  );
  return 'unknown';
};

export interface CreatedPullRequest {
  number: number;
  url: string;
}

/** Create the delivery PR only after its branch is confirmed on the remote. */
export const createPullRequestForBranch = async (params: {
  baseBranch: string;
  body?: string;
  headBranch: string;
  repo: string;
  title: string;
  token?: string;
}): Promise<CreatedPullRequest | undefined> => {
  const coordinate = parseGithubRepo(params.repo);
  if (!coordinate) return undefined;
  const res = await githubFetch(
    `/repos/${coordinate.owner}/${coordinate.name}/pulls`,
    params.token,
    {
      body: {
        base: params.baseBranch,
        body: params.body,
        head: params.headBranch,
        maintainer_can_modify: true,
        title: params.title,
      },
      method: 'POST',
    },
  );
  if (!res.ok || typeof res.json?.number !== 'number' || typeof res.json?.html_url !== 'string') {
    return undefined;
  }
  return { number: res.json.number, url: res.json.html_url };
};

/** Return only a complete snapshot of the expected delivery revision. */
export const getPullRequestReviewSnapshot = async (
  repo: string,
  prNumber: number,
  token?: string,
  expected?: ExpectedPullRequestIdentity,
): Promise<RemotePrReviewSnapshot | undefined> => {
  const coordinate = parseGithubRepo(repo);
  if (!coordinate) return undefined;
  return readPullRequestReviewSnapshot(githubFetch, coordinate, prNumber, token, expected);
};

export interface MergePullRequestResult {
  merged: boolean;
  message?: string;
  sha?: string;
}

/** Merge only the exact PR revision reviewed by the delivery controller. */
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
