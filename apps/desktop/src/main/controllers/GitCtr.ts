import type {
  GetGitBranchDiffPayload,
  GitAddWorktreeResult,
  GitAheadBehind,
  GitBranchDiffPatches,
  GitBranchInfo,
  GitBranchListItem,
  GitCheckoutResult,
  GitDeleteBranchResult,
  GitFileRevertResult,
  GitFinalizeMergeResult,
  GitLinkedPullRequestResult,
  GitMergeResult,
  GitPullResult,
  GitPushResult,
  GitRemoteBranchListItem,
  GitRemoteRefProbe,
  GitRemoveWorktreeResult,
  GitRenameBranchResult,
  GitWorkingTreeFiles,
  GitWorkingTreePatches,
  GitWorkingTreeStatus,
  GitWorktreeListItem,
  GitWorktreePathInspection,
} from '@orvilo/electron-client-ipc';
import type { DeviceGitInfo } from '@orvilo/local-file-shell/git';

import { ControllerModule, IpcMethod } from './index';

const loadGit = () => import('@orvilo/local-file-shell/git');

/**
 * GitController
 *
 * Thin IPC layer over `@orvilo/local-file-shell`'s git operations. Every
 * method delegates to the shared implementation so the local desktop IPC path,
 * the device-control RPC dispatch, and the CLI all run identical git logic.
 */
export default class GitController extends ControllerModule {
  static override readonly groupName = 'git';

  @IpcMethod()
  async detectRepoType(dirPath: string): Promise<'git' | 'github' | undefined> {
    const { detectRepoType } = await loadGit();
    return detectRepoType(dirPath);
  }

  @IpcMethod()
  async getGitBranch(dirPath: string): Promise<GitBranchInfo> {
    const { getGitBranch: computeGitBranch } = await loadGit();
    return computeGitBranch(dirPath);
  }

  @IpcMethod()
  async gitInfo(params: { isGithub?: boolean; scope: string }): Promise<DeviceGitInfo> {
    const { gitInfo: computeGitInfo } = await loadGit();
    return computeGitInfo(params);
  }

  @IpcMethod()
  async getLinkedPullRequest(payload: {
    branch: string;
    path: string;
    pullRequestNumber?: number;
  }): Promise<GitLinkedPullRequestResult> {
    const { getLinkedPullRequest: computeLinkedPullRequest } = await loadGit();
    return computeLinkedPullRequest(payload);
  }

  @IpcMethod()
  async listGitBranches(dirPath: string): Promise<GitBranchListItem[]> {
    const { listGitBranches: computeListGitBranches } = await loadGit();
    return computeListGitBranches(dirPath);
  }

  @IpcMethod()
  async listGitRemoteBranches(dirPath: string): Promise<GitRemoteBranchListItem[]> {
    const { listGitRemoteBranches: computeListGitRemoteBranches } = await loadGit();
    return computeListGitRemoteBranches(dirPath);
  }

  @IpcMethod()
  async listGitWorktrees(dirPath: string): Promise<GitWorktreeListItem[]> {
    const { listGitWorktrees: computeListGitWorktrees } = await loadGit();
    return computeListGitWorktrees(dirPath);
  }

  @IpcMethod()
  async getGitWorkingTreeStatus(dirPath: string): Promise<GitWorkingTreeStatus> {
    const { getGitWorkingTreeStatus: computeGitWorkingTreeStatus } = await loadGit();
    return computeGitWorkingTreeStatus(dirPath);
  }

  @IpcMethod()
  async getGitWorkingTreeFiles(dirPath: string): Promise<GitWorkingTreeFiles> {
    const { getGitWorkingTreeFiles: computeGitWorkingTreeFiles } = await loadGit();
    return computeGitWorkingTreeFiles(dirPath);
  }

  @IpcMethod()
  async getGitWorkingTreePatches(dirPath: string): Promise<GitWorkingTreePatches> {
    const { getGitWorkingTreePatches: computeGitWorkingTreePatches } = await loadGit();
    return computeGitWorkingTreePatches(dirPath);
  }

