import type { OrviloAgentAgencyConfig } from '@orvilo/types';
import { PROVIDER_CONFIG_ANCHOR_MODEL, resolveHeteroCliAgentType } from '@orvilo/types';

import { scanLocal } from '@/features/ConnectAgent/useAgentScan';
import { agentReadiness } from '@/features/Home/AgentSelect/agentReadiness';
import { normalizeAsyncError } from '@/libs/swr/normalizeError';
import { createWorkspaceLambdaClient } from '@/libs/trpc/client';
import { getHostContext } from '@/platform';

import type { FirstAgentHost } from './agentOnboarding';

export const resolveOnboardingAgentHost = (
  agencyConfig?: OrviloAgentAgencyConfig | null,
): FirstAgentHost => ({
  boundDeviceId: agencyConfig?.boundDeviceId,
  executionTarget:
    getHostContext().kind === 'desktop' &&
    agencyConfig?.executionTarget === 'local' &&
    agencyConfig.heterogeneousProvider?.type !== 'orvilo'
      ? 'local'
      : 'device',
});

/** Verify the selected saved runtime without transferring or rewriting its source. */
export const verifyOnboardingOrchestrator = async (agentId: string, workspaceId: string) => {
  if (!agentId) throw new Error('ORCHESTRATOR_SETUP_REQUIRED');
  const client = createWorkspaceLambdaClient(workspaceId);
  const personalClient = createWorkspaceLambdaClient(null);
  const runtime = await client.agent.getAgentRuntimeForCreation.query({
    agentId,
    purpose: 'orchestrator',
    visibility: 'public',
  });
  const config = runtime.agencyConfig;
  const provider = config?.heterogeneousProvider;
  if (!provider) throw new Error('ORCHESTRATOR_SETUP_REQUIRED');
  if (config.executionTarget === 'local') {
    if (getHostContext().kind !== 'desktop') throw new Error('FIRST_AGENT_DEVICE_REQUIRED');
    const agents = await scanLocal();
    const cliType = resolveHeteroCliAgentType(provider);
    if (!Object.entries(agents).some(([type, status]) => type === cliType && status?.available))
      throw new Error('FIRST_AGENT_RUNTIME_UNAVAILABLE');
  } else {
    const devices = await client.device.listDevices.query();
    const device = devices.find((item) => item.deviceId === config.boundDeviceId && item.online);
    if (!device) throw new Error('FIRST_AGENT_DEVICE_REQUIRED');
    if (provider.type !== 'orvilo') {
      const scanClient = device.scope === 'personal' ? personalClient : client;
      const scan = await scanClient.device.scanAgents.query({ deviceId: device.deviceId });
      const cliType = resolveHeteroCliAgentType(provider);
      if (
        scan.error ||
        !Object.entries(scan.agents).some(([type, status]) => type === cliType && status?.available)
      )
        throw new Error(scan.error ?? 'FIRST_AGENT_RUNTIME_UNAVAILABLE');
    }
  }
  if (provider.type === 'orvilo') {
    const bindings = await personalClient.providerBinding.list.query();
    const binding = bindings.data.find(
      (item) =>
        item.enabled &&
        item.selection.runtime === 'orvilo' &&
        item.selection.target === 'sandbox' &&
        item.model !== PROVIDER_CONFIG_ANCHOR_MODEL &&
        (!provider.model || item.model === provider.model),
    );
    if (
      !binding ||
      (
        await personalClient.providerBinding.checkConnection.mutate({
          id: binding.id,
          revision: binding.revision,
        })
      ).status !== 'ready'
    )
      throw new Error('PROVIDER_CHECK_UNAVAILABLE');
  }
  await client.workspaceUserSettings.updatePreference.mutate({ orchestratorAgentId: agentId });
};

export const getConfiguredOrchestratorRuntime = async (
  agentId: string,
  workspaceId: string | null,
  visibility: 'private' | 'public',
) => {
  const runtime = await createWorkspaceLambdaClient(
    workspaceId,
  ).agent.getAgentRuntimeForCreation.query({ agentId, purpose: 'orchestrator', visibility });
  return { ...runtime, agencyConfig: runtime.agencyConfig ?? undefined };
};

const listSavedAgents = async (client: ReturnType<typeof createWorkspaceLambdaClient>) => {
  const agents = [];
  for (let offset = 0; ; offset += 100) {
    const page = await client.agent.queryAgents.query({ limit: 100, offset });
    agents.push(...page);
    if (page.length < 100) return agents;
  }
};

export const listConfiguredOrchestrators = async (
  workspaceId: string | null,
  visibility: 'private' | 'public',
) => {
  const client = createWorkspaceLambdaClient(workspaceId);
  const [agents, devices, bindings] = await Promise.all([
    listSavedAgents(client),
    client.device.listDevices.query(),
    createWorkspaceLambdaClient(null).providerBinding.list.query(),
  ]);
  return Promise.all(
    agents.map(async (agent) => {
      try {
        const runtime = await getConfiguredOrchestratorRuntime(agent.id, workspaceId, visibility);
        return {
          agent,
          runtime,
          status: agentReadiness(
            runtime.agencyConfig,
            devices,
            bindings.data,
            getHostContext().kind === 'desktop',
            !!workspaceId,
          ),
        };
      } catch (cause) {
        const { status } = normalizeAsyncError(cause);
        if (status === 400 || status === 403 || status === 404 || status === 412)
          return { agent, runtime: undefined, status: 'unsupported' as const };
        throw cause;
      }
    }),
  );
};

/** Resume a transferred first Agent before consulting its pre-transfer personal scope. */
export const getOnboardingAgentConfig = async (agentId: string, workspaceId: string) => {
  try {
    const saved = await createWorkspaceLambdaClient(workspaceId).agent.getAgentConfigById.query({
      agentId,
    });
    if (saved) return saved;
  } catch (cause) {
    const { status } = normalizeAsyncError(cause);
    if (status !== 403 && status !== 404) throw cause;
  }
  return createWorkspaceLambdaClient(null).agent.getAgentConfigById.query({ agentId });
};
