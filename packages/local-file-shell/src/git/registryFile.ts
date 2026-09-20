import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Cross-process file mutex + strict JSON registry I/O shared by the git
 * host protocols (push fences, worktree claims). The mutex covers the whole
 * read-check-write of a registry file so two processes on the same physical
 * repo cannot interleave a stale read with a fresh write (the atomic-rename
 * hole: rename makes a single write atomic for readers but never serialized
 * the read-check-write cycle itself).
 */

/** A lock abandoned by a killed holder is broken after this age. */
const LOCK_STALE_MS = 60_000;
/** Poll cadence while a live holder owns the lock. */
const LOCK_RETRY_MS = 25;
/** Give up entirely after this wait — a wedged holder must not hang callers. */
const LOCK_TIMEOUT_MS = 30_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Uniform jitter so contending holders do not stampede in lockstep. */
const retryDelay = () => LOCK_RETRY_MS / 2 + Math.random() * LOCK_RETRY_MS;

/**
 * Run `fn` holding the exclusive cross-process lock for `target` (the lock
 * file is `<target>.lock`). Acquisition is an atomic `O_EXCL` create — two
 * racing processes can never both hold it. A holder killed mid-section leaves
 * the lock behind; it is reclaimed once older than LOCK_STALE_MS.
 */
export const withRepoFileMutex = async <T>(target: string, fn: () => Promise<T>): Promise<T> => {
  const lock = `${target}.lock`;
  const started = Date.now();
  for (;;) {
    let handle;
    try {
      handle = await open(lock, 'wx');
      await handle.writeFile(`${process.pid} ${Date.now()}\n`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'EEXIST') throw error;
      try {
        const s = await stat(lock);
        if (Date.now() - s.mtimeMs > LOCK_STALE_MS) await rm(lock, { force: true });
      } catch {
        /* lock vanished between stat and rm — retry the create */
      }
      if (Date.now() - started > LOCK_TIMEOUT_MS) {
        throw new Error(`Timed out acquiring registry lock ${lock}`, { cause: error });
      }
      await sleep(retryDelay());
      continue;
    }
    try {
      return await fn();
    } finally {
      await handle.close();
      await rm(lock, { force: true });
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
