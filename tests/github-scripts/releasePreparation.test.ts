// @vitest-environment node
import { execFile } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import {
  assertCleanWorkingTree,
  getExpectedHotfixVersion,
  getExpectedVersionFromBranch,
  prepareRelease,
  removeVersionEntry,
} from '../../scripts/releaseWorkflow/releasePreparation';

const exec = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const bunPath = (() => {
  const candidate = path.join(os.homedir(), '.bun/bin/bun');
  return existsSync(candidate) ? candidate : 'bun';
})();

async function git(cwd: string, ...args: string[]) {
  return exec('git', args, { cwd });
}

async function createFixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'orvilo-release-preparation-'));
  await exec('git', ['init', '-b', 'main', root]);
  await git(root, 'config', 'user.name', 'Release Test');
  await git(root, 'config', 'user.email', 'release-test@example.com');
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'fixture', version: '1.0.0' }, null, 2) + '\n',
  );
  await writeFile(path.join(root, '.gitignore'), 'node_modules/\n');
  await writeFile(path.join(root, 'CHANGELOG.md'), '# Changelog\n');
  await mkdir(path.join(root, 'changelog'));
  await writeFile(path.join(root, 'changelog', 'index.json'), '{}\n');
  await git(root, 'add', '.');
  await git(root, 'commit', '-m', 'chore: create release fixture');
  return root;
}

async function runAllowFailure(command: string, args: string[], cwd: string) {
  try {
    const result = await exec(command, args, { cwd });
    return { exitCode: 0, stderr: result.stderr, stdout: result.stdout };
  } catch (error) {
    const result = error as { code?: number; stderr?: string; stdout?: string };
    return {
      exitCode: result.code ?? 1,
      stderr: result.stderr ?? '',
      stdout: result.stdout ?? '',
    };
  }
}

async function removeFixture(root: string): Promise<void> {
  await rm(root, { force: true, recursive: true });
}

