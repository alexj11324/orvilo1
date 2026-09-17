import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  checkoutGitBranch,
  deleteGitBranch,
  finalizeGitMerge,
  listGitBranches,
  listGitRemoteBranches,
  mergeGitBranch,
  pullGitBranch,
  pushGitBranch,
  renameGitBranch,
  revertGitFile,
} from '../branches';
import { getGitAheadBehind, getGitBranch } from '../info';
import { getGitBranchDiff, getGitWorkingTreeFiles, getGitWorkingTreePatches } from '../workingTree';
import {
  addGitWorktree,
  listGitWorktrees,
  parseGitWorktreeList,
  removeGitWorktree,
} from '../worktrees';

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** Create an isolated temp repo on `main` with a single committed file. */
const initRepo = async (): Promise<string> => {
  const dir = await mkdtemp(path.join(tmpdir(), 'lfs-git-'));
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

describe('branch read operations', () => {
  it('getGitBranch returns the current branch', async () => {
    expect(await getGitBranch(repo)).toEqual({ branch: 'main' });
  });

  it('listGitBranches lists branches with the current one flagged', async () => {
    git(repo, 'branch', 'feature');
    const branches = await listGitBranches(repo);
    expect(branches).toContainEqual({ current: true, name: 'main', upstream: undefined });
    expect(branches.map((b) => b.name).sort()).toEqual(['feature', 'main']);
  });

  it('listGitRemoteBranches returns [] when there is no origin', async () => {
    expect(await listGitRemoteBranches(repo)).toEqual([]);
  });

  it('parseGitWorktreeList handles branch, detached, and locked records', () => {
    expect(
      parseGitWorktreeList(
        [
          'worktree /repo',
          'HEAD 1111111111111111111111111111111111111111',
          'branch refs/heads/main',
          '',
          'worktree /repo-linked',
          'HEAD 2222222222222222222222222222222222222222',
          'detached',
          'locked moving patch',
          '',
        ].join('\0'),
      ),
    ).toEqual([
      {
        branch: 'main',
        head: '1111111111111111111111111111111111111111',
        path: '/repo',
      },
      {
        detached: true,
        head: '2222222222222222222222222222222222222222',
        locked: true,
        lockReason: 'moving patch',
        path: '/repo-linked',
      },
    ]);
  });

  it('listGitWorktrees marks the current worktree and includes dirty status', async () => {
    git(repo, 'branch', 'feature');
    const worktreeParent = await mkdtemp(path.join(tmpdir(), 'lfs-worktree-parent-'));
    cleanup.push(worktreeParent);
    const linked = path.join(worktreeParent, 'linked');
    git(repo, 'worktree', 'add', linked, 'feature');
    await writeFile(path.join(linked, 'new.txt'), 'new\n');

    const worktrees = await listGitWorktrees(repo);

    // `git worktree list` reports paths with symlinks resolved (e.g. macOS
    // /var -> /private/var), so compare against the realpath of each temp dir.
    expect(worktrees).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          branch: 'main',
          current: true,
          path: await realpath(repo),
          status: expect.objectContaining({ clean: true }),
        }),
        expect.objectContaining({
          branch: 'feature',
          current: false,
          path: await realpath(linked),
          status: expect.objectContaining({ added: 1, clean: false, total: 1 }),
        }),
      ]),
    );
  });
});

