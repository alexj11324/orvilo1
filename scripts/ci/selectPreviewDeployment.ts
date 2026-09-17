import { stdin, stdout } from 'node:process';

interface VercelDeployment {
  createdAt?: number;
  meta?: {
    githubCommitRef?: string;
    githubCommitSha?: string;
  };
  target?: null | string;
}

interface VercelDeploymentList {
  deployments?: VercelDeployment[];
}

export const selectPreviewDeployment = (
  payload: VercelDeploymentList,
  branch: string,
  sha: string,
) =>
  payload.deployments
    ?.filter(
      (deployment) =>
        (deployment.target === null ||
          deployment.target === undefined ||
          deployment.target === 'preview') &&
        deployment.meta?.githubCommitRef === branch &&
        deployment.meta.githubCommitSha === sha,
    )
    .sort((first, second) => (first.createdAt ?? 0) - (second.createdAt ?? 0))
    .at(-1);

const main = async () => {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) chunks.push(Buffer.from(chunk));

  const [branch, sha] = process.argv.slice(2);
  if (!branch || !sha) throw new Error('usage: selectPreviewDeployment.ts <branch> <sha>');

  const payload = JSON.parse(Buffer.concat(chunks).toString()) as VercelDeploymentList;
  const deployment = selectPreviewDeployment(payload, branch, sha);
  if (deployment) stdout.write(JSON.stringify(deployment));
};

if (import.meta.main) await main();
