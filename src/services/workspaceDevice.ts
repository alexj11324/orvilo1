import type { lambdaClient } from '@/libs/trpc/client';
import { createWorkspaceLambdaClient } from '@/libs/trpc/client';

/** Explicit workspace is mandatory: these actions also run from personal settings. */
class WorkspaceDeviceService {
  share = (
    workspaceId: string,
    input: Parameters<typeof lambdaClient.device.shareDeviceToWorkspace.mutate>[0],
  ) => createWorkspaceLambdaClient(workspaceId).device.shareDeviceToWorkspace.mutate(input);

  remove = (
    workspaceId: string,
    input: Parameters<typeof lambdaClient.device.removeWorkspaceDevice.mutate>[0],
  ) => createWorkspaceLambdaClient(workspaceId).device.removeWorkspaceDevice.mutate(input);
}

export const workspaceDeviceService = new WorkspaceDeviceService();
