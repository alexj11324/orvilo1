import { builtinSkillManifests } from '@orvilo/builtin-skills/manifests';
import { builtinTools, defaultUninstalledBuiltinTools } from '@orvilo/builtin-tools';
import { type BuiltinSkillManifest, type OrviloBuiltinTool } from '@orvilo/types';

import { filterBuiltinSkills } from '@/helpers/skillFilters';

export interface BuiltinToolState {
  builtinSkills: BuiltinSkillManifest[];
  builtinToolLoading: Record<string, boolean>;
  builtinTools: OrviloBuiltinTool[];
  /**
   * List of uninstalled builtin tool identifiers
   * Empty array means all builtin tools are enabled
   */
  uninstalledBuiltinTools: string[];
  /**
   * Loading state for fetching uninstalled builtin tools
   */
  uninstalledBuiltinToolsLoading: boolean;
}

export const initialBuiltinToolState: BuiltinToolState = {
  builtinSkills: filterBuiltinSkills(builtinSkillManifests),
  builtinToolLoading: {},
  builtinTools,
  uninstalledBuiltinTools: defaultUninstalledBuiltinTools,
  uninstalledBuiltinToolsLoading: true,
};
