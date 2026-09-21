import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import path from 'node:path';

/**
 * Cross-process file mutex + strict JSON registry I/O shared by the git
 * host protocols (push fences, worktree claims). The mutex covers the whole
 * read-check-write of a registry file so two processes on the same physical
 * repo cannot interleave a stale read with a fresh write (the atomic-rename
 * hole: rename makes a single write atomic for readers but never serialized
 * the read-check-write cycle itself).
 */

/** Poll cadence while a live holder owns the lock. */
const LOCK_RETRY_MS = 25;
/** Give up entirely after this wait — a wedged holder must not hang callers. */
const LOCK_TIMEOUT_MS = 30_000;
/**
 * Live holders touch their lock at this cadence so a paused-but-alive owner
 * still reads as held to any observer that can only see the file's age.
 */
const LOCK_HEARTBEAT_MS = 15_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Uniform jitter so contending holders do not stampede in lockstep. */
const retryDelay = () => LOCK_RETRY_MS / 2 + Math.random() * LOCK_RETRY_MS;

export interface RepoFileMutexOptions {
  /** Override the give-up wait — tests shrink it; production never sets it. */
  timeoutMs?: number;
}

/** What a lock file announces about the process holding it. */
interface LockHolder {
  hostname?: string;
  pid?: number;
  token?: string;
}

/** A snapshot of the lock file — content plus the inode that holds it. */
interface LockState {
  dev: number;
  holder: LockHolder;
  ino: number;
  raw: string;
}

/**
 * Parse a lock file's holder record. Current locks are a JSON record carrying
 * `pid` + `hostname` + a unique `token`; locks left by older hosts are the
 * legacy `"<pid> <epochMs>"` line (no hostname — same-host by definition on a
 * local filesystem). Anything unparseable yields a holder with no pid, which
 * reads as "state cannot be answered" — never as "free".
 */
const parseLockHolder = (raw: string): LockHolder => {
  const text = raw.trim();
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      return {
        hostname: typeof record.hostname === 'string' ? record.hostname : undefined,
        pid: typeof record.pid === 'number' ? record.pid : undefined,
        token: typeof record.token === 'string' ? record.token : undefined,
      };
    }
  } catch {
    /* not JSON — try the legacy holder line below */
  }
  const legacy = /^(\d+)\s+\d+$/.exec(text);
  if (legacy) return { pid: Number.parseInt(legacy[1]!, 10) };
  return {};
};

const readLockState = async (lock: string): Promise<LockState> => {
  const s = await stat(lock);
  const raw = await readFile(lock, 'utf8');
  return { dev: s.dev, holder: parseLockHolder(raw), ino: s.ino, raw };
};

/**
 * Two snapshots describe the same lock only when the content is identical AND
 * the inode matches (inode `0` = filesystem without real inode numbers — the
 * content compare alone then carries the proof; the holder's unique token is
 * part of that content, so equality cannot be forged by a lookalike record).
 */
const sameLock = (a: LockState, b: LockState): boolean =>
  a.raw === b.raw && (a.ino === 0 || (a.dev === b.dev && a.ino === b.ino));

/**
 * Decide whether the announced holder still exists — the ONLY evidence that
 * can retire a lock. File age is never proof of death: a paused or slow
 * process holds a perfectly valid lock. `unknown` — no pid, foreign host —
 * means "cannot answer liveness", and the caller must block rather than grab.
 */
const holderLiveness = (holder: LockHolder): 'alive' | 'dead' | 'unknown' => {
  if (holder.pid === undefined) return 'unknown';
  if (holder.hostname !== undefined && holder.hostname !== hostname()) return 'unknown';
  try {
    process.kill(holder.pid, 0);
    return 'alive';
  } catch (error) {
    // EPERM — the process exists but is owned by someone else: still alive.
    return (error as NodeJS.ErrnoException)?.code === 'ESRCH' ? 'dead' : 'alive';
  }
};

/** Unlink the lock only while it is still the exact state `expect` saw. */
const rmIfSameLock = async (lock: string, expect: LockState): Promise<void> => {
  const now = await readLockState(lock).catch(() => undefined);
  if (now && sameLock(expect, now)) await rm(lock, { force: true });
};

