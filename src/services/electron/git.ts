import {
  type GetGitBranchDiffPayload,
  type GitAddWorktreeResult,
  type GitAheadBehind,
  type GitBranchDiffPatches,
  type GitBranchInfo,
  type GitBranchListItem,
  type GitCheckoutResult,
  type GitDeleteBranchResult,
  type GitFileRevertResult,
  type GitLinkedPullRequestResult,
  type GitPullResult,
  type GitPushResult,
  type GitRemoteBranchListItem,
  type GitRemoveWorktreeResult,
  type GitRenameBranchResult,
  type GitWorkingTreeFiles,
  type GitWorkingTreePatches,
  type GitWorkingTreeStatus,
  type GitWorktreeListItem,
} from '@orvilo/electron-client-ipc';

import { requireProvenLocalDeviceId } from '@/services/localExecutionIdentity';
import { ensureElectronIpc } from '@/utils/electron/ipc';

/**
 * Renderer-side wrapper for the `git.*` IPC group exposed by GitController.
 * Kept separate from ElectronSystemService so that git concerns don't leak
 * back into the system/windows/menu surface.
 */
class ElectronGitService {
  private get ipc() {
    return ensureElectronIpc();
  }

  async detectRepoType(dirPath: string): Promise<'git' | 'github' | undefined> {
    await requireProvenLocalDeviceId('detectRepoType');
    return this.ipc.git.detectRepoType(dirPath);
  }

  async getGitBranch(dirPath: string): Promise<GitBranchInfo> {
    await requireProvenLocalDeviceId('getGitBranch');
    return this.ipc.git.getGitBranch(dirPath);
  }

  async getLinkedPullRequest(params: {
    branch: string;
    path: string;
    pullRequestNumber?: number;
  }): Promise<GitLinkedPullRequestResult> {
    await requireProvenLocalDeviceId('getLinkedPullRequest');
    return this.ipc.git.getLinkedPullRequest(params);
  }

  async listGitBranches(dirPath: string): Promise<GitBranchListItem[]> {
    await requireProvenLocalDeviceId('listGitBranches');
    return this.ipc.git.listGitBranches(dirPath);
  }

  async listGitRemoteBranches(dirPath: string): Promise<GitRemoteBranchListItem[]> {
    await requireProvenLocalDeviceId('listGitRemoteBranches');
    return this.ipc.git.listGitRemoteBranches(dirPath);
  }

  async listGitWorktrees(dirPath: string): Promise<GitWorktreeListItem[]> {
    await requireProvenLocalDeviceId('listGitWorktrees');
    return this.ipc.git.listGitWorktrees(dirPath);
  }

  async getGitWorkingTreeStatus(dirPath: string): Promise<GitWorkingTreeStatus> {
    await requireProvenLocalDeviceId('getGitWorkingTreeStatus');
    return this.ipc.git.getGitWorkingTreeStatus(dirPath);
  }

  async getGitWorkingTreeFiles(dirPath: string): Promise<GitWorkingTreeFiles> {
    await requireProvenLocalDeviceId('getGitWorkingTreeFiles');
    return this.ipc.git.getGitWorkingTreeFiles(dirPath);
  }

  async getGitWorkingTreePatches(dirPath: string): Promise<GitWorkingTreePatches> {
    await requireProvenLocalDeviceId('getGitWorkingTreePatches');
    return this.ipc.git.getGitWorkingTreePatches(dirPath);
  }

  async getGitBranchDiff(payload: GetGitBranchDiffPayload): Promise<GitBranchDiffPatches> {
    await requireProvenLocalDeviceId('getGitBranchDiff');
    return this.ipc.git.getGitBranchDiff(payload);
  }

  async getGitAheadBehind(dirPath: string): Promise<GitAheadBehind> {
    await requireProvenLocalDeviceId('getGitAheadBehind');
    return this.ipc.git.getGitAheadBehind(dirPath);
  }

  async checkoutGitBranch(params: {
    branch: string;
    create?: boolean;
    path: string;
  }): Promise<GitCheckoutResult> {
    await requireProvenLocalDeviceId('checkoutGitBranch');
    return this.ipc.git.checkoutGitBranch(params);
  }

  async pullGitBranch(params: { path: string }): Promise<GitPullResult> {
    await requireProvenLocalDeviceId('pullGitBranch');
    return this.ipc.git.pullGitBranch(params);
  }

  async pushGitBranch(params: { path: string }): Promise<GitPushResult> {
    await requireProvenLocalDeviceId('pushGitBranch');
    return this.ipc.git.pushGitBranch(params);
  }

  async revertGitFile(params: { filePath: string; path: string }): Promise<GitFileRevertResult> {
    await requireProvenLocalDeviceId('revertGitFile');
    return this.ipc.git.revertGitFile(params);
  }

  async renameGitBranch(params: {
    from: string;
    path: string;
    to: string;
  }): Promise<GitRenameBranchResult> {
    await requireProvenLocalDeviceId('renameGitBranch');
    return this.ipc.git.renameGitBranch(params);
  }

  async deleteGitBranch(params: { branch: string; path: string }): Promise<GitDeleteBranchResult> {
    await requireProvenLocalDeviceId('deleteGitBranch');
    return this.ipc.git.deleteGitBranch(params);
  }

  async removeGitWorktree(params: {
    path: string;
    worktreePath: string;
  }): Promise<GitRemoveWorktreeResult> {
    await requireProvenLocalDeviceId('removeGitWorktree');
    return this.ipc.git.removeGitWorktree(params);
  }

  async addGitWorktree(params: {
    branch: string;
    path: string;
    worktreePath: string;
  }): Promise<GitAddWorktreeResult> {
    await requireProvenLocalDeviceId('addGitWorktree');
    return this.ipc.git.addGitWorktree(params);
  }
}

export const electronGitService = new ElectronGitService();
