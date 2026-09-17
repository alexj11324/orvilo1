import type { GithubSnapshotResponse, GithubSnapshotTransport } from '../reviewSnapshot';

export const HEAD = 'a'.repeat(40);
export const BASE = 'b'.repeat(40);
export const MERGE = 'c'.repeat(40);
export const NEW_HEAD = 'd'.repeat(40);
export const DATE = '2026-09-16T10:00:00Z';
export const COORDINATE = { name: 'widgets', owner: 'acme' };
export const ROOT = '/repos/acme/widgets';
export const EXPECTED = { baseBranch: 'main', headBranch: 'task/T-1', sameRepository: true };

type Row = Record<string, unknown>;
export const response = (json: unknown, status = 200): GithubSnapshotResponse => ({
  json,
  ok: status >= 200 && status < 300,
  status,
});

export const openPr = (patch: Row = {}) => ({
  base: { ref: 'main', repo: { full_name: 'acme/widgets', id: 10 }, sha: BASE },
  draft: false,
  head: { ref: 'task/T-1', repo: { full_name: 'acme/widgets', id: 10 }, sha: HEAD },
  html_url: 'https://github.com/acme/widgets/pull/9',
  merge_commit_sha: null,
  mergeable: true,
  mergeable_state: 'clean',
  merged: false,
  merged_at: null,
  node_id: 'PR_9',
  number: 9,
  requested_reviewers: [],
  requested_teams: [],
  state: 'open',
  updated_at: DATE,
  ...patch,
});

export const check = (id: number, name: string, conclusion = 'success', patch: Row = {}): Row => ({
  app: { id: 15368 },
  conclusion,
  head_sha: HEAD,
  id,
  name,
  status: 'completed',
  ...patch,
});

export const comment = (id: number, patch: Row = {}): Row => ({
  body: 'Please add a regression test.',
  id,
  updated_at: DATE,
  user: { id: 41, login: 'reviewer', type: 'User' },
  ...patch,
});

export const review = (id: number, state: string, userId = 41, patch: Row = {}): Row => ({
  commit_id: HEAD,
  id,
  state,
  submitted_at: DATE,
  user: { id: userId, login: `reviewer-${userId}`, type: 'User' },
  ...patch,
});

export interface FixtureOptions {
  checks?: Row[];
  finalPr?: Row;
  hook?: (
    path: string,
    init: Parameters<GithubSnapshotTransport>[2],
    call: number,
  ) => GithubSnapshotResponse | undefined;
  inline?: Row[];
  mergeChecks?: Row[];
  mergeParents?: string[];
  mergeStatuses?: Row[];
  ordinary?: Row[];
  pr?: Row;
  reviewDecision?: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
  reviews?: Row[];
  statuses?: Row[];
  threads?: Row[];
}

/** Route-based fixtures keep concurrent HTTP calls independent of call ordering. */
export function fixture(options: FixtureOptions = {}) {
  const calls: { init: Parameters<GithubSnapshotTransport>[2]; path: string; token?: string }[] =
    [];
  let prReads = 0;
  const pr = options.pr ?? openPr();
  const transport: GithubSnapshotTransport = async (path, token, init) => {
    calls.push({ init, path, token });
    const intercepted = options.hook?.(path, init, calls.length);
    if (intercepted) return structuredClone(intercepted);
    const url = new URL(path, 'https://api.github.com');
    const page = Number(url.searchParams.get('page') ?? '1');
    const slice = (rows: Row[]) => rows.slice((page - 1) * 100, page * 100);
    if (url.pathname === `${ROOT}/pulls/9`) {
      prReads += 1;
      return response(structuredClone(prReads > 1 && options.finalPr ? options.finalPr : pr));
    }
    for (const sha of [HEAD, MERGE]) {
      if (url.pathname === `${ROOT}/commits/${sha}/check-runs`) {
        const rows =
          sha === HEAD ? (options.checks ?? [check(1, 'Typecheck')]) : (options.mergeChecks ?? []);
        return response({ check_runs: slice(rows), total_count: rows.length });
      }
      if (url.pathname === `${ROOT}/commits/${sha}/statuses`) {
        return response(
          slice(sha === HEAD ? (options.statuses ?? []) : (options.mergeStatuses ?? [])),
        );
      }
    }
    if (url.pathname === `${ROOT}/pulls/9/reviews`) return response(slice(options.reviews ?? []));
    if (url.pathname === `${ROOT}/pulls/9/comments`) return response(slice(options.inline ?? []));
    if (url.pathname === `${ROOT}/issues/9/comments`)
      return response(slice(options.ordinary ?? []));
    if (url.pathname === `${ROOT}/git/commits/${MERGE}`) {
      return response({
        parents: (options.mergeParents ?? [BASE, HEAD]).map((sha) => ({ sha })),
        sha: MERGE,
      });
    }
    if (url.pathname === '/graphql') {
      const body = init?.body as { variables?: { after?: string | null } } | undefined;
      const offset = Number(body?.variables?.after ?? '0');
      const rows = options.threads ?? [];
      const nodes = rows.slice(offset, offset + 100);
      const base = pr.base as { sha: string };
      const head = pr.head as { sha: string };
      return response({
        data: {
          repository: {
            pullRequest: {
              baseRefOid: base.sha,
              headRefOid: head.sha,
              id: pr.node_id,
              reviewDecision: options.reviewDecision ?? null,
              reviewThreads: {
                nodes,
                pageInfo: {
                  endCursor: nodes.length ? String(offset + nodes.length) : null,
                  hasNextPage: offset + nodes.length < rows.length,
                },
              },
            },
          },
        },
      });
    }
    throw new Error(`Unexpected fixture request: ${path}`);
  };
  return { calls, transport };
}
