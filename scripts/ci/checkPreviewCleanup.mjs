import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const canCleanupPreview = async ({ apiBase, repository, headBranch, closedNumber, token, fetchImpl = fetch }) => {
  if (!repository || !headBranch || !token || !Number.isSafeInteger(closedNumber) || closedNumber < 1) {
    throw new Error('Preview cleanup requires an authenticated exact branch and PR identity');
  }
  const owner = repository.split('/')[0];
  for (let page = 1; ; page++) {
    const url = new URL(`${apiBase}/repos/${repository}/pulls`);
    url.searchParams.set('state', 'open');
    url.searchParams.set('head', `${owner}:${headBranch}`);
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(page));
    const response = await fetchImpl(url, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (!response.ok) throw new Error('Preview cleanup could not verify the open PR inventory');
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.some(pr => !pr || !Number.isSafeInteger(pr.number) ||
      typeof pr.state !== 'string' || typeof pr.head?.ref !== 'string' ||
      typeof pr.head?.repo?.full_name !== 'string')) {
      throw new Error('Preview cleanup received an invalid PR inventory');
    }
    if (rows.some(pr => pr.state === 'open' && pr.number !== closedNumber &&
      pr.head?.ref === headBranch && pr.head?.repo?.full_name === repository)) return false;
    if (rows.length < 100) return true;
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const allowed = await canCleanupPreview({
      apiBase: process.env.GITHUB_API_URL || 'https://api.github.com',
      repository: process.env.GITHUB_REPOSITORY,
      headBranch: process.env.HEAD_BRANCH,
      closedNumber: Number(process.env.PR_NUMBER),
      token: process.env.GITHUB_TOKEN,
    });
    if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required');
    appendFileSync(process.env.GITHUB_OUTPUT, `allowed=${allowed}\n`);
    console.log(allowed ? 'No other open PR uses the branch; cleanup is eligible' :
      'Another open PR uses the branch; preserving its database, roles and environment');
  } catch {
    console.error('Preview cleanup preflight failed; destructive steps must remain disabled');
    process.exitCode = 1;
  }
}
