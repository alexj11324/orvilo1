import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import type * as FsPromises from 'node:fs/promises';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { RegistryLockRecoveryRequiredError, withRepoFileMutex } from '../registryFile';

/**
 * SC02 R6 — reclaim must never unlink a lock a NEW owner already took.
 *
 * R5's "verify the dead record, then unlink it" splits the reclaim into two
 * steps. Between them a second reclaimer can free the slot and a fresh owner
 * can land in it, so the stale unlink deletes a live lock. This test makes
 * that window deterministic: `rm` on the lock path is parked inside the
 * verify→unlink gap (the same interleaving a SIGSTOP or a busy scheduler
 * produces), the slot is handed to a new owner, and only then is the parked
 * unlink released onto it.
 */
const shared = vi.hoisted(() => ({
  armedPath: undefined as string | undefined,
  gateLimit: 0,
  parked: [] as Array<{ path: string; release: () => void }>,
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return {
    ...actual,
    rm: async (...args: Parameters<typeof actual.rm>) => {
      const target = String(args[0]);
      if (target === shared.armedPath && shared.parked.length < shared.gateLimit) {
        await new Promise<void>((resolve) => {
          shared.parked.push({ path: target, release: resolve });
        });
      }
      return actual.rm(...args);
    },
  };
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (cond: () => boolean | Promise<boolean>, ms = 5000): Promise<boolean> => {
  const deadline = Date.now() + ms;
  for (;;) {
    if (await cond()) return true;
    if (Date.now() >= deadline) return false;
    await sleep(10);
  }
};

const cleanup: string[] = [];

afterEach(async () => {
  shared.armedPath = undefined;
  shared.gateLimit = 0;
  for (const parked of shared.parked.splice(0)) parked.release();
  await Promise.all(cleanup.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe('withRepoFileMutex reclaim race (SC02 R6)', () => {
  it('a reclaimer can never delete a lock a fresh owner already took', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lfs-mutex-race-'));
    cleanup.push(dir);
    const target = path.join(dir, 'registry.json');
    const lock = `${target}.lock`;

    // A lock left by a holder that is provably dead.
    const dead = spawnSync(process.execPath, ['-e', 'process.exit(0)']);
    const deadRecord = `${JSON.stringify({
      acquiredAt: new Date().toISOString(),
      hostname: hostname(),
      pid: dead.pid,
      token: 'dead-token',
    })}\n`;
    await writeFile(lock, deadRecord);

    const events: string[] = [];
    const gates: Record<string, () => void> = {};
    const gateFor = (who: string) =>
      new Promise<void>((resolve) => {
        gates[who] = resolve;
      });
    const aGate = gateFor('a');
    const bGate = gateFor('b');

    // Park the unlink step of the first two lock-path removals — under the
    // old verify-then-unlink shape these are exactly the two reclaimers.
    shared.armedPath = lock;
    shared.gateLimit = 2;
    shared.parked = [];

    const a = withRepoFileMutex(target, async () => {
      events.push('a:enter');
      await aGate;
      events.push('a:exit');
    });
    const b = withRepoFileMutex(target, async () => {
      events.push('b:enter');
      await bGate;
      events.push('b:exit');
    });

    let freshOwnerSurvived = true;
    try {
      const bothParked = await waitFor(() => shared.parked.length >= 2 || events.length > 0, 3000);
      expect(bothParked).toBe(true);

      if (shared.parked.length >= 2) {
        // The first reclaimer's unlink frees the dead slot; its owner then
        // re-acquires — that re-acquisition IS the new owner C of the
        // reviewer scenario. It stays inside its section, gated.
        shared.parked[0]!.release();
        const fresh = await waitFor(async () => {
          if (!existsSync(lock)) return false;
          return (await readFile(lock, 'utf8')) !== deadRecord;
        });
        expect(fresh).toBe(true);

        // The second reclaimer's stale unlink now lands on the fresh owner.
        shared.parked[1]!.release();
        await sleep(80);
        freshOwnerSurvived = existsSync(lock) && (await readFile(lock, 'utf8')) !== deadRecord;
      }
    } finally {
      for (const parked of shared.parked.splice(0)) parked.release();
      shared.gateLimit = 0;
      gates.a?.();
      gates.b?.();
      await Promise.allSettled([a, b]);
    }

    expect(freshOwnerSurvived, 'a stale reclaimer unlinked the new owner lock').toBe(true);
    // Mutual exclusion: enter/exit strictly nested, never overlapped.
    expect(events).toHaveLength(4);
    for (let i = 0; i < events.length; i += 2) {
      expect(events[i]).toMatch(/:enter$/);
      expect(events[i + 1]).toBe(events[i]!.replace(':enter', ':exit'));
    }
  });
});

/**
 * SC02 R7 — a leftover `.reclaim` ticket is fail-closed, never recycled
 * inside the racing acquire path. The R6 cleanup's check-then-unlink window
 * let a second reclaimer delete a FRESH ticket, so a rename landed a lock
 * record whose owner never acquired it (0 acquisitions, lock attributed to
 * a live pid). The contract now: ticket residue blocks with a
 * recovery-required error until controlled recovery removes it.
 */
describe('withRepoFileMutex reclaim-ticket residue (SC02 R7)', () => {
  const recordFor = (pid: number, token: string) =>
    `${JSON.stringify({
      acquiredAt: new Date().toISOString(),
      hostname: hostname(),
      pid,
      token,
    })}\n`;

  const deadPid = () => spawnSync(process.execPath, ['-e', 'process.exit(0)']).pid;

  it('dead lock + dead ticket: both contenders fail closed, nothing is mutated', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lfs-ticket-residue-'));
    cleanup.push(dir);
    const target = path.join(dir, 'registry.json');
    const lock = `${target}.lock`;
    const ticket = `${lock}.reclaim`;

    // On-disk residue of a reclaimer that crashed after writing its ticket
    // (pre-rename SIGKILL point) on top of a lock whose owner also died.
    const deadRecord = recordFor(deadPid(), 'dead-owner');
    const deadTicket = recordFor(deadPid(), 'dead-reclaimer');
    await writeFile(lock, deadRecord);
    await writeFile(ticket, deadTicket);

    const fn = vi.fn(async () => 'entered');
    const results = await Promise.allSettled([
      withRepoFileMutex(target, fn),
      withRepoFileMutex(target, fn),
    ]);

    for (const result of results) {
      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') {
        expect(result.reason).toBeInstanceOf(RegistryLockRecoveryRequiredError);
        expect((result.reason as RegistryLockRecoveryRequiredError).code).toBe(
          'REGISTRY_LOCK_RECOVERY_REQUIRED',
        );
      }
    }
    expect(fn).not.toHaveBeenCalled();
    // Explicit blocking means NO mutation: the lock is not re-attributed to
    // any requester and the ticket is not deleted or moved.
    expect(await readFile(lock, 'utf8')).toBe(deadRecord);
    expect(await readFile(ticket, 'utf8')).toBe(deadTicket);
  });

  it('an unattributable ticket record fails closed the same way', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lfs-ticket-garbage-'));
    cleanup.push(dir);
    const target = path.join(dir, 'registry.json');
    const lock = `${target}.lock`;
    const ticket = `${lock}.reclaim`;

    await writeFile(lock, recordFor(deadPid(), 'dead-owner'));
    // Corrupt/torn ticket: no pid to attribute — must block, never be
    // treated as a free slot or silently emptied.
    await writeFile(ticket, '{"pid":');

    await expect(withRepoFileMutex(target, async () => 'entered')).rejects.toBeInstanceOf(
      RegistryLockRecoveryRequiredError,
    );
    expect(await readFile(ticket, 'utf8')).toBe('{"pid":');
  });

  it('a live ticket holder is never preempted — contenders wait out the timeout', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lfs-ticket-live-'));
    cleanup.push(dir);
    const target = path.join(dir, 'registry.json');
    const lock = `${target}.lock`;
    const ticket = `${lock}.reclaim`;

    await writeFile(lock, recordFor(deadPid(), 'dead-owner'));
    const liveTicket = recordFor(process.pid, 'live-reclaimer');
    await writeFile(ticket, liveTicket);

    await expect(
      withRepoFileMutex(target, async () => 'entered', { timeoutMs: 300 }),
    ).rejects.toThrow(/Timed out acquiring registry lock/);
    expect(await readFile(lock, 'utf8')).toContain('dead-owner');
    expect(await readFile(ticket, 'utf8')).toBe(liveTicket);
  });

  it('controlled recovery removes the residue and the next contender takes over cleanly', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lfs-ticket-recovery-'));
    cleanup.push(dir);
    const target = path.join(dir, 'registry.json');
    const lock = `${target}.lock`;
    const ticket = `${lock}.reclaim`;

    const deadRecord = recordFor(deadPid(), 'dead-owner');
    await writeFile(lock, deadRecord);
    await writeFile(ticket, recordFor(deadPid(), 'dead-reclaimer'));

    await expect(withRepoFileMutex(target, async () => 'entered')).rejects.toBeInstanceOf(
      RegistryLockRecoveryRequiredError,
    );

    // Controlled recovery: all writers quiesced, residue verified and removed.
    await rm(ticket);

    // Observe inside the section: the takeover renamed the winner's ticket
    // onto the lock — it names this live process, not the dead record.
    let landed: string | undefined;
    await withRepoFileMutex(target, async () => {
      landed = await readFile(lock, 'utf8');
    });
    expect(landed).not.toBe(deadRecord);
    expect(landed).toContain(`"pid":${process.pid}`);
    expect(existsSync(ticket)).toBe(false);
  });
});
