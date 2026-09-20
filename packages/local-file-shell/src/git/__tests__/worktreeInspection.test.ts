import { execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { addGitWorktree, inspectGitWorktreePath } from '../worktrees';

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** Create an isolated temp repo on `main` with a single committed file. */
const initRepo = async (): Promise<string> => {
  const dir = await mkdtemp(path.join(tmpdir(), 'lfs-wt-inspect-'));
  execFileSync('git', ['-c', 'init.defaultBranch=main', 'init'], { cwd: dir });
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  git(dir, 'config', 'commit.gpgsign', 'false');
  await writeFile(path.join(dir, 'a.txt'), 'hello\n');
  git(dir, 'add', 'a.txt');
  git(dir, 'commit', '-m', 'init');
  return dir;
};

let repo: string;
const cleanup: string[] = [];

beforeEach(async () => {
  repo = await initRepo();
  cleanup.push(repo);
});

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe('inspectGitWorktreePath', () => {
  it('reports absent when the candidate path does not exist', async () => {
    const result = await inspectGitWorktreePath({
      path: repo,
      worktreePath: path.join(repo, '..', 'lfs-nope'),
    });
    expect(result.kind).toBe('absent');
  });

  it('reports a clean listed worktree with its branch and status', async () => {
    const target = path.join(path.dirname(repo), 'lfs-listed');
    cleanup.push(target);
    await addGitWorktree({ branch: 'task/T-1', path: repo, worktreePath: target });

    const result = await inspectGitWorktreePath({ path: repo, worktreePath: target });

    expect(result.kind).toBe('listed');
    expect(result.listed?.branch).toBe('task/T-1');
    expect(result.listed?.status?.clean).toBe(true);
  });

  it('reports the dirty flag on a listed worktree', async () => {
    const target = path.join(path.dirname(repo), 'lfs-dirty');
    cleanup.push(target);
    await addGitWorktree({ branch: 'task/T-1', path: repo, worktreePath: target });
    await writeFile(path.join(target, 'user-edit.txt'), 'uncommitted\n');

    const result = await inspectGitWorktreePath({ path: repo, worktreePath: target });

    expect(result.kind).toBe('listed');
    expect(result.listed?.status?.clean).toBe(false);
  });

  it('classifies an empty unregistered directory as orphan-safe', async () => {
    const target = path.join(path.dirname(repo), 'lfs-empty');
    cleanup.push(target);
    await mkdir(target);

    const result = await inspectGitWorktreePath({ path: repo, worktreePath: target });

    expect(result.kind).toBe('orphan-safe');
  });

  it('classifies a directory with only a .git gitfile as orphan-safe', async () => {
    // What a crashed `git worktree add` leaves behind before git registers it.
    const target = path.join(path.dirname(repo), 'lfs-remnant');
    cleanup.push(target);
    await mkdir(target);
    await writeFile(path.join(target, '.git'), 'gitdir: /tmp/somewhere\n');

    const result = await inspectGitWorktreePath({ path: repo, worktreePath: target });

    expect(result.kind).toBe('orphan-safe');
  });

  it('classifies an unregistered directory with content as orphan-foreign', async () => {
    const target = path.join(path.dirname(repo), 'lfs-foreign');
    cleanup.push(target);
    await mkdir(target);
    await writeFile(path.join(target, 'notes.txt'), 'not ours\n');

    const result = await inspectGitWorktreePath({ path: repo, worktreePath: target });

    expect(result.kind).toBe('orphan-foreign');
  });

  it('classifies a .git directory (real repo) as orphan-foreign, not safe', async () => {
    const target = path.join(path.dirname(repo), 'lfs-nested-repo');
    cleanup.push(target);
    await mkdir(target);
    execFileSync('git', ['-c', 'init.defaultBranch=main', 'init'], { cwd: target });

    const result = await inspectGitWorktreePath({ path: repo, worktreePath: target });

    expect(result.kind).toBe('orphan-foreign');
  });

  it('returns unknown when git itself cannot run in the host path', async () => {
    const result = await inspectGitWorktreePath({
      path: path.join(repo, 'not-a-repo-dir'),
      worktreePath: path.join(repo, '..', 'lfs-nope'),
    });
    expect(result.kind).toBe('unknown');
    expect(result.error).toBeTruthy();
  });

  it('A04: classifies a symlink to an external directory as orphan-foreign, never absent', async () => {
    // A symlink at the worktree path must never be followed for a destructive
    // decision — it is foreign content on its face.
    const real = path.join(path.dirname(repo), 'lfs-real-dir');
    const link = path.join(path.dirname(repo), 'lfs-link');
    cleanup.push(real, link);
    await mkdir(real);
    await writeFile(path.join(real, 'user-data.txt'), 'keep\n');
    await symlink(real, link);

    const result = await inspectGitWorktreePath({ path: repo, worktreePath: link });

    expect(result.kind).toBe('orphan-foreign');
  });

  it('A06: an unreadable directory is unknown, not absent (A06 EACCES)', async () => {
    const target = path.join(path.dirname(repo), 'lfs-denied');
    cleanup.push(target);
    await mkdir(target);
    await chmod(target, 0o000);
    try {
      const result = await inspectGitWorktreePath({ path: repo, worktreePath: target });
      expect(result.kind).toBe('unknown');
    } finally {
      await chmod(target, 0o700).catch(() => undefined);
    }
  });
});
