import { execFile } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { createLogger } from '../logger';
import type {
  GitBranchListItem,
  GitCheckoutResult,
  GitDeleteBranchResult,
  GitFileRevertResult,
  GitFinalizeMergeResult,
  GitMergeResult,
  GitPullResult,
  GitPushResult,
  GitRemoteBranchListItem,
  GitRenameBranchResult,
} from './types';

const log = createLogger('local-file-shell:git');
const execFileAsync = promisify(execFile);

/** Reject obviously invalid branch refs early to avoid a confusing git error. */
export const isInvalidBranchRef = (name: string): boolean =>
  /[\s~^:?*[\\]/.test(name) || name.startsWith('-') || name.includes('..');

/**
 * List local git branches ordered by most recent commit. `current` is true for
 * the checked-out branch.
 */
export const listGitBranches = async (dirPath: string): Promise<GitBranchListItem[]> => {
  try {
    const { stdout } = await execFileAsync(
      'git',
      [
        'for-each-ref',
        '--sort=-committerdate',
        '--format=%(HEAD)%09%(refname:short)%09%(upstream:short)',
        'refs/heads',
      ],
      { cwd: dirPath, timeout: 5000 },
    );
    return stdout
      .replaceAll('\r', '')
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => {
        // Line format: "<HEAD-marker>\t<branch>\t<upstream>" where HEAD-marker is '*' or ' '
        const [head, name, upstream] = line.split('\t');
        return {
          current: head === '*',
          name: name ?? '',
          upstream: upstream || undefined,
        };
      })
      .filter((b) => b.name);
  } catch (error: any) {
    log.warn('[listGitBranches] git command failed', {
      code: error?.code,
      cwd: dirPath,
      message: error?.message,
      stderr: error?.stderr?.toString?.() ?? error?.stderr,
    });
    return [];
  }
};

/**
 * List remote branches under `refs/remotes/origin/*`, ordered by most recent
 * commit. The `HEAD` symref is filtered out and the resolved default branch is
 * flagged via `isDefault`.
 */
export const listGitRemoteBranches = async (
  dirPath: string,
): Promise<GitRemoteBranchListItem[]> => {
  let defaultRef: string | undefined;
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'],
      { cwd: dirPath, timeout: 5000 },
    );
    defaultRef = stdout.trim() || undefined;
  } catch {
    defaultRef = undefined;
  }
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['for-each-ref', '--sort=-committerdate', '--format=%(refname:short)', 'refs/remotes/origin'],
      { cwd: dirPath, timeout: 5000 },
    );
    return stdout
      .replaceAll('\r', '')
      .split('\n')
      .map((line) => line.trim())
      .filter((name) => name.length > 0 && name !== 'origin/HEAD' && !name.endsWith('/HEAD'))
      .map((name) => ({ isDefault: name === defaultRef, name }));
  } catch (error: any) {
    log.warn('[listGitRemoteBranches] git command failed', {
      code: error?.code,
      cwd: dirPath,
      message: error?.message,
      stderr: error?.stderr?.toString?.() ?? error?.stderr,
    });
    return [];
  }
};

/**
 * Check out (or create + check out) a branch. Relies on git itself to reject
 * unsafe checkouts (dirty tree, non-fast-forward, etc.) and surfaces git's
 * stderr so the UI can display a meaningful error.
 */
export const checkoutGitBranch = async (payload: {
  branch: string;
  create?: boolean;
  path: string;
}): Promise<GitCheckoutResult> => {
  const { path: dirPath, branch, create } = payload;
  if (!branch?.trim()) {
    return { error: 'Branch name is required', success: false };
  }
  if (isInvalidBranchRef(branch)) {
    return { error: `Invalid branch name: ${branch}`, success: false };
  }

  const args = create ? ['checkout', '-b', branch] : ['checkout', branch];
  try {
    await execFileAsync('git', args, { cwd: dirPath, timeout: 10_000 });
    return { success: true };
  } catch (error: any) {
    const stderr: string = (error?.stderr ?? error?.message ?? '').toString().trim();
    log.debug('[checkoutGitBranch] failed', { args, stderr });
    return { error: stderr || 'git checkout failed', success: false };
  }
};

/**
 * Rename a local branch (`git branch -m <from> <to>`). Works on the current
 * branch too. Uses the non-force `-m`, so git rejects (and we surface) a rename
 * onto an existing branch name.
 */
