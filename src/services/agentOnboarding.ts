import type { AgentItem, ProviderBinding } from '@orvilo/types';
import { PROVIDER_CONFIG_ANCHOR_MODEL, providerBindingConfigSchema } from '@orvilo/types';

import { createWorkspaceLambdaClient, lambdaClient } from '@/libs/trpc/client';

import { agentService, type CreateAgentParams, type CreateAgentResult } from './agent';
import { deviceService } from './device';
import { homeService } from './home';
import { providerBindingService } from './providerBinding';

export interface FirstAgentCreationCheckpoint {
  attempted?: boolean;
  requestId: string;
}

// AgentService preserves these database fields in its response, although its
// configuration-only return type omits the ownership metadata.
const belongsPrivatelyToWorkspace = (config: unknown, workspaceId: string) => {
  const ownership = config as Pick<AgentItem, 'workspaceId' | 'visibility'> | null;
  return ownership?.workspaceId === workspaceId && ownership.visibility === 'private';
};

/** Reconcile a committed row after a lost create response before trying again. */
export const createOnboardingAgentOnce = async (
  checkpoint: FirstAgentCreationCheckpoint,
  params: CreateAgentParams,
  createAgent: (params: CreateAgentParams) => Promise<CreateAgentResult>,
): Promise<CreateAgentResult & { config?: CreateAgentParams['config'] }> => {
  if (checkpoint.attempted) {
    const list = await homeService.getSidebarAgentList();
    const rows = [
      ...list.pinned,
      ...list.ungrouped,
      ...list.groups.flatMap((group) => group.items),
      ...list.privatePinned,
      ...list.privateUngrouped,
      ...list.privateGroups.flatMap((group) => group.items),
    ];
    const configurations = await Promise.all(
      rows.map((row) => agentService.getAgentConfigById(row.id)),
    );
    const existing = configurations.find(
      (config) =>
        (config?.params as Record<string, unknown> | undefined)?.onboardingCreateId ===
        checkpoint.requestId,
    );
    if (existing?.id) return { agentId: existing.id, config: existing };
  }
  checkpoint.attempted = true;
  const config = {
    ...params.config,
    params: { ...params.config?.params, onboardingCreateId: checkpoint.requestId },
  } as CreateAgentParams['config'];
  const result = await createAgent({ ...params, config });
  return { ...result, config };
};

export const getOnboardingWorkspaceAgent = async (agentId: string, workspaceId: string) => {
  const list = await createWorkspaceLambdaClient(workspaceId).home.getSidebarAgentList.query();
  const agents = [
    ...list.pinned,
    ...list.ungrouped,
    ...list.groups.flatMap((group) => group.items),
    ...list.privatePinned,
    ...list.privateUngrouped,
    ...list.privateGroups.flatMap((group) => group.items),
  ];
  const agent = agents.find((agent) => agent.id === agentId);
  if (!agent) return { agent: null };
  const config = await createWorkspaceLambdaClient(workspaceId).agent.getAgentConfigById.query({
    agentId,
  });
  // Workspace lists also contain personal agents. Presence alone does not
  // establish that the saved row belongs to the newly created workspace.
  return {
    agent: belongsPrivatelyToWorkspace(config, workspaceId) ? agent : null,
  };
};

/** Retry after a successful/lost transfer response reuses the same private row. */
export const verifyFirstAgentDevice = async (deviceId: string) => {
  const devices = await deviceService.listDevices();
  const device = devices.find(
    (device) => device.deviceId === deviceId && device.online && device.scope === 'personal',
  );
  if (!device) throw new Error('FIRST_AGENT_DEVICE_REQUIRED');
  return device;
};

export const firstPrimeAgentConfig = (model: string, deviceId: string) => ({
  agencyConfig: {
    executionTarget: 'device' as const,
    boundDeviceId: deviceId,
    heterogeneousProvider: { type: 'orvilo' as const, model },
  },
  title: 'Orvilo AI',
});

export interface FirstAgentHost {
  boundDeviceId?: string;
  executionTarget: 'device' | 'local';
}

