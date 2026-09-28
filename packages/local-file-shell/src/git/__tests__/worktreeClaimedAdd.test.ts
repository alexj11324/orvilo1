import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { addGitWorktreeClaimed, removeGitWorktreeVerified } from '../worktreeClaims';

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const CLAIMS_FILE = 'orvilo-worktree-claims.json';

const initRepo = async (): Promise<string> => {
  const dir = await mkdtemp(path.join(tmpdir(), 'lfs-claimed-add-'));
  execFileSync('git', ['-c', 'init.defaultBranch=main', 'init'], { cwd: dir });
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  git(dir, 'config', 'commit.gpgsign', 'false');
  await writeFile(path.join(dir, 'a.txt'), 'hello\n');
  git(dir, 'add', 'a.txt');
  git(dir, 'commit', '-m', 'init');
  return dir;
};

const claimsPath = (repo: string) => path.join(repo, '.git', CLAIMS_FILE);

const readClaims = async (repo: string) =>
  JSON.parse(await readFile(claimsPath(repo), 'utf8')) as Record<string, { claimToken: string }>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

const noWriter = vi.fn(async () => null);

describe('addGitWorktreeClaimed (SC01)', () => {
  it('creates the worktree and binds the claim in one exclusive section', async () => {
    const repo = await initRepo();
    cleanup.push(repo);
    const parent = await mkdtemp(path.join(tmpdir(), 'lfs-wt-'));
    cleanup.push(parent);
    const linked = path.join(parent, 'linked');

    const added = await addGitWorktreeClaimed({
      branch: 'task/T-1',
      claimToken: 'tok-secret',
      path: repo,
      worktreePath: linked,
    });

    expect(added).toMatchObject({ claimRegistered: true, success: true });
    expect(existsSync(linked)).toBe(true);
    const claims = await readClaims(repo);
    expect(Object.values(claims)).toHaveLength(1);
    expect(Object.values(claims)[0]!.claimToken).toBe('tok-secret');

    // Cleanup shares the same boundary — a verified remove still works.
    const removed = await removeGitWorktreeVerified({
      claimToken: 'tok-secret',
      getActiveWriter: noWriter,
      path: repo,
      worktreePath: linked,
    });
    expect(removed).toMatchObject({ claimTokenVerified: true, success: true });
    expect(existsSync(linked)).toBe(false);
  });

  it('writer admission waits behind the claims mutex instead of splitting off', async () => {
    const repo = await initRepo();
    cleanup.push(repo);
    const parent = await mkdtemp(path.join(tmpdir(), 'lfs-wt-'));
    cleanup.push(parent);
    const linked = path.join(parent, 'linked');

    // A foreign live holder occupies the claims mutex — a claim-bound add
    // must not create the worktree outside that exclusion boundary.
    const lockPath = `${claimsPath(repo)}.lock`;
    await writeFile(
      lockPath,
      `${JSON.stringify({ hostname: hostname(), pid: process.pid, token: 'foreign' })}\n`,
      { flag: 'wx' },
    );
    try {
      const pending = addGitWorktreeClaimed({
        branch: 'task/T-1',
        claimToken: 'tok-secret',
        path: repo,
        worktreePath: linked,
      });
      await sleep(400);
      const createdWhileHeld = existsSync(linked);
      await rm(lockPath, { force: true });
      const added = await pending;

      expect(createdWhileHeld).toBe(false);
      expect(added).toMatchObject({ claimRegistered: true, success: true });
      expect(existsSync(linked)).toBe(true);
    } finally {
      await rm(lockPath, { force: true });
    }
  });

  it('refuses to create anything on a repo that cannot host a claims registry', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lfs-norepo-'));
    cleanup.push(dir);
    const linked = path.join(dir, 'linked');

    const result = await addGitWorktreeClaimed({
      branch: 'task/T-1',
      claimToken: 'tok-secret',
      path: dir,
      worktreePath: linked,
    });

    expect(result.success).toBe(false);
    expect(result.claimRegistered).not.toBe(true);
    // No creation without the capability — not even a half-made directory.
    expect(existsSync(linked)).toBe(false);
  });
});