describe('removeGitWorktree', () => {
  it('removes a detached non-current worktree', async () => {
    const worktreeParent = await mkdtemp(path.join(tmpdir(), 'lfs-worktree-remove-'));
    cleanup.push(worktreeParent);
    const linked = path.join(worktreeParent, 'detached');
    git(repo, 'worktree', 'add', '--detach', linked, 'HEAD');
    const linkedRealPath = await realpath(linked);

    expect(await removeGitWorktree({ path: repo, worktreePath: linked })).toEqual({
      success: true,
    });

    expect(existsSync(linkedRealPath)).toBe(false);
    expect((await listGitWorktrees(repo)).map((worktree) => worktree.path)).not.toContain(
      linkedRealPath,
    );
  });

  it('removes a branch worktree', async () => {
    git(repo, 'branch', 'feature');
    const worktreeParent = await mkdtemp(path.join(tmpdir(), 'lfs-worktree-branch-'));
    cleanup.push(worktreeParent);
    const linked = path.join(worktreeParent, 'linked');
    git(repo, 'worktree', 'add', linked, 'feature');
    const linkedRealPath = await realpath(linked);

    expect(await removeGitWorktree({ path: repo, worktreePath: linked })).toEqual({
      success: true,
    });

    expect(existsSync(linkedRealPath)).toBe(false);
    expect((await listGitWorktrees(repo)).map((worktree) => worktree.path)).not.toContain(
      linkedRealPath,
    );
  });

  it('force-removes a dirty system-owned worktree', async () => {
    const worktreeParent = await mkdtemp(path.join(tmpdir(), 'lfs-worktree-dirty-'));
    cleanup.push(worktreeParent);
    const linked = path.join(worktreeParent, 'dirty');
    git(repo, 'worktree', 'add', '--detach', linked, 'HEAD');
    const linkedRealPath = await realpath(linked);
    await writeFile(path.join(linked, 'untracked.txt'), 'unfinished merge');

    expect(await removeGitWorktree({ path: repo, worktreePath: linked })).toMatchObject({
      success: false,
    });
    expect(existsSync(linkedRealPath)).toBe(true);

    expect(await removeGitWorktree({ force: true, path: repo, worktreePath: linked })).toEqual({
      success: true,
    });
    expect(existsSync(linkedRealPath)).toBe(false);
  });

  it('refuses to remove the current worktree', async () => {
    expect(await removeGitWorktree({ path: repo, worktreePath: repo })).toEqual({
      error: 'Cannot remove the current worktree',
      success: false,
    });
  });
});

