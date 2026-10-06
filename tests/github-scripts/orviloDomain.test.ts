import { execFile, spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { OFFICIAL_URL } from '../../packages/const/src/url';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const legacyHost = ['app', 'lobehub', 'com'].join('.');
const execFileAsync = promisify(execFile);

const assertNoUpstreamHost = (cwd: string) => {
  const result = spawnSync('git', ['grep', '-n', '-I', '--', legacyHost], {
    cwd,
    encoding: 'utf8',
  });

  if (result.status !== 0 && result.status !== 1) {
    throw new Error(
      `Could not inspect tracked files: ${result.stderr || `git grep exited ${result.status}`}`,
    );
  }

  const matches = result.stdout
    .split('\n')
    .filter((line) => line && !/^[^:]+\.patch:\d+:-(?!-- )/.test(line));
  if (matches.length) {
    throw new Error(`Tracked files still reference the upstream app host:\n${matches.join('\n')}`);
  }
};

describe('Orvilo public domain', () => {
  it('uses the Orvilo production origin as the official fallback', () => {
    expect(OFFICIAL_URL).toBe('https://orvilo.aspectlylabs.com');
  });

  it('does not retain the upstream app host in tracked files', () => {
    assertNoUpstreamHost(repositoryRoot);
  }, 20_000);

  it('ignores patch removals but rejects additions, context, ordinary files, and Git errors', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'orvilo-domain-'));
    try {
      expect(() => assertNoUpstreamHost(cwd)).toThrow('Could not inspect tracked files');
      await execFileAsync('git', ['init', '--quiet'], { cwd });
      const patch = path.join(cwd, 'backend.patch');
      const headers = '--- a/backend.ts\n+++ b/backend.ts\n@@ -1 +1 @@\n';
      await writeFile(patch, `${headers}-${legacyHost}\n`);
      await execFileAsync('git', ['add', 'backend.patch'], { cwd });
      expect(() => assertNoUpstreamHost(cwd)).not.toThrow();
      for (const prefix of ['+', ' ', '--- a/']) {
        await writeFile(patch, `${headers}${prefix}${legacyHost}\n`);
        expect(() => assertNoUpstreamHost(cwd)).toThrow('Tracked files still reference');
      }
      await writeFile(patch, `${headers}-${legacyHost}\n`);
      await writeFile(path.join(cwd, 'backend.ts'), `-${legacyHost}\n`);
      await execFileAsync('git', ['add', 'backend.ts'], { cwd });
      expect(() => assertNoUpstreamHost(cwd)).toThrow('Tracked files still reference');
    } finally {
      await rm(cwd, { force: true, recursive: true });
    }
  });
});
