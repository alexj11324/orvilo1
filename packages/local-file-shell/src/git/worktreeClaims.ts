import { execFile } from 'node:child_process';
import { timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';

import { readJsonRegistry, withRepoFileMutex, writeJsonRegistry } from './registryFile';
import type { GitRemoveWorktreeResult } from './types';
import { canonicalizePath, removeGitWorktree } from './worktrees';

const execFileAsync = promisify(execFile);

const CLAIMS_FILE = 'orvilo-worktree-claims.json';

/**
 * A server-issued claim token bound to one physical checkout directory. The
 * registry lives in the repo's git common dir — shared across every spelling
 * of the repo path — keyed by the canonicalized worktree path, so an alias or
 * case variant of the same directory collapses onto the one claim that owns it.
 */
interface WorktreeClaimEntry {
  claimToken: string;
  registeredAt: string;
}

const isClaimEntry = (value: unknown): value is WorktreeClaimEntry =>
  value !== null &&
  typeof value === 'object' &&
  typeof (value as WorktreeClaimEntry).claimToken === 'string' &&
  typeof (value as WorktreeClaimEntry).registeredAt === 'string';

/** Length-guarded constant-time token compare — never leaks where a guess differed. */
const tokensEqual = (presented: string, registered: string): boolean => {
  const a = Buffer.from(presented);
  const b = Buffer.from(registered);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * The claims registry path inside the repo's git common dir. `undefined` when
 * `dirPath` is not a git checkout — a host that cannot locate the common dir
 * cannot maintain claims, which callers surface as an explicit unsupported
 * capability rather than an empty registry.
 */
const claimsRegistryPath = async (dirPath: string): Promise<string | undefined> => {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--git-common-dir'], {
      cwd: dirPath,
      timeout: 5000,
    });
    const dir = stdout.trim();
    if (!dir) return undefined;
    const resolved = path.isAbsolute(dir) ? dir : path.join(dirPath, dir);
    // git answers with the physical path already, but canonicalize anyway —
    // the registry must be one file per physical repo even under alias mounts.
    return path.join(await canonicalizePath(resolved), CLAIMS_FILE);
  } catch {
    return undefined;
  }
};

const readClaimsRegistry = async (
  file: string,
): Promise<{ error?: string; registry?: Record<string, WorktreeClaimEntry> }> => {
  const read = await readJsonRegistry(file);
  if (read.status === 'corrupt') {
    return { error: `worktree-claim registry corrupt (${read.reason})` };
  }
  const registry: Record<string, WorktreeClaimEntry> = {};
  for (const [key, entry] of Object.entries(read.value)) {
    if (!isClaimEntry(entry)) {
      return { error: `worktree-claim registry corrupt (bad entry for ${key})` };
    }
    registry[key] = entry;
  }
  return { registry };
};

export interface WorktreeClaimRemoveResult extends GitRemoveWorktreeResult {
  /**
   * `true` only when the presented token was compared against a claim this
   * host actually registered for the canonical target path — never for
   * "no registry" / "no entry" / writer-blocked outcomes.
   */
  claimTokenVerified?: boolean;
}

/**
 * Register `claimToken` as the owner proof for the physical `worktreePath`.
 * Called right after `git worktree add` succeeds; serialized on the registry
 * mutex against verified removes so a delete can never interleave between an
 * add and its claim record. A later claim on the same path overwrites — the
 * server mints a fresh claim only after inspecting the directory free, and the
 * delete-time compare is what enforces ownership.
 */
