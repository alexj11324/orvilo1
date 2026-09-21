import debug from 'debug';

import { UserModel } from '@/database/models/user';
import type { OrviloDatabase } from '@/database/type';
import { MarketService } from '@/server/services/market';

import { githubFetch, parseGithubRepo } from './githubFetch';
import {
  type ExpectedPullRequestIdentity,
  readPullRequestReviewSnapshot,
  type RemotePrReviewSnapshot,
} from './reviewSnapshot';

export { githubFetch, type GithubRepoCoordinate, parseGithubRepo } from './githubFetch';
export {
  mergePullRequest,
  type MergePullRequestOutcome,
  type MergePullRequestResult,
} from './mergePullRequest';
export { isRemotePrMergeReady } from './reviewGate';
export type { ExpectedPullRequestIdentity, RemotePrReviewSnapshot } from './reviewSnapshot';

const log = debug('github-repo');

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