export const renameGitBranch = async (payload: {
  from: string;
  path: string;
  to: string;
}): Promise<GitRenameBranchResult> => {
  const { path: dirPath, from, to } = payload;
  if (!from?.trim() || !to?.trim()) {
    return { error: 'Branch name is required', success: false };
  }
  if (isInvalidBranchRef(to)) {
    return { error: `Invalid branch name: ${to}`, success: false };
  }

  try {
    await execFileAsync('git', ['branch', '-m', from, to], { cwd: dirPath, timeout: 10_000 });
    return { success: true };
  } catch (error: any) {
    const stderr: string = (error?.stderr ?? error?.message ?? '').toString().trim();
    log.debug('[renameGitBranch] failed', { from, stderr, to });
    return { error: stderr || 'git branch rename failed', success: false };
  }
};

/**
 * Delete a local branch (`git branch -D <branch>`). Force delete (`-D`) is
 * intentional: the UI gates this behind an explicit confirm. git still refuses
 * to delete the currently checked-out branch, and that error is surfaced.
 */
export const deleteGitBranch = async (payload: {
  branch: string;
  path: string;
}): Promise<GitDeleteBranchResult> => {
  const { path: dirPath, branch } = payload;
  if (!branch?.trim()) {
    return { error: 'Branch name is required', success: false };
  }
  if (isInvalidBranchRef(branch)) {
    return { error: `Invalid branch name: ${branch}`, success: false };
  }

  try {
    await execFileAsync('git', ['branch', '-D', branch], { cwd: dirPath, timeout: 10_000 });
    return { success: true };
  } catch (error: any) {
    const stderr: string = (error?.stderr ?? error?.message ?? '').toString().trim();
    log.debug('[deleteGitBranch] failed', { branch, stderr });
    return { error: stderr || 'git branch delete failed', success: false };
  }
};

/**
 * Pull the current branch's upstream via fast-forward only. `--ff-only` avoids
 * accidental merge commits when the local branch has diverged.
 */
export const pullGitBranch = async (payload: { path: string }): Promise<GitPullResult> => {
  const { path: dirPath } = payload;
  try {
    const { stdout } = await execFileAsync('git', ['pull', '--ff-only'], {
      cwd: dirPath,
      timeout: 60_000,
    });
    const noop = /Already up to date/i.test(stdout);
    return { noop, success: true };
  } catch (error: any) {
    const stderr: string = (error?.stderr ?? error?.message ?? '').toString().trim();
    log.debug('[pullGitBranch] failed', { stderr });
    return { error: stderr || 'git pull failed', success: false };
  }
};

/**
 * Push the current branch to its same-named remote on `origin`. Uses
 * `git push -u origin HEAD` so the action works even when the local branch name
 * differs from the configured upstream. `remoteBranch` overrides the published
 * ref (`git push -u origin HEAD:refs/heads/<remoteBranch>`) — how a detached
 * integration worktree lands its merge result onto `origin/<base>`.
 */
export const pushGitBranch = async (payload: {
  path: string;
  remoteBranch?: string;
  sourceRef?: string;
}): Promise<GitPushResult> => {
  const { path: dirPath, remoteBranch, sourceRef = 'HEAD' } = payload;
  if (remoteBranch && isInvalidBranchRef(remoteBranch)) {
    return { error: `Invalid remote branch name: ${remoteBranch}`, success: false };
  }
  if (
    !sourceRef.trim() ||
    sourceRef.startsWith('-') ||
    (sourceRef !== 'HEAD' && !/^[\da-f]{40,64}$/i.test(sourceRef))
  ) {
    return { error: `Invalid source ref: ${sourceRef}`, success: false };
  }
  const refspec = remoteBranch ? `${sourceRef}:refs/heads/${remoteBranch}` : sourceRef;
  try {
    const { stderr } = await execFileAsync('git', ['push', '-u', 'origin', refspec], {
      cwd: dirPath,
      timeout: 60_000,
    });
    // git push writes progress/status to stderr even on success
    const noop = /Everything up-to-date/i.test(stderr);
    return { noop, pushedSourceRef: sourceRef, success: true };
  } catch (error: any) {
    const stderr: string = (error?.stderr ?? error?.message ?? '').toString().trim();
    log.debug('[pushGitBranch] failed', { stderr });
    return { error: stderr || 'git push failed', success: false };
  }
};

