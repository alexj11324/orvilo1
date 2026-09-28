import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { createLogger } from '../logger';
import { readJsonRegistry, withRepoFileMutex, writeJsonRegistry } from './registryFile';

const log = createLogger('local-file-shell:git');

const execFileAsync = promisify(execFile);

const FENCE_FILE = 'orvilo-push-fences.json';

/**
 * A persisted remote-write fence. `seq` is the monotone lease fence handed to
 * the mutation by the server-side repo/ref lease; `operationId` is the stable
 * identity of the single operation allowed to perform the write.
 */
export interface GitPushFence {
  operationId: string;
  /** Remote ref being guarded, e.g. `refs/heads/main`. */
  ref: string;
  seq: number;
}

interface FenceRegistry {
  [ref: string]: { operationId: string; seq: number };
}

/**
 * Resolve the registry path inside the repo's git common dir (shared across
 * worktrees, unlike `.git/`, so an integration worktree fences the same
 * remote the primary checkout writes to).
 */
const fenceRegistryPath = async (dirPath: string): Promise<string | undefined> => {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--git-common-dir'], {
      cwd: dirPath,
      timeout: 5000,
    });
    const dir = stdout.trim();
    if (!dir) return undefined;
    return path.join(path.isAbsolute(dir) ? dir : path.join(dirPath, dir), FENCE_FILE);
  } catch (error: any) {
    log.warn('[pushFence] could not resolve git common dir', {
      cwd: dirPath,
      message: error?.message,
    });
    return undefined;
  }
};

interface FenceRegistryEntry {
  operationId: string;
  seq: number;
}

const isFenceEntry = (value: unknown): value is FenceRegistryEntry =>
  value !== null &&
  typeof value === 'object' &&
  typeof (value as FenceRegistryEntry).operationId === 'string' &&
  typeof (value as FenceRegistryEntry).seq === 'number' &&
  Number.isFinite((value as FenceRegistryEntry).seq);

/**
 * Fail-closed registry read: a missing file is an empty registry, but a
 * corrupt file must refuse fencing — treating it as empty would let an old
 * epoch claim over a persisted high-water mark.
 */
const readRegistryStrict = async (
  file: string,
): Promise<{ registry?: FenceRegistry; error?: string }> => {
  const read = await readJsonRegistry(file);
  if (read.status === 'corrupt') {
    return { error: `Push fence registry corrupt (${read.reason})` };
  }
  const registry: FenceRegistry = {};
  for (const [ref, entry] of Object.entries(read.value)) {
    if (!isFenceEntry(entry)) {
      return { error: `Push fence registry corrupt (bad entry for ${ref})` };
    }
    registry[ref] = entry;
  }
  return { registry };
};

/**
 * Persist that `fence` is the newest admitted writer for its ref. A lower or
 * equal seq from a different operation is rejected — after a lease handover a
 * stale writer's retry can no longer claim the ref. The claim is recorded
 * before the caller performs the remote mutation, so a crashed operation
 * still bumps the persisted maximum (conservative: the next owner mints an
 * even higher seq).
 *
 * The read-check-write runs inside the repo-common-dir file mutex — two
 * processes racing a claim on the same physical ref serialize on it, so an
 * out-of-order arrival cannot overwrite a higher epoch with a lower one.
 * Registry reads are strict: a corrupt file fails closed rather than fencing
 * a stale writer over a live high-water mark.
 *
 * Returns undefined on success, or a rejection reason string.
 */
export const claimGitPushFence = async (
  dirPath: string,
  fence: GitPushFence,
): Promise<string | undefined> => {
  if (!fence.operationId?.trim() || !fence.ref?.trim() || !Number.isFinite(fence.seq)) {
    return 'Invalid push fence';
  }
  const file = await fenceRegistryPath(dirPath);
  if (!file) return 'Push fence registry unavailable';
  return withRepoFileMutex(file, async () => {
    const { registry, error } = await readRegistryStrict(file);
    if (!registry) return `${error} — refusing to fence ${fence.ref}`;
    const held = registry[fence.ref];
    // `seq` is the acquisition epoch — strictly monotone per lease handover.
    // Equal seq means the same owning acquisition (one logical writer issues
    // several fenced ops); only a strictly older epoch is a stale writer.
    if (held && fence.seq < held.seq) {
      return `Stale push fence: ${fence.operationId} epoch ${fence.seq} is superseded by epoch ${held.seq}`;
    }
    registry[fence.ref] = { operationId: fence.operationId, seq: fence.seq };
    await writeJsonRegistry(file, registry);
    return undefined;
  });
};
