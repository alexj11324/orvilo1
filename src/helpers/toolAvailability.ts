import { isDesktop } from '@orvilo/const';

import { shouldEnableBuiltinSkill } from './skillFilters';
import { shouldEnableTool } from './toolFilters';

export interface ToolAvailabilityInstalledPlugin {
  customParams?: {
    mcp?: {
      type?: string;
    } | null;
  } | null;
  identifier: string;
}

export interface ToolAvailabilityContext {
  /**
   * Whether the *target execution device* can run device-bound executors
   * (Electron IPC on that device / stdio MCP on that host). Run-side callers
   * derive this from the execution plan; display-side callers pass `true` so
   * tools configured for a bound device stay visible regardless of the viewing
   * client. Defaults to the viewer's platform — correct only when the viewer
   * is also the executor (a local desktop run).
   */
  canExecuteOnDevice?: boolean;
  installedPlugins?: ToolAvailabilityInstalledPlugin[];
}

export const isBuiltinToolAvailableInCurrentEnv = (
  id: string,
  context: Pick<ToolAvailabilityContext, 'canExecuteOnDevice'> = {},
) => shouldEnableTool(id, { canExecuteOnDevice: context.canExecuteOnDevice });

export const isBuiltinSkillAvailableInCurrentEnv = (
  id: string,
  context: Pick<ToolAvailabilityContext, 'canExecuteOnDevice'> = {},
) => {
  if (context.canExecuteOnDevice === undefined) {
    return shouldEnableBuiltinSkill(id);
  }

  return shouldEnableBuiltinSkill(id, {
    canExecuteOnDevice: context.canExecuteOnDevice,
  });
};

export const isInstalledPluginAvailableInCurrentEnv = (
  plugin: ToolAvailabilityInstalledPlugin,
  context: Pick<ToolAvailabilityContext, 'canExecuteOnDevice'> = {},
) => (context.canExecuteOnDevice ?? isDesktop) || plugin.customParams?.mcp?.type !== 'stdio';

export const isToolAvailableInCurrentEnv = (id: string, context: ToolAvailabilityContext = {}) => {
  if (!isBuiltinToolAvailableInCurrentEnv(id, context)) return false;
  if (!isBuiltinSkillAvailableInCurrentEnv(id, context)) return false;

  const plugin = context.installedPlugins?.find((item) => item.identifier === id);

  if (!plugin) return true;

  return isInstalledPluginAvailableInCurrentEnv(plugin, context);
};

export const filterToolIdsByCurrentEnv = (ids: string[], context: ToolAvailabilityContext = {}) =>
  ids.filter((id) => isToolAvailableInCurrentEnv(id, context));
