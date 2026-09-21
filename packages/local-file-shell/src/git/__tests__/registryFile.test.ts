import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { withRepoFileMutex } from '../registryFile';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

const freshTarget = async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'lfs-mutex-'));
  cleanup.push(dir);
  const target = path.join(dir, 'registry.json');
  return { lock: `${target}.lock`, target };
};

const waitFor = async (cond: () => boolean, ms = 5000): Promise<boolean> => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (cond()) return true;
    await sleep(10);
  }
  return cond();
};

const ageLock = async (lock: string) => {
  const aged = new Date(Date.now() - 10 * 60_000);
  await utimes(lock, aged, aged);
};

describe('withRepoFileMutex (SC02)', () => {
  it('never lets a second holder take over a live holder whose lock only looks old', async () => {
    const { lock, target } = await freshTarget();
    const events: string[] = [];

    let releaseA!: () => void;
    let aInside = false;
    const a = withRepoFileMutex(target, async () => {
      aInside = true;
      events.push('a:enter');
      await new Promise<void>((resolve) => {
        releaseA = resolve;
      });
      aInside = false;
      events.push('a:exit');
    });

    expect(await waitFor(() => existsSync(lock) && aInside)).toBe(true);
    const aRecord = await readFile(lock, 'utf8');
    // Simulate the paused/slow holder: mtime far past any staleness threshold,
    // owner still alive inside the section.
    await ageLock(lock);

    let bInside = false;
    const b = withRepoFileMutex(target, async () => {
      bInside = true;
      events.push('b:enter');
    });

    // The contender gets many retry rounds — it must stay out while A lives.
    await sleep(400);
    expect(bInside).toBe(false);
    // A's lock record is untouched — nothing judged a live holder dead.
    expect(await readFile(lock, 'utf8')).toBe(aRecord);

    releaseA();
    await Promise.all([a, b]);
    expect(events).toEqual(['a:enter', 'a:exit', 'b:enter']);
    expect(existsSync(lock)).toBe(false);
  });

  it('release is owner-verified — an exiting holder never deletes a foreign lock', async () => {
    const { lock, target } = await freshTarget();

    const a = withRepoFileMutex(target, async () => {
      expect(await waitFor(() => existsSync(lock))).toBe(true);
      // A foreign holder replaces the file underneath us — simulating an
      // intervening steal/recreate while our section ran.
      await rm(lock, { force: true });
      await writeFile(lock, 'foreign-owner');
    });
    await a;

    // The foreign lock survives A's release — exiting must not unlink what
    // this holder cannot prove it owns.
    expect(existsSync(lock)).toBe(true);
    expect(await readFile(lock, 'utf8')).toBe('foreign-owner');
  });

  it('blocks instead of grabbing a lock whose owner state cannot be answered', async () => {
    const { lock, target } = await freshTarget();
    // A record no reader can attribute to a live or dead holder.
    await writeFile(lock, 'garbage-without-owner');
    await ageLock(lock);

    const attempt = withRepoFileMutex(target, async () => 'entered', { timeoutMs: 800 });
    await expect(attempt).rejects.toThrow(/Timed out/);
    // The unanswerable lock is preserved — nobody stole it on age alone.
    expect(existsSync(lock)).toBe(true);
    expect(await readFile(lock, 'utf8')).toBe('garbage-without-owner');
  });

  it('reclaims a legacy-format lock only when its holder pid is provably dead', async () => {
    const { lock, target } = await freshTarget();
    // A lock left by an OLD host version — "<pid> <epochMs>", already looking
    // stale — owned by a process that has exited.
    const dead = spawn('bun', ['-e', ''], { stdio: 'ignore' });
    await new Promise((resolve) => dead.on('exit', resolve));
    await writeFile(lock, `${dead.pid} ${Date.now() - 10 * 60_000}\n`);

    await expect(withRepoFileMutex(target, async () => 'entered')).resolves.toBe('entered');
    expect(existsSync(lock)).toBe(false);
  });

  it('cross-process: a paused-but-alive holder blocks takeover, a killed holder yields', async () => {
    const { lock, target } = await freshTarget();

    const child = spawn('bun', [path.join(__dirname, 'holdMutex.child.ts'), target, '30000'], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let tag = '';
    let childClosed = false;
    child.stdout.on('data', (chunk) => {
      tag += chunk.toString();
    });
    child.on('close', () => {
      childClosed = true;
    });

    try {
      expect(await waitFor(() => tag.startsWith('acquired:'), 15_000)).toBe(true);
      // The reviewer's repro: age the live holder's lock — that must not be
      // read as proof of death.
      await ageLock(lock);

      let entered = false;
      const contender = withRepoFileMutex(
        target,
        async () => {
          entered = true;
        },
        { timeoutMs: 15_000 },
      );

      await sleep(600);
      // The live holder is never preempted — the critical section never ran
      // concurrently and the child's lock record survives.
      expect(entered).toBe(false);
      expect(existsSync(lock)).toBe(true);

      // Now the holder is provably dead — the contender may reclaim and enter.
      child.kill('SIGKILL');
      expect(await waitFor(() => childClosed, 10_000)).toBe(true);
      await contender;
      expect(entered).toBe(true);
    } finally {
      if (!childClosed) child.kill('SIGKILL');
    }
  }, 60_000);
});
