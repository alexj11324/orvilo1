import { githubFetch, parseGithubRepo } from './githubFetch';

/**
 * Proven outcome of a merge mutation. Only `confirmed_rejected` may release a
 * persisted merge intent — `outcome_unknown` means the merge may already have
 * run and must be reconciled by reading remote state.
 */
export type MergePullRequestOutcome =
  'confirmed_rejected' | 'confirmed_success' | 'outcome_unknown';

export interface MergePullRequestResult {
  message?: string;
  outcome: MergePullRequestOutcome;
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
  if (!coordinate) {
    return { message: 'Invalid GitHub repository coordinate', outcome: 'confirmed_rejected' };
  }
  const res = await githubFetch(
    `/repos/${coordinate.owner}/${coordinate.name}/pulls/${params.prNumber}/merge`,
    params.token,
    {
      body: { merge_method: params.mergeMethod ?? 'squash', sha: params.expectedHeadSha },
      method: 'PUT',
    },
  );
  const message = typeof res.json?.message === 'string' ? res.json.message : undefined;
  const sha = typeof res.json?.sha === 'string' ? res.json.sha : undefined;
  if (res.unreachable || res.status === 0) {
    return { message: message ?? 'Merge request never reached GitHub', outcome: 'outcome_unknown' };
  }
  if (res.ok && res.json?.merged === true) {
    return { message, outcome: 'confirmed_success', sha };
  }
  // A 4xx means the API evaluated and refused the merge (403 permission, 404
  // missing PR, 405 not mergeable, 409 head mismatch) — provable non-execution.
  if (res.status >= 400 && res.status < 500) {
    return { message, outcome: 'confirmed_rejected' };
  }
  // 5xx, or a success-looking response without `merged: true` — the mutation
  // may have landed anyway; only a re-read can settle it.
  return {
    message: message ?? 'Merge response was not a confirmed merge',
    outcome: 'outcome_unknown',
  };
};