const readUnmergedPaths = async (dirPath: string): Promise<string[]> => {
  const { stdout } = await execFileAsync('git', ['diff', '--name-only', '--diff-filter=U', '-z'], {
    cwd: dirPath,
    timeout: 10_000,
  });
  return stdout.split('\0').filter(Boolean);
};

const hasMergeInProgress = async (dirPath: string): Promise<boolean> => {
  try {
    await execFileAsync('git', ['rev-parse', '--verify', '--quiet', 'MERGE_HEAD'], {
      cwd: dirPath,
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
};

const readHeadSha = async (dirPath: string): Promise<string | undefined> => {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: dirPath,
      timeout: 5000,
    });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
};

const readRevisionSha = async (dirPath: string, revision: string): Promise<string | undefined> => {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', revision], {
      cwd: dirPath,
      timeout: 5000,
    });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
};

/**
 * Merge `branch` into the current HEAD of the given working directory
 * (`git merge --no-ff --no-edit`). Designed for a detached, system-owned
 * integration worktree: `baseRef` re-baselines it first (`git reset --hard`)
 * so repeated merges start from the latest base. A conflict leaves the merge
 * in progress and reports the unmerged paths — the caller hands resolution to
 * an engineer run rather than aborting. An already-running merge is reported
 * as 'in-progress' and never touched.
 */
export const mergeGitBranch = async (payload: {
  baseRef?: string;
  branch: string;
  path: string;
}): Promise<GitMergeResult> => {
  const { path: dirPath, branch, baseRef } = payload;
  if (!dirPath?.trim())
    return { error: 'Working directory is required', state: 'conflict', success: false };
  if (!branch?.trim())
    return { error: 'Branch name is required', state: 'conflict', success: false };
  if (isInvalidBranchRef(branch)) {
    return { error: `Invalid branch name: ${branch}`, state: 'conflict', success: false };
  }
  if (baseRef && isInvalidBranchRef(baseRef)) {
    return { error: `Invalid base ref: ${baseRef}`, state: 'conflict', success: false };
  }

  try {
    if (await hasMergeInProgress(dirPath)) {
      return {
        conflicts: await readUnmergedPaths(dirPath),
        headSha: await readRevisionSha(dirPath, 'MERGE_HEAD'),
        state: 'in-progress',
        success: false,
      };
    }

    const headSha = await readRevisionSha(dirPath, branch);
    if (!headSha) {
      return {
        error: `Could not resolve task branch ${branch}`,
        state: 'conflict',
        success: false,
      };
    }

    if (baseRef) {
      await execFileAsync('git', ['reset', '--hard', baseRef], {
        cwd: dirPath,
        timeout: 30_000,
      });
    }

    try {
      await execFileAsync('git', ['merge', '--no-ff', '--no-edit', branch], {
        cwd: dirPath,
        timeout: 120_000,
      });
      return { headSha, sha: await readHeadSha(dirPath), state: 'merged', success: true };
    } catch (error: any) {
      const stderr: string = (error?.stderr ?? error?.message ?? '').toString().trim();
      if (await hasMergeInProgress(dirPath)) {
        return {
          conflicts: await readUnmergedPaths(dirPath),
          error: stderr || undefined,
          headSha,
          state: 'conflict',
          success: false,
        };
      }
      log.debug('[mergeGitBranch] failed', { branch, stderr });
      return { error: stderr || 'git merge failed', headSha, state: 'conflict', success: false };
    }
  } catch (error: any) {
    const stderr: string = (error?.stderr ?? error?.message ?? '').toString().trim();
    log.debug('[mergeGitBranch] failed', { branch, stderr });
    return { error: stderr || 'git merge failed', state: 'conflict', success: false };
  }
};

/**
 * Check / land a merge in progress inside the integration worktree after a
 * corrective run returned. MERGE_HEAD absent means the engineer already
 * committed the merge — report HEAD. Unmerged paths still present report as
 * 'conflict'. All-resolved-but-uncommitted lands via `git commit --no-edit`.
 */
