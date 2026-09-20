import { execFile } from 'node:child_process';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { createLogger } from '../logger';

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

const readRegistry = async (file: string): Promise<FenceRegistry> => {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    if (parsed && typeof parsed === 'object') return parsed as FenceRegistry;
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      log.warn('[pushFence] registry unreadable — treating as empty', {
        file,
        message: error?.message,
      });
    }
  }
  return {};
};

const writeRegistry = async (file: string, registry: FenceRegistry): Promise<void> => {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(registry));
  await rename(tmp, file);
};

/**
 * Persist that `fence` is the newest admitted writer for its ref. A lower or
 * equal seq from a different operation is rejected — after a lease handover a
 * stale writer's retry can no longer claim the ref. The claim is recorded
 * before the caller performs the remote mutation, so a crashed operation
 * still bumps the persisted maximum (conservative: the next owner mints an
 * even higher seq).
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
  const registry = await readRegistry(file);
  const held = registry[fence.ref];
  // `seq` is the acquisition epoch — strictly monotone per lease handover.
  // Equal seq means the same owning acquisition (one logical writer issues
  // several fenced ops); only a strictly older epoch is a stale writer.
  if (held && fence.seq < held.seq) {
    return `Stale push fence: ${fence.operationId} epoch ${fence.seq} is superseded by epoch ${held.seq}`;
  }
  registry[fence.ref] = { operationId: fence.operationId, seq: fence.seq };
  await writeRegistry(file, registry);
  return undefined;
};