export const registerWorktreeClaim = async (payload: {
  claimToken: string;
  path: string;
  worktreePath: string;
}): Promise<{ error?: string; success: boolean }> => {
  const { claimToken, path: dirPath, worktreePath } = payload;
  if (!claimToken?.trim()) return { error: 'Claim token is required', success: false };
  const file = await claimsRegistryPath(dirPath);
  if (!file) return { error: 'no git common dir for the claims registry', success: false };
  return withRepoFileMutex(file, async () => {
    const { registry, error } = await readClaimsRegistry(file);
    if (!registry) return { error, success: false };
    const canonical = await canonicalizePath(worktreePath);
    registry[canonical] = { claimToken, registeredAt: new Date().toISOString() };
    await writeJsonRegistry(file, registry);
    return { success: true };
  });
};

/**
 * The claim-token remove path: verify the token against the host-registered
 * claim for the canonical target, re-check live-writer presence, then delete —
 * all inside the one exclusive mutation section on the claims registry, so
 * writer admission and stale-token deletes serialize against each other.
 *
 * Never claims verification it did not perform: `claimTokenVerified` is
 * `true` only after the presented token matched this host's own registered
 * claim entry, in constant time. The registry entry is removed only when the
 * worktree removal itself succeeded — a failed remove keeps the claim so a
 * retry can still be verified.
 */
export const removeGitWorktreeVerified = async (payload: {
  claimToken: string;
  force?: boolean;
  /**
   * Host run-registry query — which live writer owns the canonical path.
   * Absent means the host cannot answer writer presence (explicit refusal),
   * never "no writer".
   */
  getActiveWriter?: (
    worktreePath: string,
  ) => Promise<{ operationId?: string; pid?: number; topicId?: string } | null>;
  path: string;
  worktreePath: string;
}): Promise<WorktreeClaimRemoveResult> => {
  const { claimToken, path: dirPath, worktreePath, force } = payload;
  if (!dirPath?.trim()) return { error: 'Working directory is required', success: false };
  if (!worktreePath?.trim()) return { error: 'Worktree path is required', success: false };
  const unverified = (error: string): WorktreeClaimRemoveResult => ({
    claimTokenVerified: false,
    error,
    success: false,
  });
  const getActiveWriter = payload.getActiveWriter;
  if (!getActiveWriter) {
    return unverified('cannot verify the claim token: this host has no run registry');
  }
  const file = await claimsRegistryPath(dirPath);
  if (!file) {
    return unverified(
      'cannot verify the claim token: this host maintains no worktree-claim registry',
    );
  }
  return withRepoFileMutex(file, async () => {
    const { registry, error } = await readClaimsRegistry(file);
    if (!registry) return unverified(error ?? 'worktree-claim registry unreadable');
    const canonical = await canonicalizePath(worktreePath);
    const entry = registry[canonical];
    if (!entry) {
      return unverified(`no claim registered for ${canonical}`);
    }
    if (!tokensEqual(claimToken, entry.claimToken)) {
      return unverified('claim token does not match the registered claim');
    }
    // Token verified — still hold the section for the writer check and the
    // removal so no other claim operation can interleave between them.
    const writer = await getActiveWriter(worktreePath);
    if (writer) {
      return unverified(`worktree has a live writer (op=${writer.operationId ?? 'unknown'})`);
    }
    const removed = await removeGitWorktree({ force, path: dirPath, worktreePath });
    if (!removed.success) return { ...removed, claimTokenVerified: true };
    delete registry[canonical];
    await writeJsonRegistry(file, registry);
    return { ...removed, claimTokenVerified: true };
  });
};

/** Drop a claim record without removing anything — for cleanup after a failed add. */
export const unregisterWorktreeClaim = async (payload: {
  path: string;
  worktreePath: string;
}): Promise<void> => {
  const file = await claimsRegistryPath(payload.path);
  if (!file) return;
  await withRepoFileMutex(file, async () => {
    const { registry } = await readClaimsRegistry(file);
    if (!registry) return;
    const canonical = await canonicalizePath(payload.worktreePath);
    if (registry[canonical]) {
      delete registry[canonical];
      await writeJsonRegistry(file, registry);
    }
  }).catch(() => {
    /* best-effort cleanup — a wedged registry must not hang the caller */
  });
};
