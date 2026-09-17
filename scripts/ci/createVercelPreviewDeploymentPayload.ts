import { stdout } from 'node:process';

export const createVercelPreviewDeploymentPayload = (
  projectName: string,
  repositoryId: number,
  branch: string,
  sha: string,
  pullRequestNumber: number,
) => ({
  gitSource: {
    ref: branch,
    repoId: repositoryId,
    sha,
    type: 'github' as const,
  },
  meta: {
    githubCommitRef: branch,
    githubCommitSha: sha,
    githubPrId: String(pullRequestNumber),
    githubRepoId: String(repositoryId),
  },
  name: projectName,
  projectSettings: {
    // Vercel proceeds with the build when the ignore command exits non-zero.
    // The project-level command intentionally skips automatic Preview builds;
    // this workflow creates the deployment after its branch database is ready.
    commandForIgnoringBuildStep: 'exit 1',
  },
});

const main = () => {
  const [projectName, repositoryIdValue, branch, sha, pullRequestNumberValue] =
    process.argv.slice(2);
  const repositoryId = Number(repositoryIdValue);
  const pullRequestNumber = Number(pullRequestNumberValue);

  if (
    !projectName ||
    !Number.isSafeInteger(repositoryId) ||
    repositoryId <= 0 ||
    !branch ||
    !/^[0-9a-f]{40}$/.test(sha ?? '') ||
    !Number.isSafeInteger(pullRequestNumber) ||
    pullRequestNumber <= 0
  ) {
    throw new Error(
      'usage: createVercelPreviewDeploymentPayload.ts <project-name> <repository-id> <branch> <sha> <pull-request-number>',
    );
  }

  stdout.write(
    JSON.stringify(
      createVercelPreviewDeploymentPayload(
        projectName,
        repositoryId,
        branch,
        sha,
        pullRequestNumber,
      ),
    ),
  );
};

if (import.meta.main) main();
