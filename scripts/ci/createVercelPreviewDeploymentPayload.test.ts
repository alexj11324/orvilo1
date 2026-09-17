import { describe, expect, it } from 'vitest';

import { createVercelPreviewDeploymentPayload } from './createVercelPreviewDeploymentPayload';

describe('createVercelPreviewDeploymentPayload', () => {
  it('creates an exact Git Preview deployment after branch setup completes', () => {
    expect(
      createVercelPreviewDeploymentPayload(
        'orvilo1',
        1_370_358_179,
        'feat/preview',
        '0123456789abcdef0123456789abcdef01234567',
        18,
      ),
    ).toEqual({
      gitSource: {
        ref: 'feat/preview',
        repoId: 1_370_358_179,
        sha: '0123456789abcdef0123456789abcdef01234567',
        type: 'github',
      },
      meta: {
        githubCommitRef: 'feat/preview',
        githubCommitSha: '0123456789abcdef0123456789abcdef01234567',
        githubPrId: '18',
        githubRepoId: '1370358179',
      },
      name: 'orvilo1',
      projectSettings: { commandForIgnoringBuildStep: 'exit 1' },
    });
  });
});
