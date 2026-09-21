import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerWorktreeClaim, removeGitWorktreeVerified } from '../worktreeClaims';
import { addGitWorktree } from '../worktrees';

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const CLAIMS_FILE = 'orvilo-worktree-claims.json';

const initRepo = async (): Promise<string> => {
  const dir = await mkdtemp(path.join(tmpdir(), 'lfs-claims-'));
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

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

const noWriter = vi.fn(async () => null);

describe('worktree claim registry (SB01)', () => {
  it('registers a claim under the canonical worktree path', async () => {
    const repo = await initRepo();
    cleanup.push(repo);
    const linked = path.join(await mkdtemp(path.join(tmpdir(), 'lfs-wt-')), 'linked');
    cleanup.push(path.dirname(linked));
    await addGitWorktree({ branch: 'task/T-1', path: repo, worktreePath: linked });

    const registered = await registerWorktreeClaim({
      claimToken: 'tok-secret',
      path: repo,
      worktreePath: linked,
    });

    expect(registered).toEqual({ success: true });
    const claims = await readClaims(repo);
    const [key, entry] = Object.entries(claims)[0];
    // The stored key is the canonical (realpath'd) spelling of the worktree —
    // temp dirs on this platform already sit under symlinked /var.
    expect(key).toBe(await realpath(linked));
    expect(entry.claimToken).toBe('tok-secret');
  });

  it('verified remove deletes the worktree and releases the claim', async () => {
    const repo = await initRepo();
    cleanup.push(repo);
    const parent = await mkdtemp(path.join(tmpdir(), 'lfs-wt-'));
    cleanup.push(parent);
    const linked = path.join(parent, 'linked');
    await addGitWorktree({ branch: 'task/T-1', path: repo, worktreePath: linked });
    await registerWorktreeClaim({ claimToken: 'tok-secret', path: repo, worktreePath: linked });

    const removed = await removeGitWorktreeVerified({
      claimToken: 'tok-secret',
      getActiveWriter: noWriter,
      path: repo,
      worktreePath: linked,
    });

    expect(removed).toMatchObject({ claimTokenVerified: true, success: true });
    expect(existsSync(linked)).toBe(false);
    // The claim is released — claim and directory leave together.
    expect(await readClaims(repo)).toEqual({});
  });

  it('refuses a stale or arbitrary token — directory and claim stay untouched', async () => {
    const repo = await initRepo();
    cleanup.push(repo);
    const parent = await mkdtemp(path.join(tmpdir(), 'lfs-wt-'));
    cleanup.push(parent);
    const linked = path.join(parent, 'linked');
    await addGitWorktree({ branch: 'task/T-1', path: repo, worktreePath: linked });
    await registerWorktreeClaim({ claimToken: 'tok-secret', path: repo, worktreePath: linked });

    const rejected = await removeGitWorktreeVerified({
      claimToken: 'tok-random',
      getActiveWriter: noWriter,
      path: repo,
      worktreePath: linked,
    });

    expect(rejected).toMatchObject({ claimTokenVerified: false, success: false });
    expect(rejected.error).toContain('does not match');
    expect(existsSync(linked)).toBe(true);
    // The live claim is still registered — the refused delete cannot free it.
    expect(Object.keys(await readClaims(repo))).toHaveLength(1);
  });

  it('refuses a remove for a path that was never claimed', async () => {
    const repo = await initRepo();
    cleanup.push(repo);
    const parent = await mkdtemp(path.join(tmpdir(), 'lfs-wt-'));
    cleanup.push(parent);
    const linked = path.join(parent, 'linked');
    await addGitWorktree({ branch: 'task/T-1', path: repo, worktreePath: linked });

    const rejected = await removeGitWorktreeVerified({
      claimToken: 'tok-anything',
      getActiveWriter: noWriter,
      path: repo,
      worktreePath: linked,
    });

    expect(rejected.claimTokenVerified).toBe(false);
    expect(rejected.error).toContain('no claim registered');
    expect(existsSync(linked)).toBe(true);
  });

  it('refuses a claimed remove while a live writer owns the path', async () => {
    const repo = await initRepo();
    cleanup.push(repo);
    const parent = await mkdtemp(path.join(tmpdir(), 'lfs-wt-'));
    cleanup.push(parent);
    const linked = path.join(parent, 'linked');
    await addGitWorktree({ branch: 'task/T-1', path: repo, worktreePath: linked });
    await registerWorktreeClaim({ claimToken: 'tok-secret', path: repo, worktreePath: linked });

    const rejected = await removeGitWorktreeVerified({
      claimToken: 'tok-secret',
      getActiveWriter: vi.fn(async () => ({ operationId: 'op-live' })),
      path: repo,
      worktreePath: linked,
    });

    expect(rejected.claimTokenVerified).toBe(false);
    expect(rejected.error).toContain('live writer');
    expect(existsSync(linked)).toBe(true);
    expect(Object.keys(await readClaims(repo))).toHaveLength(1);
  });

  it('keeps the claim when the verified remove fails underneath', async () => {
    const repo = await initRepo();
    cleanup.push(repo);
    const parent = await mkdtemp(path.join(tmpdir(), 'lfs-wt-'));
    cleanup.push(parent);
    const linked = path.join(parent, 'linked');
    await addGitWorktree({ branch: 'task/T-1', path: repo, worktreePath: linked });
    await registerWorktreeClaim({ claimToken: 'tok-secret', path: repo, worktreePath: linked });
    // Dirty the worktree so a non-force removal fails.
    await writeFile(path.join(linked, 'a.txt'), 'dirty\n');

    const removed = await removeGitWorktreeVerified({
      claimToken: 'tok-secret',
      getActiveWriter: noWriter,
      path: repo,
      worktreePath: linked,
    });

    // The token DID verify — but the claim must stay so a retry can complete.
    expect(removed).toMatchObject({ claimTokenVerified: true, success: false });
    expect(existsSync(linked)).toBe(true);
    expect(Object.keys(await readClaims(repo))).toHaveLength(1);
  });

  it('fails closed on a corrupt claims registry', async () => {
    const repo = await initRepo();
    cleanup.push(repo);
    const parent = await mkdtemp(path.join(tmpdir(), 'lfs-wt-'));
    cleanup.push(parent);
    const linked = path.join(parent, 'linked');
    await addGitWorktree({ branch: 'task/T-1', path: repo, worktreePath: linked });
    await registerWorktreeClaim({ claimToken: 'tok-secret', path: repo, worktreePath: linked });
    await writeFile(claimsPath(repo), '{broken');

    const rejected = await removeGitWorktreeVerified({
      claimToken: 'tok-secret',
      getActiveWriter: noWriter,
      path: repo,
      worktreePath: linked,
    });

    expect(rejected).toMatchObject({ claimTokenVerified: false, success: false });
    expect(rejected.error).toContain('corrupt');
    expect(existsSync(linked)).toBe(true);
  });

  it('refuses to claim-verify on a host without a run registry', async () => {
    const repo = await initRepo();
    cleanup.push(repo);

    const rejected = await removeGitWorktreeVerified({
      claimToken: 'tok-secret',
      path: repo,
      worktreePath: path.join(repo, 'whatever'),
    });

    expect(rejected).toMatchObject({ claimTokenVerified: false, success: false });
    expect(rejected.error).toContain('run registry');
  });

  it('resolves the same claim across an alias spelling of the worktree path', async () => {
    const repo = await initRepo();
    cleanup.push(repo);
    const parent = await mkdtemp(path.join(tmpdir(), 'lfs-wt-'));
    cleanup.push(parent);
    const linked = path.join(parent, 'linked');
    await addGitWorktree({ branch: 'task/T-1', path: repo, worktreePath: linked });
    await registerWorktreeClaim({ claimToken: 'tok-secret', path: repo, worktreePath: linked });

    // A second spelling of the same physical directory — a symlinked parent.
    const aliasParent = path.join(await mkdtemp(path.join(tmpdir(), 'lfs-alias-')), 'parent');
    cleanup.push(path.dirname(aliasParent));
    await symlink(await realpath(parent), aliasParent);
    const alias = path.join(aliasParent, 'linked');
    expect(await realpath(alias)).toBe(await realpath(linked));

    const removed = await removeGitWorktreeVerified({
      claimToken: 'tok-secret',
      getActiveWriter: noWriter,
      path: repo,
      worktreePath: alias,
    });

    expect(removed).toMatchObject({ claimTokenVerified: true, success: true });
    expect(existsSync(linked)).toBe(false);
    expect(await readClaims(repo)).toEqual({});
  });
});
