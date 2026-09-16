import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { OFFICIAL_URL } from '../../packages/const/src/url';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');

describe('Orvilo public domain', () => {
  it('uses the Orvilo production origin as the official fallback', () => {
    expect(OFFICIAL_URL).toBe('https://orvilo.aspectlylabs.com');
  });

  it('does not retain the upstream app host in tracked files', () => {
    const legacyHost = ['app', 'lobehub', 'com'].join('.');
    const result = spawnSync('git', ['grep', '-n', '-I', '--', legacyHost], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });

    if (result.status !== 1) {
      throw new Error(
        result.status === 0
          ? `Tracked files still reference the upstream app host:\n${result.stdout}`
          : `Could not inspect tracked files: ${result.stderr || `git grep exited ${result.status}`}`,
      );
    }

    expect(result.stdout).toBe('');
  }, 20_000);
});
