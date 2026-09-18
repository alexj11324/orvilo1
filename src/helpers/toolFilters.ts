/**
 * Shared tool filtering logic used across both runtime (ToolsEngine)
 * and display layer (selectors)
 */
import { AuvManifest } from '@orvilo/builtin-tool-auv';
import { LocalSystemManifest } from '@orvilo/builtin-tool-local-system';
import { isDesktop } from '@orvilo/const';

export interface ToolFilterContext {
  /**
   * Whether the *target execution device* can run device-bound executors
   * (Electron IPC on that device). Run-side callers derive this from the
   * execution plan; display-side callers pass `true` so tools configured for a
   * bound device stay visible regardless of the viewing client.
   *
   * Defaults to the viewer's own platform — correct only when the viewer is
   * also the executor (a local desktop run).
   */
  canExecuteOnDevice?: boolean;
}

/**
 * Check if a tool should be enabled based on the target device's capabilities
 * @param toolId - The tool identifier to check
 * @param context - Target-device capability context (see {@link ToolFilterContext})
 * @returns true if the tool should be enabled, false otherwise
 */
export const shouldEnableTool = (toolId: string, context: ToolFilterContext = {}): boolean => {
  // These executors call Electron IPC on the execution device; they cannot run
  // on a target that has no local transport (e.g. a device-less server run).
  if (toolId === LocalSystemManifest.identifier || toolId === AuvManifest.identifier) {
    return context.canExecuteOnDevice ?? isDesktop;
  }

  return true;
};

/**
 * Filter tool IDs based on target-device capabilities
 * @param toolIds - Array of tool identifiers to filter
 * @param context - Target-device capability context (see {@link ToolFilterContext})
 * @returns Filtered array of tool identifiers
 */
export const filterToolIds = (toolIds: string[], context: ToolFilterContext = {}): string[] => {
  return toolIds.filter((id) => shouldEnableTool(id, context));
};
