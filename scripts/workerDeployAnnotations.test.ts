import { describe, expect, it } from 'vitest';

import { workerDeployAnnotationArgs } from './workerDeployAnnotations';

describe('workerDeployAnnotationArgs', () => {
  it('names the Actions actor, repo, commit and run so the Cloudflare record is self-describing', () => {
    expect(
      workerDeployAnnotationArgs({
        GITHUB_ACTIONS: 'true',
        GITHUB_ACTOR: 'octocat',
        GITHUB_REPOSITORY: 'alexj11324/orvilo1',
        GITHUB_RUN_ID: '123456',
        GITHUB_SHA: 'abcdef1234567890',
      }),
    ).toEqual(['--tag', 'abcdef1', '--message', 'octocat alexj11324/orvilo1@abcdef1 run 123456']);
  });

  it('falls back to the local operator and commit outside Actions', () => {
    expect(
      workerDeployAnnotationArgs(
        {},
        { email: 'dev@orvilo.aspectlylabs.com', sha: '0123456789abcdef' },
      ),
    ).toEqual(['--tag', '0123456', '--message', 'dev@orvilo.aspectlylabs.com local@0123456']);
  });

  it('annotates nothing when neither source can name an operator', () => {
    expect(workerDeployAnnotationArgs({}, undefined)).toEqual([]);
  });
});