describe('release preparation', () => {
  it('rejects staged and untracked changes before release mutation', async () => {
    const root = await createFixture();

    try {
      expect(() => assertCleanWorkingTree(root)).not.toThrow();

      await writeFile(path.join(root, 'untracked.txt'), 'untracked\n');
      expect(() => assertCleanWorkingTree(root)).toThrow(/Working tree is not clean/);

      await rm(path.join(root, 'untracked.txt'));
      await writeFile(path.join(root, 'staged.txt'), 'staged\n');
      await git(root, 'add', 'staged.txt');
      expect(() => assertCleanWorkingTree(root)).toThrow(/staged.txt/);
    } finally {
      await removeFixture(root);
    }
  });

  it.each([
    ['release', 'release/v1.0.1'],
    ['hotfix', 'hotfix/v1.0.1-abc1234'],
  ] as const)('rejects dirty %s --prepare before rewriting the checkout', async (kind, branch) => {
    const root = await createFixture();

    try {
      await git(root, 'checkout', '-b', branch);
      const originalPackage = await readFile(path.join(root, 'package.json'), 'utf8');
      const dirtyPackage = originalPackage.replace('1.0.0', '9.9.9');
      await writeFile(path.join(root, 'package.json'), dirtyPackage);
      const headBefore = (await git(root, 'rev-parse', 'HEAD')).stdout.trim();
      const script = path.join(
        repositoryRoot,
        kind === 'release' ? 'scripts/releaseWorkflow/index.ts' : 'scripts/hotfixWorkflow/index.ts',
      );

      const result = await runAllowFailure(bunPath, [script, '--prepare'], root);

      expect(result.exitCode).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toMatch(/Working tree is not clean/);
      expect(await readFile(path.join(root, 'package.json'), 'utf8')).toBe(dirtyPackage);
      expect((await git(root, 'rev-parse', 'HEAD')).stdout.trim()).toBe(headBefore);
    } finally {
      await removeFixture(root);
    }
  });

  it('prepares a hotfix version once and finalizes the same branch version after review', async () => {
    const root = await createFixture();

    try {
      await git(root, 'checkout', '-b', 'hotfix/v1.0.1-abc1234');
      expect(getExpectedVersionFromBranch('hotfix/v1.0.1-abc1234')).toBe('1.0.1');

      const generateChangelog = (cwd: string) => {
        writeFileSync(
          path.join(cwd, 'CHANGELOG.md'),
          '# Changelog\n\n### [Version 1.0.1](https://example.test/v1.0.1)\n\n- initial hotfix\n',
        );
      };
      const buildStaticChangelog = (cwd: string) => {
        writeFileSync(path.join(cwd, 'changelog', '1.0.1.json'), '{"version":"1.0.1"}\n');
      };

      expect(prepareRelease('1.0.1', { cwd: root, generateChangelog, buildStaticChangelog })).toBe(
        true,
      );
      expect(JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version).toBe(
        '1.0.1',
      );
      expect((await git(root, 'status', '--porcelain')).stdout).toBe('');

      await writeFile(path.join(root, 'review.txt'), 'reviewed\n');
      await git(root, 'add', 'review.txt');
      await git(root, 'commit', '-m', '🐛 fix: address review feedback');

      const finalizeChangelog = (cwd: string) => {
        writeFileSync(
          path.join(cwd, 'CHANGELOG.md'),
          '# Changelog\n\n### [Version 1.0.1](https://example.test/v1.0.1)\n\n- review fix\n\n### [Version 1.0.0](https://example.test/v1.0.0)\n\n- previous\n',
        );
      };
      expect(
        prepareRelease('1.0.1', {
          cwd: root,
          generateChangelog: finalizeChangelog,
          buildStaticChangelog,
        }),
      ).toBe(true);

      const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
      const changelog = await readFile(path.join(root, 'CHANGELOG.md'), 'utf8');
      expect(packageJson.version).toBe('1.0.1');
      expect(changelog.match(/\[Version 1\.0\.1\]/g)).toHaveLength(1);
      expect((await git(root, 'log', '--format=%s', '-2')).stdout).toContain(
        'chore(release): release version v1.0.1',
      );
      expect((await git(root, 'status', '--porcelain')).stdout).toBe('');
    } finally {
      await removeFixture(root);
    }
  });

  it('regenerates the current version entry from the actual reviewed git head', async () => {
    const root = await createFixture();

    try {
      await git(root, 'tag', 'v1.0.0');
      await git(root, 'checkout', '-b', 'hotfix/v1.0.1-abc1234');
      await writeFile(
        path.join(root, 'package.json'),
        JSON.stringify({ name: 'fixture', version: '1.0.1' }, null, 2) + '\n',
      );
      await writeFile(
        path.join(root, 'CHANGELOG.md'),
        '# Changelog\n\n### [Version 1.0.1](https://example.test/v1.0.1)\n\n- stale entry\n',
      );
      await git(root, 'add', 'package.json', 'CHANGELOG.md');
      await git(root, 'commit', '-m', '🔖 chore(release): release version v1.0.1');
      await writeFile(path.join(root, 'review.txt'), 'reviewed behavior\n');
      await git(root, 'add', 'review.txt');
      await git(root, 'commit', '-m', '🐛 fix: include reviewed behavior');

      const copiedGenerator = path.join(root, 'scripts/changelogWorkflow/generateChangelog.ts');
      await mkdir(path.dirname(copiedGenerator), { recursive: true });
      await mkdir(path.join(root, 'scripts/releaseWorkflow'), { recursive: true });
      await copyFile(
        path.join(repositoryRoot, 'scripts/changelogWorkflow/generateChangelog.ts'),
        copiedGenerator,
      );
      await copyFile(
        path.join(repositoryRoot, 'scripts/releaseWorkflow/releasePreparation.ts'),
        path.join(root, 'scripts/releaseWorkflow/releasePreparation.ts'),
      );
      const dependencyPath = path.join(repositoryRoot, 'node_modules');
      if (existsSync(dependencyPath)) {
        await symlink(dependencyPath, path.join(root, 'node_modules'), 'dir');
      }

      const firstRun = await runAllowFailure(bunPath, [copiedGenerator], root);
      expect(firstRun.exitCode).toBe(0);
      const firstChangelog = await readFile(path.join(root, 'CHANGELOG.md'), 'utf8');
      expect(firstChangelog).toContain('reviewed behavior');
      expect(firstChangelog.match(/\[Version 1\.0\.1\]/g)).toHaveLength(1);

      const secondRun = await runAllowFailure(bunPath, [copiedGenerator], root);
      expect(secondRun.exitCode).toBe(0);
      const secondChangelog = await readFile(path.join(root, 'CHANGELOG.md'), 'utf8');
      expect(secondChangelog.match(/\[Version 1\.0\.1\]/g)).toHaveLength(1);
    } finally {
      await removeFixture(root);
    }
  });

  it('replaces an existing version section instead of duplicating it', () => {
    const content = `# Changelog

### [Version 1.0.1](https://example.test/v1.0.1)

- old entry

### [Version 1.0.0](https://example.test/v1.0.0)

- previous entry
`;

    const result = removeVersionEntry(content, '1.0.1');

    expect(result).not.toContain('- old entry');
    expect(result).toContain('[Version 1.0.0]');
  });

  it('derives one stable target for descriptive hotfix branches', async () => {
    const root = await createFixture();

    try {
      await git(root, 'checkout', '-b', 'hotfix/validation-fix');
      expect(getExpectedHotfixVersion('hotfix/validation-fix', root)).toBe('1.0.1');
      expect(getExpectedVersionFromBranch('hotfix/v1.0.1-abc1234')).toBe('1.0.1');
    } finally {
      await removeFixture(root);
    }
  });
});
