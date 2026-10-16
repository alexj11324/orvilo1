import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const findReusableDeployment = (deployments, { sha, branch, target, pr }) =>
  deployments.find(
    (deployment) =>
      deployment.meta?.githubCommitSha === sha &&
      deployment.meta?.githubCommitRef === branch &&
      (deployment.target || '') === target &&
      (pr ? deployment.meta?.githubPrId === String(pr) : !deployment.meta?.githubPrId) &&
      ['READY', 'BUILDING', 'QUEUED', 'INITIALIZING'].includes(
        deployment.readyState || deployment.state,
      ),
  );

const main = async () => {
  const { HEAD_SHA: sha, HEAD_BRANCH: branch, PR_NUMBER: pr } = process.env;
  const target = !pr && branch === 'main' ? 'production' : '';
  const query = new URLSearchParams({
    'teamId': process.env.VERCEL_ORG_ID,
    'projectId': process.env.VERCEL_PROJECT_ID,
    'meta-githubCommitSha': sha,
    'limit': '100',
  });
  const response = await fetch(`https://api.vercel.com/v6/deployments?${query}`, {
    headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` },
  });
  if (!response.ok) throw new Error(`Vercel deployment lookup failed: HTTP ${response.status}`);
  const { deployments } = await response.json();
  if (!Array.isArray(deployments)) throw new Error('Missing Vercel deployment inventory');
  const existing = findReusableDeployment(deployments, { sha, branch, target, pr });
  appendFileSync(process.env.GITHUB_OUTPUT, `exists=${Boolean(existing)}\n`);
  if (existing) console.log(`Reusing deployment ${existing.uid} for ${sha}`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
