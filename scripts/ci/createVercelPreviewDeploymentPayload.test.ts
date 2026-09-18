import { describe, expect, it } from 'vitest';

import { createVercelPreviewDeploymentPayload } from './createVercelPreviewDeploymentPayload';

describe('createVercelPreviewDeploymentPayload', () => {
  it('pins the deployment to the exact PR branch and commit', () => {
    expect(
      createVercelPreviewDeploymentPayload(
        'orvilo1',
        'prj_example123',
        1_370_358_179,
        'fix/vercel-all-gates',
        '0123456789abcdef0123456789abcdef01234567',
        51,
      ),
    ).toEqual({
      gitSource: {
        ref: 'fix/vercel-all-gates',
        repoId: 1_370_358_179,
        sha: '0123456789abcdef0123456789abcdef01234567',
        type: 'github',
      },
      meta: {
        githubCommitRef: 'fix/vercel-all-gates',
        githubCommitSha: '0123456789abcdef0123456789abcdef01234567',
        githubPrId: '51',
        githubRepoId: '1370358179',
      },
      name: 'orvilo1',
      project: 'prj_example123',
      projectSettings: { commandForIgnoringBuildStep: 'exit 1' },
    });
  });
});
