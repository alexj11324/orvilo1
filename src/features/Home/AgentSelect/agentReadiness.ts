import type { DeviceListItem, OrviloAgentAgencyConfig, ProviderBinding } from '@orvilo/types';

import { isBuiltinAgentUsable } from '@/features/AgentOnboarding/availability';
import { resolveExecutionTarget } from '@/helpers/executionTarget';

export const agentReadiness = (
  config: OrviloAgentAgencyConfig | undefined,
  devices: DeviceListItem[],
  bindings: ProviderBinding[],
  desktop: boolean,
  workspaceScoped = false,
) => {
  const provider = config?.heterogeneousProvider;
  const target = resolveExecutionTarget(config, {
    clientExecutionAvailable: desktop,
    deviceRoutingAvailable: true,
    isHetero: true,
    workspaceScoped,
  });
  if (!provider || target === 'none') return 'configure' as const;
  if (
    provider.authMode === 'api' &&
    provider.apiConfig?.source !== 'server-default' &&
    (!provider.apiConfig?.providerId || !provider.apiConfig.model?.trim())
  )
    return 'provider' as const;
  if (target === 'device') {
    if (!config?.boundDeviceId) return 'configure' as const;
    const device = devices.find((item) => item.deviceId === config.boundDeviceId);
    if (!device) return 'configure' as const;
    if (!device.online) return 'offline' as const;
  }
  if (
    provider.type === 'orvilo' &&
    !isBuiltinAgentUsable(
      bindings.filter((binding) => !provider.model || binding.model === provider.model),
    )
  )
    return 'provider' as const;
  return 'ready' as const;
};
