import { moveLocalFiles, renameLocalFile, writeLocalFile } from '@orvilo/local-file-shell/file';
import {
  addGitWorktree,
  checkoutGitBranch,
  deleteGitBranch,
  finalizeGitMerge,
  getGitAheadBehind,
  getGitBranch,
  getGitBranchDiff,
  getGitWorkingTreeFiles,
  getGitWorkingTreePatches,
  getGitWorkingTreeStatus,
  getLinkedPullRequest,
  inspectGitWorktreePath,
  listGitBranches,
  listGitRemoteBranches,
  listGitWorktrees,
  mergeGitBranch,
  probeGitRemoteRef,
  pullGitBranch,
  pushGitBranch,
  registerWorktreeClaim,
  removeGitWorktree,
  removeGitWorktreeVerified,
  renameGitBranch,
  revertGitFile,
} from '@orvilo/local-file-shell/git';

import { getClaudeCodeQuota, type GetClaudeCodeQuotaParams } from './claudeCodeQuota';
import { defaultCopyAssetForPublish, defaultReadExternalAssetForPublish } from './filePreview';
import { defaultListProjectDirectory } from './projectFileIndex';
import { prepareSkillDirectory } from './skillDirectory';
import type {
  BrowseDirectoryParams,
  CopyAssetForPublishParams,
  DeviceControlDeps,
  EnrollWorkspaceParams,
  ExternalAssetForPublishParams,
  InitWorkspaceParams,
  ListHeterogeneousAgentModelsParams,
  ListProjectSkillsParams,
  LocalFilePreviewUrlParams,
  PrepareSkillDirectoryParams,
  ProjectDirectoryListParams,
  ProjectFileIndexParams,
  ProjectFileSearchParams,
  UnenrollWorkspaceParams,
} from './types';
import { browseDirectory, initWorkspace, listProjectSkills, statPath } from './workspace';

/**
 * Every method name the device-control RPC dispatcher understands. Mirrors the
 * gateway's server-internal RPC surface — the gateway routes any `rpc_request`
 * by `method` here, so adding a device capability means one entry below plus its
 * handler, with no per-method gateway route.
 */
export const DEVICE_RPC_METHODS = [
  'enrollWorkspace',
  'unenrollWorkspace',
  'initWorkspace',
  'listHeterogeneousAgentModels',
  'getClaudeCodeQuota',
  'listProjectSkills',
  'prepareSkillDirectory',
  'browseDirectory',
  'statPath',
  'getProjectFileIndex',
  'listProjectDirectory',
  'searchProjectFiles',
  'getLocalFilePreview',
  'readExternalAssetForPublish',
  'copyAssetForPublish',
  'moveLocalFiles',
  'renameLocalFile',
  'writeLocalFile',
  'getGitBranch',
  'getLinkedPullRequest',
  'getGitWorkingTreeStatus',
  'getGitWorkingTreeFiles',
  'getGitWorkingTreePatches',
  'getGitBranchDiff',
  'getGitAheadBehind',
  'listGitBranches',
  'listGitRemoteBranches',
  'listGitWorktrees',
  'inspectGitWorktreePath',
  'checkoutGitBranch',
  'renameGitBranch',
  'deleteGitBranch',
  'removeGitWorktree',
  'addGitWorktree',
  'mergeGitBranch',
  'finalizeGitMerge',
  'pullGitBranch',
  'probeGitRemoteRef',
  'pushGitBranch',
  'revertGitFile',
] as const;

export type DeviceRpcMethod = (typeof DEVICE_RPC_METHODS)[number];

/**
 * Dispatch a generic server-internal device RPC by method name. This is the
 * single device-control entry point shared by the desktop main process
 * (`GatewayConnectionCtr`) and the CLI daemon (`lh connect`); both hand it the
 * raw `(method, params)` off the gateway WebSocket and inject their own
 * platform-specific `deps`.
 *
 * Git and workspace-scan methods run identical shared logic on every host; only
 * `getProjectFileIndex` / `getLocalFilePreview` (and the workspace-scan preview
 * approval) vary per host and come from `deps`.
 */
