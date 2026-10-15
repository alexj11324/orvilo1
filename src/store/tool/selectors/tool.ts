import { getBuiltinRenderDisplayControl } from '@orvilo/builtin-tools/displayControls';
import { type RenderDisplayControl, type ToolManifest } from '@orvilo/types';

import { isToolAvailableInCurrentEnv } from '@/helpers/toolAvailability';
import { type MetaData } from '@/types/meta';
import { type OrviloToolMeta } from '@/types/tool/tool';

import { type ToolStoreState } from '../initialState';
import { builtinToolSelectors } from '../slices/builtin/selectors';
import { orviloSkillStoreSelectors } from '../slices/orviloSkillStore';
import { pluginSelectors } from '../slices/plugin/selectors';

const metaList = (s: ToolStoreState): OrviloToolMeta[] => {
  const pluginList = pluginSelectors.installedPluginMetaList(s) as OrviloToolMeta[];
  const orviloSkillList = orviloSkillStoreSelectors.metaList(s) as OrviloToolMeta[];

  return builtinToolSelectors.metaList(s).concat(pluginList).concat(orviloSkillList);
};

/**
 * All installed discoverable tools across every source (builtins, plugins, skills).
 * Excludes only tools with `discoverable: false` (pure infrastructure / internal).
 * Includes hidden and runtime-managed builtins (web-browsing, memory, cloud-sandbox, etc.)
 * that `metaList` hides from the chat toolbar.
 */
const discoverableMetaList = (s: ToolStoreState): OrviloToolMeta[] => {
  const pluginList = pluginSelectors.installedPluginMetaList(s) as OrviloToolMeta[];
  const orviloSkillList = orviloSkillStoreSelectors.metaList(s) as OrviloToolMeta[];

  return builtinToolSelectors.discoverableMetaList(s).concat(pluginList).concat(orviloSkillList);
};

const getMetaById =
  (id: string) =>
  (s: ToolStoreState): MetaData | undefined => {
    const item = metaList(s).find((m) => m.identifier === id);

    if (!item) return;

    if (item.meta) return item.meta;

    return {
      avatar: item?.avatar,
      backgroundColor: item?.backgroundColor,
      description: item?.description,
      title: item?.title,
    };
  };

const getManifestById =
  (id: string) =>
  (s: ToolStoreState): ToolManifest | undefined =>
    pluginSelectors
      .installedPluginManifestList(s)
      .concat(s.builtinTools.map((b) => b.manifest as ToolManifest))
      .find((i) => i.identifier === id);

// Get plugin manifest loading status
const getManifestLoadingStatus = (id: string) => (s: ToolStoreState) => {
  const manifest = getManifestById(id)(s);

  if (s.pluginInstallLoading[id]) return 'loading';

  if (s.pluginInstallErrors[id]) return 'error';

  if (!manifest) return 'error';

  if (!!manifest) return 'success';
};

const getPluginInstallError = (id: string) => (s: ToolStoreState) => s.pluginInstallErrors[id];

const isToolHasUI = (id: string) => (s: ToolStoreState) => {
  const manifest = getManifestById(id)(s);
  if (!manifest) return false;
  const builtinTool = s.builtinTools.find((tool) => tool.identifier === id);

  if (builtinTool && builtinTool.type === 'builtin') {
    return true;
  }

  return !!manifest.ui;
};

/**
 * Get the renderDisplayControl configuration for a specific tool API
 * Only works for builtin tools, plugins don't support this feature yet
 * @param identifier - Tool identifier
 * @param apiName - API name
 * @param pluginState - The tool_result's plugin state, for APIs whose display
 *   control depends on what the result carries (e.g. CC `Read` renders a
 *   thumbnail for an image and source text for anything else). Undefined while
 *   the call is still in flight.
 * @returns RenderDisplayControl value, defaults to 'collapsed'
 */
const getRenderDisplayControl =
  (identifier: string, apiName: string, pluginState?: unknown) =>
  (s: ToolStoreState): RenderDisplayControl => {
    const builtinTool = s.builtinTools.find((t) => t.identifier === identifier);
    const manifestControl = builtinTool?.manifest.api.find(
      (a) => a.name === apiName,
    )?.renderDisplayControl;
    if (manifestControl) return manifestControl;

    // Fallback for packages that don't ship a Orvilo manifest (e.g. Claude Code —
    // its tools come from Anthropic tool_use blocks at runtime).
    return getBuiltinRenderDisplayControl(identifier, apiName, pluginState) ?? 'collapsed';
  };

export interface AvailableToolForDiscovery {
  description: string;
  identifier: string;
  name: string;
}

/** Internal builtin tools available for explicit activation. */
const availableToolsForDiscovery = (s: ToolStoreState): AvailableToolForDiscovery[] => {
  // Build exclusion sets for deduplication
  const builtinSkillIds = new Set((s.builtinSkills || []).map((skill) => skill.identifier));

  // 1. Builtin tools — directly from s.builtinTools
  const builtinItems = s.builtinTools
    .filter((tool) => tool.discoverable !== false)
    .filter((tool) => !builtinSkillIds.has(tool.identifier))
    .filter((tool) => isToolAvailableInCurrentEnv(tool.identifier))
    .map((tool) => ({
      description: tool.description || '',
      identifier: tool.identifier,
      name: tool.title || tool.identifier,
    }));

  return builtinItems;
};

export const toolSelectors = {
  availableToolsForDiscovery,
  discoverableMetaList,
  getManifestById,
  getManifestLoadingStatus,
  getPluginInstallError,
  getMetaById,
  getRenderDisplayControl,
  isToolHasUI,
  metaList,
};