/**
 * Run `fn` holding the exclusive cross-process lock for `target` (the lock
 * file is `<target>.lock`). Acquisition is an atomic `O_EXCL` create — two
 * racing processes can never both hold it. Contention is resolved by holder
 * liveness, not lock age: a live holder is never preempted, a provably dead
 * holder's record is reclaimed only after re-verifying the file is still
 * that same record, and an unattributable lock blocks until timeout. Release
 * is owner-verified — an exiting holder unlinks only the file it created,
 * never a lock a replacement put there.
 */
export const withRepoFileMutex = async <T>(
  target: string,
  fn: () => Promise<T>,
  options?: RepoFileMutexOptions,
): Promise<T> => {
  const lock = `${target}.lock`;
  const timeoutMs = options?.timeoutMs ?? LOCK_TIMEOUT_MS;
  const started = Date.now();
  for (;;) {
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    let created: LockState | undefined;
    try {
      handle = await open(lock, 'wx');
      const raw = `${JSON.stringify({
        acquiredAt: new Date().toISOString(),
        hostname: hostname(),
        pid: process.pid,
        token: randomUUID(),
      })}\n`;
      await handle.writeFile(raw);
      const s = await stat(lock);
      created = { dev: s.dev, holder: parseLockHolder(raw), ino: s.ino, raw };
    } catch (error) {
      if (handle) {
        // The create was O_EXCL, so whatever exists now is this attempt's own
        // file — close and remove it, then surface the real error.
        await handle.close().catch(() => undefined);
        await rm(lock, { force: true }).catch(() => undefined);
      }
      if ((error as NodeJS.ErrnoException)?.code !== 'EEXIST') throw error;
      try {
        const before = await readLockState(lock);
        if (holderLiveness(before.holder) === 'dead') {
          // Provably-dead holder — reclaim, but only if the file is still that
          // exact record: a living process may have re-created it meanwhile.
          await rmIfSameLock(lock, before);
        }
      } catch {
        /* lock vanished between reads — retry the create */
      }
      if (Date.now() - started > timeoutMs) {
        throw new Error(`Timed out acquiring registry lock ${lock}`, { cause: error });
      }
      await sleep(retryDelay());
      continue;
    }
    const heartbeat = setInterval(() => {
      void utimes(lock, new Date(), new Date()).catch(() => undefined);
    }, LOCK_HEARTBEAT_MS);
    heartbeat.unref?.();
    try {
      return await fn();
    } finally {
      clearInterval(heartbeat);
      await handle.close();
      // Owner-verified release: unlink only the lock this section created.
      await rmIfSameLock(lock, created!);
    }
  }
};

export type JsonRegistryRead =
  { status: 'ok'; value: Record<string, unknown> } | { reason: string; status: 'corrupt' };

/**
 * Strictly read a JSON-object registry file. A missing file is an empty
 * registry; anything else unreadable — bad JSON, a non-object payload, an IO
 * error — is corrupt and must be failed closed by the caller, never treated
 * as empty (an empty registry admits a fence that a live high-water mark
 * should have refused).
 */
export const readJsonRegistry = async (file: string): Promise<JsonRegistryRead> => {
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return { status: 'ok', value: {} };
    }
    return {
      reason: `unreadable: ${(error as Error)?.message ?? error}`,
      status: 'corrupt',
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      reason: `malformed JSON: ${(error as Error)?.message ?? error}`,
      status: 'corrupt',
    };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { reason: 'registry payload is not a JSON object', status: 'corrupt' };
  }
  return { status: 'ok', value: parsed as Record<string, unknown> };
};

/**
 * Write a JSON registry atomically for its readers: unique tmp sibling +
 * rename. Only safe for correctness inside `withRepoFileMutex` — the rename
 * is atomic for readers but does not order writers against each other.
 */
export const writeJsonRegistry = async (
  file: string,
  value: Record<string, unknown>,
): Promise<void> => {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(value));
  await rename(tmp, file);
};