export const executeDeviceRpc = async (
  method: string,
  params: unknown,
  deps: DeviceControlDeps,
): Promise<unknown> => {
  switch (method) {
    // Remote workspace share: the host owns the gateway connections, so both
    // handlers are host-injected. A host that can't manage a second connection
    // rejects with a stable reason the server surfaces to the user.
    case 'enrollWorkspace': {
      if (!deps.enrollWorkspace)
        throw new Error('This device client does not support workspace sharing');
      return deps.enrollWorkspace(params as EnrollWorkspaceParams);
    }

    case 'unenrollWorkspace': {
      if (!deps.unenrollWorkspace)
        throw new Error('This device client does not support workspace sharing');
      return deps.unenrollWorkspace(params as UnenrollWorkspaceParams);
    }

    case 'initWorkspace': {
      return initWorkspace(params as InitWorkspaceParams, deps);
    }

    case 'listHeterogeneousAgentModels': {
      if (!deps.listHeterogeneousAgentModels) {
        throw new Error('This device client does not support heterogeneous agent model discovery');
      }
      return deps.listHeterogeneousAgentModels(params as ListHeterogeneousAgentModelsParams);
    }

    case 'getClaudeCodeQuota': {
      return getClaudeCodeQuota(params as GetClaudeCodeQuotaParams);
    }

    case 'listProjectSkills': {
      return listProjectSkills(params as ListProjectSkillsParams, deps);
    }

    case 'prepareSkillDirectory': {
      return prepareSkillDirectory(params as PrepareSkillDirectoryParams, deps);
    }

    case 'browseDirectory': {
      return browseDirectory(params as BrowseDirectoryParams);
    }

    case 'statPath': {
      return statPath(params as { path: string });
    }

    case 'getProjectFileIndex': {
      return deps.getProjectFileIndex(params as ProjectFileIndexParams);
    }

    case 'listProjectDirectory': {
      return defaultListProjectDirectory(params as ProjectDirectoryListParams);
    }

    case 'searchProjectFiles': {
      return deps.searchProjectFiles(params as ProjectFileSearchParams);
    }

    case 'getLocalFilePreview': {
      return deps.getLocalFilePreview(params as LocalFilePreviewUrlParams);
    }

    case 'readExternalAssetForPublish': {
      return (deps.readExternalAssetForPublish ?? defaultReadExternalAssetForPublish)(
        params as ExternalAssetForPublishParams,
      );
    }

    case 'copyAssetForPublish': {
      return (deps.copyAssetForPublish ?? defaultCopyAssetForPublish)(
        params as CopyAssetForPublishParams,
      );
    }

    case 'moveLocalFiles': {
      return moveLocalFiles(params as { items: { newPath: string; oldPath: string }[] });
    }

    case 'renameLocalFile': {
      return renameLocalFile(params as { newName: string; path: string });
    }

    case 'writeLocalFile': {
      return writeLocalFile(params as { content: string; path: string });
    }

    case 'getGitBranch': {
      return getGitBranch((params as { path: string }).path);
    }

    case 'getLinkedPullRequest': {
      return getLinkedPullRequest(
        params as { branch: string; path: string; pullRequestNumber?: number },
      );
    }

    case 'getGitWorkingTreeStatus': {
      return getGitWorkingTreeStatus((params as { path: string }).path);
    }

    case 'getGitWorkingTreeFiles': {
      return getGitWorkingTreeFiles((params as { path: string }).path);
    }

    case 'getGitWorkingTreePatches': {
      return getGitWorkingTreePatches((params as { path: string }).path);
    }

    case 'getGitBranchDiff': {
      return getGitBranchDiff(params as { baseRef?: string; path: string });
    }

    case 'getGitAheadBehind': {
      return getGitAheadBehind((params as { path: string }).path);
    }

    case 'listGitBranches': {
      return listGitBranches((params as { path: string }).path);
    }

    case 'listGitRemoteBranches': {
      return listGitRemoteBranches((params as { path: string }).path);
    }

    case 'listGitWorktrees': {
      return listGitWorktrees((params as { path: string }).path);
    }

    case 'inspectGitWorktreePath': {
      const payload = params as { path: string; worktreePath: string };
      const inspection = await inspectGitWorktreePath(payload);
      // Writer presence is the host's signal: when the host exposes a run
      // registry the dep answers which run owns the path; without one the
      // field stays undefined — "cannot prove safe", never "free".
      if (deps.getActiveWorktreeWriter) {
        inspection.activeWriter = await deps.getActiveWorktreeWriter(payload.worktreePath);
      }
      return inspection;
    }

    case 'checkoutGitBranch': {
      return checkoutGitBranch(params as { branch: string; create?: boolean; path: string });
    }

    case 'renameGitBranch': {
      return renameGitBranch(params as { from: string; path: string; to: string });
    }

    case 'deleteGitBranch': {
      return deleteGitBranch(params as { branch: string; path: string });
    }

    case 'removeGitWorktree': {
      const payload = params as {
        claimToken?: string;
        force?: boolean;
        path: string;
        worktreePath: string;
      };
      // A cleanup presenting a claim token must prove it against the claim
      // this host registered for that physical checkout — inside the registry
      // mutation section, together with the writer check, before any delete.
      // `claimTokenVerified` on the result is only ever set after that real
      // compare; a host that cannot answer (no run registry, no claims
      // registry, no registered claim) refuses instead of deleting blind.
      if (payload.claimToken !== undefined) {
        return removeGitWorktreeVerified({
          claimToken: payload.claimToken,
          force: payload.force,
          getActiveWriter: deps.getActiveWorktreeWriter,
          path: payload.path,
          worktreePath: payload.worktreePath,
        });
      }
      return removeGitWorktree(payload);
    }

    case 'addGitWorktree': {
      const payload = params as {
        branch: string;
        claimToken?: string;
        detach?: boolean;
        path: string;
        ref?: string;
        worktreePath: string;
      };
      const result = await addGitWorktree(payload);
      if (!result.success || payload.claimToken === undefined) return result;
      // Bind the server-issued claim token to the physical checkout on this
      // host — the delete path later verifies against this registration. The
      // `claimRegistered` flag in the result is the capability signal callers
      // use to distinguish "host can verify claims" from "host silently
      // dropped the token"; a failed registration rolls the worktree back.
      const registered = await registerWorktreeClaim({
        claimToken: payload.claimToken,
        path: payload.path,
        worktreePath: payload.worktreePath,
      });
      if (!registered.success) {
        await removeGitWorktree({
          force: true,
          path: payload.path,
          worktreePath: payload.worktreePath,
        }).catch(() => undefined);
        return {
          error: `claim registration failed: ${registered.error ?? 'unknown'}`,
          success: false,
        };
      }
      return { ...result, claimRegistered: true };
    }

    case 'mergeGitBranch': {
      return mergeGitBranch(
        params as { baseRef?: string; branch: string; fetchBase?: boolean; path: string },
      );
    }

    case 'finalizeGitMerge': {
      return finalizeGitMerge(params as { expectedHead?: string; path: string });
    }

    case 'pullGitBranch': {
      return pullGitBranch(params as { path: string });
    }

    case 'probeGitRemoteRef': {
      return probeGitRemoteRef(params as { path: string; ref: string; remote?: string });
    }

    case 'pushGitBranch': {
      return pushGitBranch(
        params as {
          expectedRemoteSha?: string;
          expectedSha?: string;
          fence?: { operationId: string; ref: string; seq: number };
          path: string;
          remoteBranch?: string;
          sourceRef?: string;
        },
      );
    }

    case 'revertGitFile': {
      return revertGitFile(params as { filePath: string; path: string });
    }

    default: {
      throw new Error(`Unknown device RPC method: ${method}`);
    }
  }
};
