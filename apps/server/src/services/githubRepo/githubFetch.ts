import debug from 'debug';

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

/**
 * Transport-level tri-state for GitHub calls: `unreachable` marks a request
 * that never provably reached the API (network failure, timeout, aborted
 * response) — mutating callers must treat it as "outcome unknown", never as a
 * rejection.
 */
export interface GithubFetchResult {
  json?: any;
  ok: boolean;
  status: number;
  unreachable?: boolean;
}

export const githubFetch = async (
  path: string,
  token?: string,
  init?: { body?: unknown; method?: 'GET' | 'POST' | 'PUT' },
): Promise<GithubFetchResult> => {
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
    return { ok: false, status: 0, unreachable: true };
  }
};
