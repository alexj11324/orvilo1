import { type ExecGroupAgentParams, getWorkingDirEffectivePath } from '@orvilo/types';

import {
  resolveAgentWorkingDirectoryConfig,
  resolveTargetDeviceId,
} from '@/helpers/agentWorkingDirectory';
import { getAgentStoreState } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';
import { deviceSelectors, getDeviceStoreState } from '@/store/device';
import { useElectronStore } from '@/store/electron';

/** Snapshot a selected directory before a group control or first send creates its topic. */
export const snapshotAgentWorkingDirectory = (
  agentId?: string,
): ExecGroupAgentParams['initialTopicMetadata'] => {
  if (!agentId) return;
  const agentState = getAgentStoreState();
  const agent = agentState.agentMap[agentId];
  const agencyConfig = agentByIdSelectors.getAgencyConfigById(agentId)(agentState);
  const workspaceScoped = !!agent?.workspaceId;
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
