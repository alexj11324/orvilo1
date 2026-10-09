import { MCP_PRESET_CONNECTORS } from '@orvilo/const';

// Keep the preset catalog focused while preserving any previously installed
// connectors for the other services in the Custom Connectors section.
export const visibleMcpPresets = MCP_PRESET_CONNECTORS.filter((preset) =>
  ['github', 'linear'].includes(preset.id),
);