export const finalizeGitMerge = async (payload: {
  expectedHead?: string;
  path: string;
}): Promise<GitFinalizeMergeResult> => {
  const { expectedHead, path: dirPath } = payload;
  if (!dirPath?.trim())
    return { error: 'Working directory is required', state: 'conflict', success: false };

  try {
    const verifyExpectedHead = async (): Promise<GitFinalizeMergeResult | undefined> => {
      if (!expectedHead) return undefined;
      try {
        await execFileAsync('git', ['merge-base', '--is-ancestor', expectedHead, 'HEAD'], {
          cwd: dirPath,
          timeout: 10_000,
        });
        return undefined;
      } catch {
        return {
          error: `Integration candidate does not contain expected task head ${expectedHead}`,
          state: 'conflict',
          success: false,
        };
      }
    };

    if (!(await hasMergeInProgress(dirPath))) {
      const invalid = await verifyExpectedHead();
      if (invalid) return invalid;
      return {
        sha: await readHeadSha(dirPath),
        state: 'integrated',
        success: true,
        validatedExpectedHead: !!expectedHead,
      };
    }

    const conflicts = await readUnmergedPaths(dirPath);
    if (conflicts.length > 0) return { conflicts, state: 'conflict', success: false };

    if (expectedHead) {
      const mergeHead = await readRevisionSha(dirPath, 'MERGE_HEAD');
      if (mergeHead !== expectedHead) {
        return {
          error: `Merge in progress contains ${mergeHead ?? 'an unknown source'}, not expected task head ${expectedHead}`,
          state: 'conflict',
          success: false,
        };
      }
    }

    await execFileAsync('git', ['commit', '--no-edit'], { cwd: dirPath, timeout: 30_000 });
    const invalid = await verifyExpectedHead();
    if (invalid) return invalid;
    return {
      sha: await readHeadSha(dirPath),
      state: 'integrated',
      success: true,
      validatedExpectedHead: !!expectedHead,
    };
  } catch (error: any) {
    const stderr: string = (error?.stderr ?? error?.message ?? '').toString().trim();
    log.debug('[finalizeGitMerge] failed', { stderr });
    return { error: stderr || 'git merge finalize failed', state: 'conflict', success: false };
  }
};

/**
 * Revert a single working-tree change. Mirrors "Discard changes" in GitHub
 * Desktop / VSCode SCM: restore the file to its HEAD state, dropping any
 * unstaged / staged edits — and physically delete the file when it doesn't
 * exist at HEAD (untracked or staged-add).
 *
 * Branch logic by HEAD presence:
 *  - present at HEAD  → `git checkout HEAD -- <file>`
 *  - absent at HEAD   → `git rm --cached` (unstage if staged-A) + `fs.rm`
 *
 * filePath is the repo-relative path from `git status`. Absolute paths and `..`
 * traversal are rejected so a tampered payload can't poke outside the repo.
 */
export const revertGitFile = async (payload: {
  filePath: string;
  path: string;
}): Promise<GitFileRevertResult> => {
  const { path: dirPath, filePath } = payload;
  if (!filePath?.trim()) return { error: 'File path is required', success: false };
  if (path.isAbsolute(filePath) || filePath.split(/[/\\]/).includes('..')) {
    return { error: `Invalid file path: ${filePath}`, success: false };
  }

  // Probe HEAD via cat-file -e — exit 0 means the blob exists at HEAD.
  let existsAtHead: boolean;
  try {
    await execFileAsync('git', ['cat-file', '-e', `HEAD:${filePath}`], {
      cwd: dirPath,
      timeout: 5000,
    });
    existsAtHead = true;
  } catch {
    existsAtHead = false;
  }

  try {
    if (existsAtHead) {
      await execFileAsync('git', ['checkout', 'HEAD', '--', filePath], {
        cwd: dirPath,
        timeout: 15_000,
      });
    } else {
      // Unstage if the file is in the index (staged-add). `git rm --cached`
      // exits non-zero on untracked paths, which is fine — swallow it.
      try {
        await execFileAsync('git', ['rm', '--cached', '--quiet', '--', filePath], {
          cwd: dirPath,
          timeout: 5000,
        });
      } catch {
        // not staged — fall through to the disk-delete
      }
      await rm(path.resolve(dirPath, filePath), { force: true, recursive: false });
    }
    return { success: true };
  } catch (error: any) {
    const stderr: string = (error?.stderr ?? error?.message ?? '').toString().trim();
    log.debug('[revertGitFile] failed', { filePath, stderr });
    return { error: stderr || 'git revert failed', success: false };
  }
};
