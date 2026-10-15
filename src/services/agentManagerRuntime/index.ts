import type { AgentManagerCapabilities, IAgentService } from '@orvilo/agent-manager-runtime';

import { getAgentStoreState } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors/selectors';
import { getAiInfraStoreState } from '@/store/aiInfra';
import { getToolStoreState } from '@/store/tool';
import { pluginSelectors } from '@/store/tool/selectors';

import { ClientPluginInstaller } from './pluginInstaller';

/** Bind the shared runtime to browser state at the application composition boundary. */
export const createClientAgentManagerCapabilities = (
  agentService: Pick<IAgentService, 'getAgentConfigById'>,
): AgentManagerCapabilities => ({
  agents: {
    ensureLoaded: async (agentId) => {
      if (getAgentStoreState().agentMap[agentId]) return;
      const config = await agentService.getAgentConfigById(agentId);
      if (config) getAgentStoreState().internal_dispatchAgentMap(agentId, config);
    },
    getConfig: (agentId) => agentSelectors.getAgentConfigById(agentId)(getAgentStoreState()),
    getMeta: (agentId) => agentSelectors.getAgentMetaById(agentId)(getAgentStoreState()),
    updateConfig: (agentId, config) =>
      getAgentStoreState().optimisticUpdateAgentConfig(agentId, config),
    updateMeta: (agentId, meta) => getAgentStoreState().optimisticUpdateAgentMeta(agentId, meta),
    startStreamingSystemRole: (agentId) => getAgentStoreState().startStreamingSystemRole(agentId),
    appendStreamingSystemRole: (agentId, generation, chunk) =>
      getAgentStoreState().appendStreamingSystemRole(agentId, generation, chunk),
    finishStreamingSystemRole: (agentId, generation) =>
      getAgentStoreState().finishStreamingSystemRole(agentId, generation),
  },
  getAvailableModels: async () =>
    (getAiInfraStoreState().enabledChatModelList || []).map((provider) => ({
      id: provider.id,
      name: provider.name,
      models: provider.children.map((model) => ({
        abilities: model.abilities
          ? {
              files: model.abilities.files,
              functionCall: model.abilities.functionCall,
              reasoning: model.abilities.reasoning,
              vision: model.abilities.vision,
            }
          : undefined,
        description: model.description,
        id: model.id,
        name: model.displayName || model.id,
      })),
    })),
  isPluginInstalled: (identifier) =>
    pluginSelectors.isPluginInstalled(identifier)(getToolStoreState()),
  installPlugin: (agentId, params, enablePlugin) =>
    new ClientPluginInstaller((_agentId, pluginId) => enablePlugin(pluginId)).installPlugin(
      agentId,
      params,
    ),
});