export const ensureFirstAgentInWorkspace = async (
  agentId: string,
  workspaceId: string,
  host: FirstAgentHost,
) => {
  if (host.executionTarget === 'device') {
    if (!host.boundDeviceId) throw new Error('FIRST_AGENT_DEVICE_REQUIRED');
    await verifyFirstAgentDevice(host.boundDeviceId);
  }
  const existing = await getOnboardingWorkspaceAgent(agentId, workspaceId);
  const workspaceClient = createWorkspaceLambdaClient(workspaceId);
  const config = existing.agent
    ? await workspaceClient.agent.getAgentConfigById.query({ agentId })
    : await agentService.getAgentConfigById(agentId);
  if (!config?.agencyConfig?.heterogeneousProvider) throw new Error('FIRST_AGENT_REQUIRED');
  if (config.agencyConfig.heterogeneousProvider.type === 'orvilo') {
    if (host.executionTarget !== 'device') throw new Error('FIRST_AGENT_DEVICE_REQUIRED');
    const model = config.agencyConfig.heterogeneousProvider.model;
    const bindings = await providerBindingService.list();
    const binding = bindings.data.find(
      (row) =>
        row.enabled &&
        row.selection.runtime === 'orvilo' &&
        row.selection.target === 'sandbox' &&
        row.model !== PROVIDER_CONFIG_ANCHOR_MODEL &&
        (!model || row.model === model),
    );
    if (
      !binding ||
      (await providerBindingService.checkConnection(binding.id, binding.revision)).status !==
        'ready'
    )
      throw new Error('PROVIDER_CHECK_UNAVAILABLE');
  }
  if (!existing.agent) await agentService.transferAgent(agentId, workspaceId, 'private');
  const saved = await workspaceClient.agent.getAgentConfigById.query({ agentId });
  if (!belongsPrivatelyToWorkspace(saved, workspaceId))
    throw new Error('FIRST_AGENT_WORKSPACE_REQUIRED');
  await workspaceClient.workspaceUserSettings.updatePreference.mutate({
    agentDeviceOverrides: { [agentId]: host },
  });
};

export interface FirstAgentProviderCheckpoint {
  binding?: ProviderBinding;
  credentialId?: string;
}

/** Compose the existing personal encrypted credential and binding APIs. */
export const prepareFirstAgentProvider = async (
  input: { apiKey: string; endpoint: string; model: string },
  checkpoint: FirstAgentProviderCheckpoint,
) => {
  // Validate execution configuration before saving any secret.
  const config = providerBindingConfigSchema.parse({
    enabled: false,
    endpoint: input.endpoint,
    model: input.model,
    name: 'First agent provider',
    provider: 'openai',
    secretReference: `credential:${checkpoint.credentialId ?? 'cred_pending'}`,
    selection: { runtime: 'orvilo', target: 'sandbox' },
  });
  if (!input.apiKey.trim()) throw new Error('API_KEY_REQUIRED');
  if (config.model === PROVIDER_CONFIG_ANCHOR_MODEL) throw new Error('EXECUTION_MODEL_REQUIRED');

  if (!checkpoint.credentialId) {
    const result = await lambdaClient.creds.createKV.mutate({
      key: `first-agent-${crypto.randomUUID()}`,
      name: 'First agent API key',
      type: 'kv-env',
      values: { API_KEY: input.apiKey.trim() },
    });
    if (!result?.data?.id) throw new Error('CREDENTIAL_CREATE_FAILED');
    checkpoint.credentialId = result.data.id;
  } else {
    // Only edit the new credential this setup created, allowing a rejected key
    // to be corrected without duplicating or touching existing credentials.
    await lambdaClient.creds.update.mutate({
      id: checkpoint.credentialId,
      values: { API_KEY: input.apiKey.trim() },
    });
  }

  config.secretReference = `credential:${checkpoint.credentialId}`;
  const result = checkpoint.binding
    ? await providerBindingService.update(
        checkpoint.binding.id,
        checkpoint.binding.revision,
        config,
      )
    : await providerBindingService.create(config);
  checkpoint.binding = result.data;
  const check = await providerBindingService.checkConnection(result.data.id, result.data.revision);
  if (check.status !== 'ready') throw new Error('PROVIDER_CHECK_UNAVAILABLE');
  return result.data;
};
