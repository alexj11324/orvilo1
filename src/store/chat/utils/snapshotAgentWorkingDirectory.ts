import {
  type ExecGroupAgentParams,
  getWorkingDirEffectivePath,
  resolveAgentAgencyConfig,
} from '@orvilo/types';

import { getRuntimeCanManageAgent } from '@/helpers/agentManagementAccess';
import {
  resolveAgentWorkingDirectoryConfig,
  resolveTargetDeviceId,
} from '@/helpers/agentWorkingDirectory';
import { resolveWorkspaceScoped } from '@/helpers/executionTarget';
import { getAgentStoreState } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';
import { deviceSelectors, getDeviceStoreState } from '@/store/device';
import { useElectronStore } from '@/store/electron';
import { getUserStoreState } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

/** Snapshot a selected directory before a group control or first send creates its topic. */
export const snapshotAgentWorkingDirectory = (
  agentId?: string,
): ExecGroupAgentParams['initialTopicMetadata'] => {
  if (!agentId) return;
  const agentState = getAgentStoreState();
  const agent = agentState.agentMap[agentId];
  const userState = getUserStoreState();
  const canManage = getRuntimeCanManageAgent({
    agentId,
    agentUserId: agent?.userId,
    currentUserId: userProfileSelectors.userId(userState),
  });
  const override =
    agent?.workspaceId && userState.workspaceUserPreferenceWorkspaceId === agent.workspaceId
      ? userState.workspaceUserPreference.agentDeviceOverrides?.[agentId]
      : undefined;
  const agencyConfig = resolveAgentAgencyConfig(
    agentByIdSelectors.getAgencyConfigById(agentId)(agentState),
    override,
    {
      canManage,
      visibility: agent?.visibility,
      workspaceId: agent?.workspaceId,
    },
  );
  const workspaceScoped = resolveWorkspaceScoped(
    !!agent?.workspaceId && agent.visibility !== 'private' && !canManage,
    override,
  );
  const currentDeviceId = useElectronStore.getState().gatewayDeviceInfo?.deviceId;
  const deviceId = resolveTargetDeviceId(agencyConfig, currentDeviceId, { workspaceScoped });
  const config = resolveAgentWorkingDirectoryConfig({
    agencyConfig,
    currentDeviceId,
    workspaceScoped,
    deviceDefaultCwd: deviceSelectors.getDeviceDefaultCwd(deviceId)(getDeviceStoreState()),
    legacyAgentWorkingDirectory: agentState.localAgentWorkingDirectoryMap[agentId],
  });
  const workingDirectory = getWorkingDirEffectivePath(config);
  return workingDirectory ? { workingDirectory, workingDirectoryConfig: config } : undefined;
};
