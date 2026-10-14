import { TRPCError } from '@trpc/server';

import type { DeviceModel } from '@/database/models/device';
import { deviceGateway, isPathWithinRoot } from '@/server/services/deviceGateway';

/**
 * Validate that a client-supplied workspace root is actually one the user has
 * bound to this device.
 *
 * The file routes (move / rename / write / preview) receive `workingDirectory`
 * from the same untrusted browser session that supplies the file paths. The
 * gateway's `assertPathsWithinWorkspace` only proves the paths sit *inside that
 * directory* — it never proves the directory itself is legitimate. So a caller
 * could set `workingDirectory` to `/` (or `C:\`), pass that containment check
 * trivially, and reach any path on the device.
 *
 * To close that hole we re-derive the approved roots from the *server-owned*
 * device row — the `workingDirs` recent list and `defaultCwd`, both written only
 * via `device.updateDevice` / the run path, never trusted from this request —
 * and require the requested root to equal or nest inside one of them before any
 * RPC is forwarded. The picker upserts every chosen directory into `workingDirs`
 * (see `useCommitWorkingDirectory`) and run start upserts the bound cwd, so a
 * legitimately-selected workspace is always present here.
 */
export const assertWorkspaceRootApproved = async (
  deviceModel: DeviceModel,
  deviceId: string,
  workingDirectory: string,
  workspaceId?: string,
): Promise<void> => {
  if (!workingDirectory) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'A workspace root is required for file operations',
    });
  }

  const device = workspaceId
    ? await deviceModel.findExecutionDeviceById(deviceId)
    : await deviceModel.findByDeviceId(deviceId);

  const approvedRoots = [
    ...(device?.workingDirs ?? []).map((dir) => dir.path),
    ...(device?.defaultCwd ? [device.defaultCwd] : []),
  ].filter((root): root is string => Boolean(root));

  const approved = approvedRoots.some((root) => isPathWithinRoot(root, workingDirectory));

  if (!approved) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Working directory is not an approved workspace for this device',
    });
  }
};

/** Agent use grants access to its registered host; unrelated devices remain inaccessible. */
export const assertExecutionDeviceAccessible = async (
  deviceModel: DeviceModel,
  deviceId: string,
): Promise<void> => {
  const device = await deviceModel.findExecutionDeviceById(deviceId);
  if (!device) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Agent execution device not found.' });
  }
};

/** Repository-wide Git operations require approval of the native effective root. */
export const assertWorkspaceGitRootApproved = async (
  deviceModel: DeviceModel,
  params: { deviceId: string; path: string; userId: string; workspaceId?: string },
): Promise<void> => {
  const inspection = await deviceGateway.inspectGitWorktreePath({
    ...params,
    worktreePath: params.path,
  });
  if (!inspection?.repoRoot) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'The device could not verify the effective Git repository root.',
    });
  }
  await assertWorkspaceRootApproved(
    deviceModel,
    params.deviceId,
    inspection.repoRoot,
    params.workspaceId,
  );
};
