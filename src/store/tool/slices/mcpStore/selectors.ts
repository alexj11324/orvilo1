import { type ToolStoreState } from '../../initialState';

const isPluginInstallLoading = (id: string) => (s: ToolStoreState) => s.pluginInstallLoading[id];

const getMCPInstallProgress = (id: string) => (s: ToolStoreState) => s.mcpInstallProgress[id];

const isMCPInstalling = (id: string) => (s: ToolStoreState) => !!s.mcpInstallProgress[id];

const getMCPPluginRequiringConfig = (id: string) => (s: ToolStoreState) =>
  s.mcpInstallProgress[id]?.configSchema;

const isMCPPluginRequiringConfig = (id: string) => (s: ToolStoreState) =>
  !!s.mcpInstallProgress[id]?.configSchema;

// Check if plugin is installing (has install progress and not in config stage)
const isMCPInstallInProgress = (id: string) => (s: ToolStoreState) => {
  const progress = s.mcpInstallProgress[id];

  return !!progress && !progress.needsConfig && progress.step !== 'Error';
};

// Test connection related selectors
const isMCPConnectionTesting = (id: string) => (s: ToolStoreState) => s.mcpTestLoading[id] || false;

const getMCPConnectionTestError = (id: string) => (s: ToolStoreState) => s.mcpTestErrors[id];

const getMCPConnectionTestState = (id: string) => (s: ToolStoreState) => ({
  error: s.mcpTestErrors[id],
  loading: s.mcpTestLoading[id] || false,
});

export const mcpStoreSelectors = {
  getMCPConnectionTestError,
  getMCPConnectionTestState,
  getMCPInstallProgress,
  getMCPPluginRequiringConfig,
  isMCPConnectionTesting,
  isMCPInstallInProgress,
  isMCPInstalling,
  isMCPPluginRequiringConfig,
  isPluginInstallLoading,
};
