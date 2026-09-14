/**
 * Shared tool filtering logic used across both runtime (ToolsEngine)
 * and display layer (selectors)
 */
import { AuvManifest } from '@orvilo/builtin-tool-auv';
import { LocalSystemManifest } from '@orvilo/builtin-tool-local-system';
import { isDesktop } from '@orvilo/const';

/**
 * Check if a tool should be enabled based on platform-specific constraints
 * @param toolId - The tool identifier to check
 * @returns true if the tool should be enabled, false otherwise
 */
export const shouldEnableTool = (toolId: string): boolean => {
  // These executors call Electron IPC and cannot run in a plain web client.
  if (toolId === LocalSystemManifest.identifier || toolId === AuvManifest.identifier) {
    return isDesktop;
  }

  return true;
};

/**
 * Filter tool IDs based on platform constraints
 * @param toolIds - Array of tool identifiers to filter
 * @returns Filtered array of tool identifiers
 */
export const filterToolIds = (toolIds: string[]): string[] => {
  return toolIds.filter(shouldEnableTool);
};
