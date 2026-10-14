import { automationReadinessResultSchema } from '@orvilo/heterogeneous-agents/automationReadiness';
import type { HeterogeneousProviderConfig } from '@orvilo/types';

import { deviceGateway } from '@/server/services/deviceGateway';

/** Caller must authorize Agent Use and supply the saved Agent/device configuration. */
export const observeNativeAutomationReadiness = async (input: {
  cwd?: string;
  deviceId: string;
  deviceOwnerId: string;
  provider: HeterogeneousProviderConfig;
}) => {
  const { cwd, deviceId, deviceOwnerId, provider } = input;
  const response = await deviceGateway.executeToolCall(
    { deviceId, userId: deviceOwnerId },
    {
      apiName: 'checkAutomationReadiness',
      identifier: 'local',
      arguments: JSON.stringify({
        agentType: provider.type,
        args: provider.args,
        command: provider.command,
        cwd,
        env: provider.env,
        model: provider.model,
        requiredTools: [],
      }),
    },
    10_000,
  );
  if (!response.success) return;
  try {
    const parsed = automationReadinessResultSchema.safeParse(JSON.parse(response.content));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return;
  }
};