describe('checkoutGitBranch', () => {
  it('creates and switches to a new branch', async () => {
    const result = await checkoutGitBranch({ branch: 'feature', create: true, path: repo });
    expect(result).toEqual({ success: true });
    expect(await getGitBranch(repo)).toEqual({ branch: 'feature' });
  });

  it('switches to an existing branch', async () => {
    git(repo, 'branch', 'feature');
    expect(await checkoutGitBranch({ branch: 'feature', path: repo })).toEqual({ success: true });
    expect(await getGitBranch(repo)).toEqual({ branch: 'feature' });
  });

  it('rejects an invalid branch name without invoking git', async () => {
    const result = await checkoutGitBranch({ branch: 'bad name', create: true, path: repo });
    expect(result).toEqual({ error: 'Invalid branch name: bad name', success: false });
  });

  it('surfaces git stderr for a missing branch', async () => {
    const result = await checkoutGitBranch({ branch: 'nope', path: repo });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe('renameGitBranch', () => {
  it('renames the current branch', async () => {
    expect(await renameGitBranch({ from: 'main', path: repo, to: 'trunk' })).toEqual({
      success: true,
    });
    expect(await getGitBranch(repo)).toEqual({ branch: 'trunk' });
  });

  it('rejects an invalid target name', async () => {
    const result = await renameGitBranch({ from: 'main', path: repo, to: 'bad~name' });
    expect(result).toEqual({ error: 'Invalid branch name: bad~name', success: false });
  });

  it('fails (non-force) when the target already exists', async () => {
    git(repo, 'branch', 'taken');
    const result = await renameGitBranch({ from: 'main', path: repo, to: 'taken' });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe('deleteGitBranch', () => {
  it('force-deletes a non-current branch', async () => {
    git(repo, 'branch', 'stale');
    expect(await deleteGitBranch({ branch: 'stale', path: repo })).toEqual({ success: true });
    expect((await listGitBranches(repo)).map((b) => b.name)).not.toContain('stale');
  });

  it('refuses to delete the checked-out branch', async () => {
    const result = await deleteGitBranch({ branch: 'main', path: repo });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('rejects an invalid branch name', async () => {
    expect(await deleteGitBranch({ branch: 'bad name', path: repo })).toEqual({
      error: 'Invalid branch name: bad name',
      success: false,
    });
  });
});

describe('working tree status / files / patches', () => {
  beforeEach(async () => {
    await writeFile(path.join(repo, 'a.txt'), 'hello\nworld\n'); // modify tracked
    await writeFile(path.join(repo, 'new.txt'), 'fresh\n'); // untracked add
  });

  it('getGitWorkingTreeFiles buckets dirty paths', async () => {
    const files = await getGitWorkingTreeFiles(repo);
    expect(files.modified).toContain('a.txt');
    expect(files.added).toContain('new.txt');
    expect(files.deleted).toEqual([]);
  });

  it('getGitWorkingTreePatches returns per-file patches ordered added → modified', async () => {
    const { patches } = await getGitWorkingTreePatches(repo);
    const byPath = Object.fromEntries(patches.map((p) => [p.filePath, p]));

    expect(byPath['new.txt'].status).toBe('added');
    expect(byPath['new.txt'].patch).toContain('+fresh');
    expect(byPath['a.txt'].status).toBe('modified');
    expect(byPath['a.txt'].patch).toContain('+world');

    // added entries sort before modified entries
    expect(patches.findIndex((p) => p.filePath === 'new.txt')).toBeLessThan(
      patches.findIndex((p) => p.filePath === 'a.txt'),
    );
  });
});

describe('revertGitFile', () => {
  it('restores a modified tracked file to HEAD', async () => {
    await writeFile(path.join(repo, 'a.txt'), 'tampered\n');
    expect(await revertGitFile({ filePath: 'a.txt', path: repo })).toEqual({ success: true });
    expect(await readFile(path.join(repo, 'a.txt'), 'utf8')).toBe('hello\n');
  });

  it('deletes an untracked file from disk', async () => {
    await writeFile(path.join(repo, 'junk.txt'), 'x\n');
    expect(await revertGitFile({ filePath: 'junk.txt', path: repo })).toEqual({ success: true });
    expect(existsSync(path.join(repo, 'junk.txt'))).toBe(false);
  });

  it('rejects a path traversal payload', async () => {
    const result = await revertGitFile({ filePath: '../escape.txt', path: repo });
    expect(result).toEqual({ error: 'Invalid file path: ../escape.txt', success: false });
  });
});

describe('getGitBranchDiff', () => {
  it('returns headRef + empty patches when no remote default branch exists', async () => {
    const result = await getGitBranchDiff({ path: repo });
    expect(result).toEqual({ headRef: 'main', patches: [] });
  });
});

describe('remote operations (push / pull / ahead-behind)', () => {
  it('pushes to a bare origin, then reports up-to-date on pull', async () => {
    const bare = await mkdtemp(path.join(tmpdir(), 'lfs-bare-'));
    cleanup.push(bare);
    execFileSync('git', ['init', '--bare', bare], { cwd: bare });
    git(repo, 'remote', 'add', 'origin', bare);

    const pushed = await pushGitBranch({ path: repo });
    expect(pushed.success).toBe(true);
    // The branch now exists on the bare remote.
    expect(git(bare, 'branch', '--list', 'main')).toContain('main');

    const ahead = await getGitAheadBehind(repo);
    expect(ahead).toMatchObject({ ahead: 0, behind: 0, hasUpstream: true });

    const pulled = await pullGitBranch({ path: repo });
    expect(pulled).toMatchObject({ noop: true, success: true });
  });

  it('pushGitBranch remoteBranch publishes HEAD under a different remote ref', async () => {
    const bare = await mkdtemp(path.join(tmpdir(), 'lfs-bare-'));
    cleanup.push(bare);
    execFileSync('git', ['init', '--bare', bare], { cwd: bare });
    git(repo, 'remote', 'add', 'origin', bare);

    // Detached HEAD — how the integration worktree lands its merge result.
    git(repo, 'checkout', '--detach', 'HEAD');
    const pushed = await pushGitBranch({ path: repo, remoteBranch: 'main' });
    expect(pushed.success).toBe(true);
    expect(git(bare, 'branch', '--list', 'main')).toContain('main');
  });

  it('pushGitBranch publishes the accepted commit even when HEAD advanced', async () => {
    const bare = await mkdtemp(path.join(tmpdir(), 'lfs-bare-'));
    cleanup.push(bare);
    execFileSync('git', ['init', '--bare', bare], { cwd: bare });
    git(repo, 'remote', 'add', 'origin', bare);
    const accepted = git(repo, 'rev-parse', 'HEAD');
    await writeFile(path.join(repo, 'later.txt'), 'later\n');
    git(repo, 'add', 'later.txt');
    git(repo, 'commit', '-m', 'later');

    const pushed = await pushGitBranch({
      path: repo,
      remoteBranch: 'main',
      sourceRef: accepted,
    });

    expect(pushed).toMatchObject({ pushedSourceRef: accepted, success: true });
    expect(git(bare, 'rev-parse', 'refs/heads/main')).toBe(accepted);
  });

  it('pushGitBranch rejects an invalid remoteBranch without invoking git', async () => {
    const result = await pushGitBranch({ path: repo, remoteBranch: 'bad name' });
    expect(result).toEqual({ error: 'Invalid remote branch name: bad name', success: false });
  });
});

describe('mergeGitBranch', () => {
  it('merges a branch with --no-ff and reports the merge sha', async () => {
    git(repo, 'checkout', '-b', 'task/T-1');
    await writeFile(path.join(repo, 'b.txt'), 'task work\n');
    git(repo, 'add', 'b.txt');
    git(repo, 'commit', '-m', 'task work');
    git(repo, 'checkout', 'main');

    const result = await mergeGitBranch({ branch: 'task/T-1', path: repo });
    expect(result.state).toBe('merged');
    expect(result.sha).toBe(git(repo, 'rev-parse', 'HEAD'));
    // --no-ff produced a merge commit with two parents.
    expect(git(repo, 'rev-list', '--parents', '-n', '1', 'HEAD').split(' ')).toHaveLength(3);
    expect(await readFile(path.join(repo, 'b.txt'), 'utf8')).toBe('task work\n');
  });

  it('re-baselines onto baseRef before merging', async () => {
    git(repo, 'checkout', '-b', 'base-work');
    await writeFile(path.join(repo, 'c.txt'), 'base moved\n');
    git(repo, 'add', 'c.txt');
    git(repo, 'commit', '-m', 'base move');
    const baseSha = git(repo, 'rev-parse', 'HEAD');
    git(repo, 'checkout', 'main');

    git(repo, 'checkout', '-b', 'task/T-2');
    await writeFile(path.join(repo, 'd.txt'), 'task\n');
    git(repo, 'add', 'd.txt');
    git(repo, 'commit', '-m', 'task');
    git(repo, 'checkout', 'main');

    const result = await mergeGitBranch({
      baseRef: 'base-work',
      branch: 'task/T-2',
      path: repo,
    });
    expect(result.state).toBe('merged');
    // HEAD's first parent is the re-baselined base tip.
    expect(git(repo, 'rev-parse', 'HEAD^1')).toBe(baseSha);
  });

  it('reports conflicts and leaves the merge in progress', async () => {
    git(repo, 'checkout', '-b', 'task/T-3');
    await writeFile(path.join(repo, 'a.txt'), 'task side\n');
    git(repo, 'commit', '-am', 'task side');
    git(repo, 'checkout', 'main');
    await writeFile(path.join(repo, 'a.txt'), 'base side\n');
    git(repo, 'commit', '-am', 'base side');

    const result = await mergeGitBranch({ branch: 'task/T-3', path: repo });
    expect(result.state).toBe('conflict');
    expect(result.conflicts).toEqual(['a.txt']);
    // MERGE_HEAD is left in place for the corrective run.
    expect(git(repo, 'rev-parse', '--verify', '--quiet', 'MERGE_HEAD')).toBeTruthy();
  });

  it('reports in-progress when a merge is already running', async () => {
    git(repo, 'checkout', '-b', 'task/T-4');
    await writeFile(path.join(repo, 'a.txt'), 'task side\n');
    git(repo, 'commit', '-am', 'task side');
    git(repo, 'checkout', 'main');
    await writeFile(path.join(repo, 'a.txt'), 'base side\n');
    git(repo, 'commit', '-am', 'base side');
    try {
      git(repo, 'merge', 'task/T-4');
    } catch {
      /* conflict expected */
    }

    const result = await mergeGitBranch({ branch: 'task/T-4', path: repo });
    expect(result.state).toBe('in-progress');
    expect(result.conflicts).toEqual(['a.txt']);
  });

  it('rejects an invalid branch without invoking git', async () => {
    const result = await mergeGitBranch({ branch: 'bad name', path: repo });
    expect(result).toEqual({
      error: 'Invalid branch name: bad name',
      state: 'conflict',
      success: false,
    });
  });
});

describe('addGitWorktree ref/detach', () => {
  it('forks the new branch from ref when given', async () => {
    git(repo, 'checkout', '-b', 'older');
    await writeFile(path.join(repo, 'old.txt'), 'old\n');
    git(repo, 'add', 'old.txt');
    git(repo, 'commit', '-m', 'old');
    const olderSha = git(repo, 'rev-parse', 'HEAD');
    git(repo, 'checkout', 'main');

    const worktreeParent = await mkdtemp(path.join(tmpdir(), 'lfs-addwt-'));
    cleanup.push(worktreeParent);
    const linked = path.join(worktreeParent, 'linked');

    const result = await addGitWorktree({
      branch: 'task/T-7',
      path: repo,
      ref: 'older',
      worktreePath: linked,
    });
    expect(result).toEqual({ success: true, worktreePath: linked });
    expect(git(linked, 'rev-parse', 'HEAD')).toBe(olderSha);
  });

  it('checks out a ref detached when detach is set', async () => {
    const worktreeParent = await mkdtemp(path.join(tmpdir(), 'lfs-addwt-detach-'));
    cleanup.push(worktreeParent);
    const linked = path.join(worktreeParent, 'integration-main');

    const result = await addGitWorktree({
      branch: '',
      detach: true,
      path: repo,
      ref: 'main',
      worktreePath: linked,
    });
    expect(result).toEqual({ success: true, worktreePath: linked });
    expect(git(linked, 'rev-parse', 'HEAD')).toBe(git(repo, 'rev-parse', 'main'));
    // Detached: HEAD resolves to 'HEAD' rather than a branch name.
    expect(git(linked, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('HEAD');
  });
});

describe('finalizeGitMerge', () => {
  it('commits a fully-resolved merge', async () => {
    git(repo, 'checkout', '-b', 'task/T-5');
    await writeFile(path.join(repo, 'a.txt'), 'task side\n');
    git(repo, 'commit', '-am', 'task side');
    const taskHead = git(repo, 'rev-parse', 'HEAD');
    git(repo, 'checkout', 'main');
    await writeFile(path.join(repo, 'a.txt'), 'base side\n');
    git(repo, 'commit', '-am', 'base side');
    try {
      git(repo, 'merge', 'task/T-5');
    } catch {
      /* conflict expected */
    }

    // Simulate the corrective run: resolve + stage, but don't commit.
    await writeFile(path.join(repo, 'a.txt'), 'resolved\n');
    git(repo, 'add', 'a.txt');

    const result = await finalizeGitMerge({ expectedHead: taskHead, path: repo });
    expect(result.state).toBe('integrated');
    expect(result.sha).toBe(git(repo, 'rev-parse', 'HEAD'));
    expect(await readFile(path.join(repo, 'a.txt'), 'utf8')).toBe('resolved\n');
  });

  it('reports the remaining conflicts when paths are still unmerged', async () => {
    git(repo, 'checkout', '-b', 'task/T-6');
    await writeFile(path.join(repo, 'a.txt'), 'task side\n');
    git(repo, 'commit', '-am', 'task side');
    git(repo, 'checkout', 'main');
    await writeFile(path.join(repo, 'a.txt'), 'base side\n');
    git(repo, 'commit', '-am', 'base side');
    try {
      git(repo, 'merge', 'task/T-6');
    } catch {
      /* conflict expected */
    }

    const result = await finalizeGitMerge({ path: repo });
    expect(result.state).toBe('conflict');
    expect(result.conflicts).toEqual(['a.txt']);
  });

  it('does not commit a resolved merge for a different task head', async () => {
    git(repo, 'checkout', '-b', 'task/T-wrong-head');
    await writeFile(path.join(repo, 'a.txt'), 'task side\n');
    git(repo, 'commit', '-am', 'task side');
    git(repo, 'checkout', 'main');
    await writeFile(path.join(repo, 'a.txt'), 'base side\n');
    git(repo, 'commit', '-am', 'base side');
    const baseHead = git(repo, 'rev-parse', 'HEAD');
    try {
      git(repo, 'merge', 'task/T-wrong-head');
    } catch {
      /* conflict expected */
    }
    await writeFile(path.join(repo, 'a.txt'), 'resolved\n');
    git(repo, 'add', 'a.txt');

    const result = await finalizeGitMerge({ expectedHead: baseHead, path: repo });

    expect(result).toMatchObject({ state: 'conflict', success: false });
    expect(result.error).toContain('not expected task head');
    expect(git(repo, 'rev-parse', 'HEAD')).toBe(baseHead);
    expect(git(repo, 'rev-parse', 'MERGE_HEAD')).not.toBe(baseHead);
  });

  it('reports integrated when no merge is in progress', async () => {
    const result = await finalizeGitMerge({ path: repo });
    expect(result.state).toBe('integrated');
    expect(result.sha).toBe(git(repo, 'rev-parse', 'HEAD'));
  });

  it('rejects an aborted merge that does not contain the expected task head', async () => {
    git(repo, 'checkout', '-b', 'task/T-aborted');
    await writeFile(path.join(repo, 'a.txt'), 'task side\n');
    git(repo, 'commit', '-am', 'task side');
    const taskHead = git(repo, 'rev-parse', 'HEAD');
    git(repo, 'checkout', 'main');
    await writeFile(path.join(repo, 'a.txt'), 'base side\n');
    git(repo, 'commit', '-am', 'base side');
    try {
      git(repo, 'merge', 'task/T-aborted');
    } catch {
      /* conflict expected */
    }
    git(repo, 'merge', '--abort');

    const result = await finalizeGitMerge({ expectedHead: taskHead, path: repo });
    expect(result).toMatchObject({ state: 'conflict', success: false });
    expect(result.error).toContain('does not contain expected task head');
  });
});
