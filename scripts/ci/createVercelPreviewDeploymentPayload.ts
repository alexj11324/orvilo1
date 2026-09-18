import { stdout } from 'node:process';

export const createVercelPreviewDeploymentPayload = (
  projectName: string,
  projectId: string,
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
  project: projectId,
  projectSettings: {
    // The repository disables Git auto-deploys for PR branches. This direct
    // API deployment must explicitly continue through the build step.
    commandForIgnoringBuildStep: 'exit 1',
  },
});

const main = () => {
  const [projectName, projectId, repositoryIdValue, branch, sha, pullRequestNumberValue] =
    process.argv.slice(2);
  const repositoryId = Number(repositoryIdValue);
  const pullRequestNumber = Number(pullRequestNumberValue);

  if (
    !projectName ||
    !/^prj_[A-Za-z0-9]+$/.test(projectId ?? '') ||
    !Number.isSafeInteger(repositoryId) ||
    repositoryId <= 0 ||
    !branch ||
    /[\r\n]/.test(branch) ||
    !/^[0-9a-f]{40}$/.test(sha ?? '') ||
    !Number.isSafeInteger(pullRequestNumber) ||
    pullRequestNumber <= 0
  ) {
    throw new Error(
      'usage: createVercelPreviewDeploymentPayload.ts <project-name> <project-id> <repository-id> <branch> <sha> <pull-request-number>',
    );
  }

  stdout.write(
    JSON.stringify(
      createVercelPreviewDeploymentPayload(
        projectName,
        projectId,
        repositoryId,
        branch,
        sha,
        pullRequestNumber,
      ),
    ),
  );
};

if (import.meta.main) main();
