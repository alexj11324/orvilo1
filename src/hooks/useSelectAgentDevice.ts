import type { DeviceExecutionTarget } from '@orvilo/types';
import { useCallback } from 'react';

import { useAgentStore } from '@/store/agent';

/** Device changes are saved on the Agent, through the server management gate. */
export const useSelectAgentDevice = (agentId: string) => {
  const update = useAgentStore((s) => s.updateAgentConfigById);
  return useCallback(
    async (selection: { boundDeviceId?: string; executionTarget: DeviceExecutionTarget }) => {
      if (agentId) await update(agentId, { agencyConfig: selection }, { rethrow: true });
    },
    [agentId, update],
  );
};
