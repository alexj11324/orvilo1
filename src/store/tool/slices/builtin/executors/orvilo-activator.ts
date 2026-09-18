/**
 * Orvilo Tools Executor
 *
 * Creates and exports the ActivatorExecutor instance for registration.
 * Resolves tool manifests from the tool store (installedPlugins + builtinTools +
 * orviloSkillServers + composio servers).
 *
 * State tracking (getActivatedToolIds / markActivated) is intentionally a no-op
 * because the activated state is persisted in message pluginState and accumulated
 * by selectActivatedToolIdsFromMessages at each agentic loop step.
 */
import { builtinSkills } from '@orvilo/builtin-skills';
import {
  ActivatorExecutionRuntime,
  type ActivatorRuntimeService,
  type ToolManifestInfo,
} from '@orvilo/builtin-tool-activator/executionRuntime';
import { ActivatorExecutor } from '@orvilo/builtin-tool-activator/executor';
import { SkillsExecutionRuntime } from '@orvilo/builtin-tool-skills/executionRuntime';

import { filterBuiltinSkills } from '@/helpers/skillFilters';
import { agentSkillService } from '@/services/skill';
import { getToolStoreState } from '@/store/tool';
import { toolSelectors } from '@/store/tool/selectors/tool';
import { OrviloSkillStatus } from '@/store/tool/slices/orviloSkillStore';

const skillsRuntime = new SkillsExecutionRuntime({
  builtinSkills: filterBuiltinSkills(builtinSkills),
  service: {
    findAll: () => agentSkillService.list(),
    findById: (id) => agentSkillService.getById(id),
    findByName: (name) => agentSkillService.getByName(name),
    readResource: (id, path) => agentSkillService.readResource(id, path),
  },
});

const service: ActivatorRuntimeService = {
  activateSkill: (args) => skillsRuntime.activateSkill(args),
  getActivatedToolIds: () => [],
  getToolManifests: async (identifiers: string[]): Promise<ToolManifestInfo[]> => {
    const s = getToolStoreState();

    // Only allow activation of tools that passed discovery filters
    // (discoverable, platform-available, not internal/hidden)
    const discoverable = new Set(
      toolSelectors.availableToolsForDiscovery(s).map((t) => t.identifier),
    );
    const allowedIds = identifiers.filter((id) => discoverable.has(id));

    const results: ToolManifestInfo[] = [];

    for (const id of allowedIds) {
      // Search builtin tools
      const builtin = s.builtinTools.find((t) => t.identifier === id);
      if (builtin) {
        results.push({
          apiDescriptions: builtin.manifest.api.map((a) => ({
            description: a.description,
            name: a.name,
          })),
          avatar: builtin.avatar,
          identifier: builtin.identifier,
          name: builtin.title ?? builtin.identifier,
          systemRole: builtin.manifest.systemRole,
        });
        continue;
      }

      // Search installed plugins
      const plugin = s.installedPlugins.find((p) => p.identifier === id);
      if (plugin?.manifest) {
        results.push({
          apiDescriptions: (plugin.manifest.api || []).map((a) => ({
            description: a.description,
            name: a.name,
          })),
          avatar: plugin.manifest.meta?.avatar,
          identifier: plugin.identifier,
          name: plugin.manifest.meta?.title ?? plugin.identifier,
          systemRole: plugin.manifest.systemRole,
        });
        continue;
      }

      // Search Orvilo Skill servers
      const orviloSkillServer = s.orviloSkillServers?.find(
        (server) => server.identifier === id && server.status === OrviloSkillStatus.CONNECTED,
      );
      if (orviloSkillServer?.tools) {
        results.push({
          apiDescriptions: orviloSkillServer.tools.map((t) => ({
            description: t.description || '',
            name: t.name,
          })),
          avatar: orviloSkillServer.icon,
          identifier: orviloSkillServer.identifier,
          name: orviloSkillServer.name,
        });
        continue;
      }
    }

    return results;
  },
  markActivated: () => {},
};

const runtime = new ActivatorExecutionRuntime({ service });

export const activatorExecutor = new ActivatorExecutor(runtime);