  @IpcMethod()
  async getGitBranchDiff(payload: GetGitBranchDiffPayload): Promise<GitBranchDiffPatches> {
    const { getGitBranchDiff: runGitBranchDiff } = await loadGit();
    return runGitBranchDiff(payload);
  }

  @IpcMethod()
  async getGitAheadBehind(dirPath: string): Promise<GitAheadBehind> {
    const { getGitAheadBehind: computeGitAheadBehind } = await loadGit();
    return computeGitAheadBehind(dirPath);
  }

  @IpcMethod()
  async checkoutGitBranch(payload: {
    branch: string;
    create?: boolean;
    path: string;
  }): Promise<GitCheckoutResult> {
    const { checkoutGitBranch: runCheckoutGitBranch } = await loadGit();
    return runCheckoutGitBranch(payload);
  }

  @IpcMethod()
  async renameGitBranch(payload: {
    from: string;
    path: string;
    to: string;
  }): Promise<GitRenameBranchResult> {
    const { renameGitBranch: runRenameGitBranch } = await loadGit();
    return runRenameGitBranch(payload);
  }

  @IpcMethod()
  async deleteGitBranch(payload: { branch: string; path: string }): Promise<GitDeleteBranchResult> {
    const { deleteGitBranch: runDeleteGitBranch } = await loadGit();
    return runDeleteGitBranch(payload);
  }

  @IpcMethod()
  async removeGitWorktree(payload: {
    path: string;
    worktreePath: string;
  }): Promise<GitRemoveWorktreeResult> {
    const { removeGitWorktree: runRemoveGitWorktree } = await loadGit();
    return runRemoveGitWorktree(payload);
  }

  @IpcMethod()
  async inspectGitWorktreePath(payload: {
    path: string;
    worktreePath: string;
  }): Promise<GitWorktreePathInspection> {
    const { inspectGitWorktreePath: runInspectGitWorktreePath } = await loadGit();
    return runInspectGitWorktreePath(payload);
  }

  @IpcMethod()
  async addGitWorktree(payload: {
    branch: string;
    detach?: boolean;
    path: string;
    ref?: string;
    worktreePath: string;
  }): Promise<GitAddWorktreeResult> {
    const { addGitWorktree: runAddGitWorktree } = await loadGit();
    return runAddGitWorktree(payload);
  }

  @IpcMethod()
  async mergeGitBranch(payload: {
    baseRef?: string;
    branch: string;
    fetchBase?: boolean;
    path: string;
  }): Promise<GitMergeResult> {
    const { mergeGitBranch: runMergeGitBranch } = await loadGit();
    return runMergeGitBranch(payload);
  }

  @IpcMethod()
  async finalizeGitMerge(payload: {
    expectedHead?: string;
    path: string;
  }): Promise<GitFinalizeMergeResult> {
    const { finalizeGitMerge: runFinalizeGitMerge } = await loadGit();
    return runFinalizeGitMerge(payload);
  }

  @IpcMethod()
  async pullGitBranch(payload: { path: string }): Promise<GitPullResult> {
    const { pullGitBranch: runPullGitBranch } = await loadGit();
    return runPullGitBranch(payload);
  }

  @IpcMethod()
  async pushGitBranch(payload: {
    expectedRemoteSha?: string;
    expectedSha?: string;
    fence?: { operationId: string; ref: string; seq: number };
    path: string;
    remoteBranch?: string;
    sourceRef?: string;
  }): Promise<GitPushResult> {
    const { pushGitBranch: runPushGitBranch } = await loadGit();
    return runPushGitBranch(payload);
  }

  @IpcMethod()
  async probeGitRemoteRef(payload: {
    path: string;
    ref: string;
    remote?: string;
  }): Promise<GitRemoteRefProbe> {
    const { probeGitRemoteRef: runProbeGitRemoteRef } = await loadGit();
    return runProbeGitRemoteRef(payload);
  }

  @IpcMethod()
  async revertGitFile(payload: { filePath: string; path: string }): Promise<GitFileRevertResult> {
    const { revertGitFile: runRevertGitFile } = await loadGit();
    return runRevertGitFile(payload);
  }
}
