import { useAgentStore } from '@/store/agent';
import { getLocalAgentWorkingDirectory } from '@/store/agent/utils/localAgentWorkingDirectoryStorage';

/** Snapshot the current user's directory through the existing local-only setter. */
export const copyOrchestratorWorkingDirectory = async (
  sourceAgentId: string,
  coordinatorId: string,
) => {
  if (!sourceAgentId || !coordinatorId) return;
  const state = useAgentStore.getState();
  const workingDirectory =
    state.localAgentWorkingDirectoryMap[sourceAgentId] ??
    getLocalAgentWorkingDirectory(sourceAgentId);
  await state.updateAgentRuntimeEnvConfigById(coordinatorId, { workingDirectory });
};
