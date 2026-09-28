import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { pushGitBranch } from '../branches';
import { claimGitPushFence } from '../pushFence';

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const REGISTRY = 'orvilo-push-fences.json';

const initRepo = async (): Promise<string> => {
  const dir = await mkdtemp(path.join(tmpdir(), 'lfs-fence-'));
  execFileSync('git', ['-c', 'init.defaultBranch=main', 'init'], { cwd: dir });
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  git(dir, 'config', 'commit.gpgsign', 'false');
  await writeFile(path.join(dir, 'a.txt'), 'hello\n');
  git(dir, 'add', 'a.txt');
  git(dir, 'commit', '-m', 'init');
  return dir;
};

const registryPath = (repo: string) => path.join(repo, '.git', REGISTRY);

const readRawRegistry = (repo: string) => readFile(registryPath(repo), 'utf8');

const readRegistry = async (repo: string) =>
  JSON.parse(await readRawRegistry(repo)) as Record<string, { operationId: string; seq: number }>;

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

const claim = (repo: string, seq: number, operationId = `${seq}:op`) =>
  claimGitPushFence(repo, { operationId, ref: 'refs/heads/main', seq });

/** Run the claim in a real second process (bun executes the TS directly). */
const claimInChild = (repo: string, seq: number, operationId = `${seq}:op`) =>
  new Promise<{ output: string; status: number }>((resolve, reject) => {
    const child = spawn(
      'bun',
      [path.join(__dirname, 'claimPushFence.child.ts'), repo, operationId, String(seq)],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    );
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.on('error', reject);
    child.on('close', (status) => resolve({ output, status: status ?? -1 }));
  });

describe('claimGitPushFence (SB05)', () => {
  it('admits a first claim and persists the fence entry', async () => {
    const repo = await initRepo();
    cleanup.push(repo);

    expect(await claim(repo, 5, '5:writer')).toBeUndefined();
    expect(await readRegistry(repo)).toEqual({
      'refs/heads/main': { operationId: '5:writer', seq: 5 },
    });
  });

  it('never lets a stale epoch overwrite a persisted high-water mark', async () => {
    const repo = await initRepo();
    cleanup.push(repo);

    expect(await claim(repo, 5, '5:writer')).toBeUndefined();
    const rejected = await claim(repo, 4, '4:stale-writer');

    expect(rejected).toContain('Stale push fence');
    // The persisted maximum is untouched by the refused claim.
    expect((await readRegistry(repo))['refs/heads/main']).toEqual({
      operationId: '5:writer',
      seq: 5,
    });
  });

  it('fails closed on a corrupt registry instead of fencing over it', async () => {
    const repo = await initRepo();
    cleanup.push(repo);
    expect(await claim(repo, 5)).toBeUndefined();
    await writeFile(registryPath(repo), '{not json');
    const before = await readRawRegistry(repo);

    const rejected = await claim(repo, 6, '6:new-owner');

    expect(rejected).toContain('corrupt');
    expect(await readRawRegistry(repo)).toBe(before);
  });

  it('fails closed on a structurally malformed entry', async () => {
    const repo = await initRepo();
    cleanup.push(repo);
    await writeFile(
      registryPath(repo),
      JSON.stringify({ 'refs/heads/main': { operationId: '1:x', seq: 'five' } }),
    );
    const before = await readRawRegistry(repo);

    expect(await claim(repo, 9, '9:new-owner')).toContain('corrupt');
    expect(await readRawRegistry(repo)).toBe(before);
  });

  it('serializes concurrent claims from two real processes — registry ends at the maximum epoch', async () => {
    const repo = await initRepo();
    cleanup.push(repo);
    await claim(repo, 1);

    // Two processes racing: whichever order the interleave takes, the high
    // water mark can only land at the max — never regress to a lower epoch.
    const [a, b] = await Promise.all([claimInChild(repo, 3), claimInChild(repo, 2)]);

    for (const result of [a, b]) {
      expect(result.status).toBe(0);
      expect(result.output === 'ok' || result.output.startsWith('rejected:Stale')).toBe(true);
    }
    expect((await readRegistry(repo))['refs/heads/main'].seq).toBe(3);
  }, 60_000);

  it('lets a delayed lower-epoch second process be refused instead of regressing the mark', async () => {
    const repo = await initRepo();
    cleanup.push(repo);

    const high = await claimInChild(repo, 7, '7:owner');
    expect(high.output).toBe('ok');
    const low = await claimInChild(repo, 6, '6:stale');

    expect(low.output).toContain('rejected:Stale push fence');
    expect((await readRegistry(repo))['refs/heads/main']).toEqual({
      operationId: '7:owner',
      seq: 7,
    });
  }, 60_000);

  it('pushGitBranch refuses to touch the remote when the registry is corrupt', async () => {
    const repo = await initRepo();
    cleanup.push(repo);
    // Wire a bare remote so a wrongly-admitted push would observably land.
    const bare = await mkdtemp(path.join(tmpdir(), 'lfs-fence-bare-'));
    cleanup.push(bare);
    execFileSync('git', ['init', '--bare', bare], { cwd: bare });
    git(repo, 'remote', 'add', 'origin', bare);
    git(repo, 'push', 'origin', 'main');
    const remoteBefore = git(bare, 'rev-parse', 'refs/heads/main');

    await writeFile(registryPath(repo), '{corrupt');
    await writeFile(path.join(repo, 'b.txt'), 'work\n');
    git(repo, 'add', 'b.txt');
    git(repo, 'commit', '-m', 'work');

    const pushed = await pushGitBranch({
      fence: { operationId: '5:op', ref: 'refs/heads/main', seq: 5 },
      path: repo,
      remoteBranch: 'main',
    });

    expect(pushed.success).toBe(false);
    expect(pushed.error).toContain('corrupt');
    expect(git(bare, 'rev-parse', 'refs/heads/main')).toBe(remoteBefore);
  });
});
