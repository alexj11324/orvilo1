import type {
  DeviceListItem,
  OrviloAgentAgencyConfig,
  OrviloAgentConfig,
  ProviderBinding,
} from '@orvilo/types';

import { agentReadiness } from '@/features/Home/AgentSelect/agentReadiness';

export const agentSettingsRowState = ({
  profile,
  loading,
  error,
  agencyConfig,
  devices,
  bindings,
  desktop,
  workspaceScoped,
}: {
  agencyConfig?: OrviloAgentAgencyConfig;
  bindings: ProviderBinding[];
  desktop: boolean;
  devices: DeviceListItem[];
  error?: unknown;
  loading: boolean;
  profile: Pick<OrviloAgentConfig, 'agencyConfig'> | null | undefined;
  workspaceScoped: boolean;
}) => {
  const provider = profile?.agencyConfig?.heterogeneousProvider;
  if (error) return { provider, state: 'error' as const };
  if (loading || profile === undefined) return { provider, state: 'loading' as const };
  if (profile === null) return { provider, state: 'unavailable' as const };
  const readiness = agentReadiness(agencyConfig, devices, bindings, desktop, workspaceScoped);
  return {
    provider,
    state:
      readiness === 'ready'
        ? ('configured' as const)
        : readiness === 'offline'
          ? ('offline' as const)
          : ('needsConfiguration' as const),
  };
};
