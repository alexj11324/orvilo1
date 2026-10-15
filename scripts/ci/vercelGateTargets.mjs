import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { selectLatestRun } from './vercelPreviewGate.mjs';

export const eventHeadSha = (event) =>
  event.workflow_run?.head_sha ||
  event.check_run?.head_sha ||
  event.check_suite?.head_sha ||
  event.pull_request?.head.sha ||
  event.sha;

export const previewTargets = (pulls, { sha, repository }) =>
  pulls
    .filter(
      (pr) =>
        pr.state === 'open' &&
        !pr.merged_at &&
        pr.head.sha === sha &&
        pr.head.repo?.full_name === repository,
    )
    .map((pr) => ({ sha, branch: pr.head.ref, pr: pr.number }));

export const resolveTargets = async ({ event, mode, repository, owner, get }) => {
  const sha = eventHeadSha(event);
  if (!/^[0-9a-f]{40}$/.test(sha ?? '')) return [];
  // Never promote a fork workflow's SHA through a privileged workflow_run.
  if (event.workflow_run && event.workflow_run.head_repository?.full_name !== repository) return [];
  if (mode === 'branch') {
    const targets = [];
    for (const branch of ['canary', 'main']) {
      const ref = await get(`/git/ref/heads/${branch}`);
      if (ref.object?.sha === sha) targets.push({ sha, branch });
    }
    return targets;
  }
  // Completion webhooks are sent by bots, so authorize the owning push rather
  // than the webhook actor. Preserve the original owner-only preview boundary.
  const { workflow_runs: runs } = await get(
    `/actions/runs?head_sha=${sha}&event=push&per_page=100`,
  );
  const ownerRun = selectLatestRun(runs ?? [], { workflowName: 'Test CI', headSha: sha });
  if (ownerRun?.actor?.login !== owner || ownerRun?.triggering_actor?.login !== owner) return [];
  const pulls = [];
  for (let page = 1; ; page++) {
    const batch = await get(`/commits/${sha}/pulls?per_page=100&page=${page}`);
    if (!Array.isArray(batch)) throw new Error('Missing pull request inventory');
    pulls.push(...batch);
    if (batch.length < 100) break;
  }
  return previewTargets(pulls, { sha, repository });
};

const main = async () => {
  const repository = process.env.GITHUB_REPOSITORY;
  const targets = await resolveTargets({
    event: JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')),
    mode: process.env.TARGET_MODE,
    repository,
    owner: repository.split('/')[0],
    get: async (path) => {
      const response = await fetch(`${process.env.GITHUB_API_URL}/repos/${repository}${path}`, {
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
        },
      });
      if (!response.ok) throw new Error(`GitHub target lookup failed: HTTP ${response.status}`);
      return response.json();
    },
  });
  appendFileSync(process.env.GITHUB_OUTPUT, `targets=${JSON.stringify(targets)}\n`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
