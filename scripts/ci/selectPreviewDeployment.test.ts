import { describe, expect, it } from 'vitest';

import { selectPreviewDeployment } from './selectPreviewDeployment';

describe('selectPreviewDeployment', () => {
  it('accepts Vercel Preview deployments whose API target is null', () => {
    const deployment = selectPreviewDeployment(
      {
        deployments: [
          {
            createdAt: 10,
            meta: { githubCommitRef: 'feat/preview', githubCommitSha: 'abc123' },
            target: null,
          },
        ],
      },
      'feat/preview',
      'abc123',
    );

    expect(deployment?.createdAt).toBe(10);
  });

  it('selects the newest matching Preview deployment', () => {
    const deployment = selectPreviewDeployment(
      {
        deployments: [
          {
            createdAt: 20,
            meta: { githubCommitRef: 'feat/preview', githubCommitSha: 'abc123' },
            target: 'production',
          },
          {
            createdAt: 30,
            meta: { githubCommitRef: 'feat/preview', githubCommitSha: 'abc123' },
            target: 'preview',
          },
          {
            createdAt: 10,
            meta: { githubCommitRef: 'feat/preview', githubCommitSha: 'abc123' },
            target: null,
          },
        ],
      },
      'feat/preview',
      'abc123',
    );

    expect(deployment?.createdAt).toBe(30);
  });
});
