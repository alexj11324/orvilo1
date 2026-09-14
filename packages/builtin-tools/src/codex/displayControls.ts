import type { RenderDisplayControl } from '@orvilo/types';

export const CodexRenderDisplayControls: Record<string, RenderDisplayControl> = {
  collab_tool_call: 'expand',
  command_execution: 'collapsed',
  file_change: 'collapsed',
  mcp_tool_call: 'collapsed',
  todo_list: 'expand',
  web_search: 'collapsed',
};
